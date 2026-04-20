import { describe, test, expect } from "bun:test";
import { c } from "../";

const tick = () => Promise.resolve();
/** suspend() adds one extra microtask layer; settle needs 2 ticks for
 *  non-async fns returning suspend promises, 3 for async fns. */
const settle = () => tick().then(tick).then(tick);

describe("async", () => {
    describe("promise", () => {
        test("is loading while the promise is pending", async () => {
            let resolve;
            const c1 = c.task((c) => {
                return c.suspend(new Promise(r => { resolve = r; }));
            });

            expect(c1.loading()).toBe(true);

            resolve(42);
            await settle();

            expect(c1.loading()).toBe(false);
        });

        test("returns seed value while loading", async () => {
            let resolve;
            const c1 = c.task((c) => {
                return c.suspend(new Promise(r => { resolve = r; }));
            }, 0);

            expect(c1.peek()).toBe(0);
            expect(c1.loading()).toBe(true);

            resolve(99);
            await settle();

            expect(c1.peek()).toBe(99);
            expect(c1.loading()).toBe(false);
        });

        test("settles to the resolved value", async () => {
            const c1 = c.task((c) => {
                return c.suspend(Promise.resolve(42));
            });

            expect(c1.loading()).toBe(true);
            await settle();

            expect(c1.peek()).toBe(42);
            expect(c1.loading()).toBe(false);
            expect(c1.error()).toBe(false);
        });

        test("sets error flag on rejection", async () => {
            const c1 = c.task((c) => {
                return c.suspend(Promise.reject(new Error("async error")));
            });

            await settle();

            expect(c1.error()).toBe(true);
            expect(c1.loading()).toBe(false);
        });

        test("rethrows the error when read after rejection", async () => {
            const c1 = c.task((c) => {
                return c.suspend(Promise.reject(new Error("async error")));
            });

            await settle();

            expect(() => c1.peek()).toThrow("async error");
        });

        test("clears error on subsequent successful resolution", async () => {
            const s1 = c.signal(true);
            const c1 = c.task(c => {
                return c.val(s1)
                    ? c.suspend(Promise.reject(new Error("fail")))
                    : c.suspend(Promise.resolve(42));
            });

            await settle();
            expect(c1.error()).toBe(true);

            s1.set(false);
            c1.peek(); // Pull to trigger re-evaluation
            await settle();

            expect(c1.error()).toBe(false);
            expect(c1.peek()).toBe(42);
        });

        test("notifies downstream effect when promise settles", async () => {
            const c1 = c.task((c) => {
                return c.suspend(Promise.resolve(42));
            });
            let received = void 0;

            c.effect(c => { received = c.val(c1); });

            expect(received).toBeUndefined(); // seed while loading
            await settle();

            expect(received).toBe(42);
        });

        test("ignores stale promise when signal updates before it resolves", async () => {
            const resolvers = [];
            const s1 = c.signal(0);

            const c1 = c.task(c => {
                const v = c.val(s1);
                return c.suspend(new Promise(r => { resolvers[v] = r; }));
            });

            // Trigger a second promise by updating the signal
            s1.set(1);
            c1.peek(); // Pull to trigger re-evaluation with new signal value

            // Resolve the stale (first) promise — should be ignored
            resolvers[0](100);
            await settle();

            expect(c1.loading()).toBe(true); // still loading; second promise not yet resolved

            // Resolve the current (second) promise
            resolvers[1](200);
            await settle();

            expect(c1.peek()).toBe(200);
            expect(c1.loading()).toBe(false);
        });
    });

    describe("async iterator", () => {
        test("is loading before the first yield", () => {
            let resolver;
            const iter = {
                [Symbol.asyncIterator]() { return this; },
                next() { return new Promise(r => { resolver = r; }); }
            };

            const c1 = c.task(() => { return iter; });

            expect(c1.loading()).toBe(true);
            expect(c1.peek()).toBeUndefined();

            // prevent unhandled-rejection noise from a never-resolved promise
            resolver({ done: true });
        });

        test("settles on each yielded value and notifies downstream", async () => {
            const resolvers = [];
            const iter = {
                [Symbol.asyncIterator]() { return this; },
                next() { return new Promise(r => resolvers.push(r)); },
                return() { return Promise.resolve({ done: true }); }
            };

            const c1 = c.task(() => { return iter; });
            const values = [];

            c.effect(c => {
                const v = c.val(c1);
                if (!c1.loading()) {
                    values.push(v);
                }
            });

            resolvers[0]({ value: 1, done: false });
            await tick();
            expect(values).toEqual([1]);

            resolvers[1]({ value: 2, done: false });
            await tick();
            expect(values).toEqual([1, 2]);

            resolvers[2]({ value: 3, done: false });
            await tick();
            expect(values).toEqual([1, 2, 3]);
        });

        test("is not loading after first yield", async () => {
            let resolver;
            const iter = {
                [Symbol.asyncIterator]() { return this; },
                next() { return new Promise(r => { resolver = r; }); },
                return() { return Promise.resolve({ done: true }); }
            };

            const c1 = c.task(() => { return iter; });

            expect(c1.loading()).toBe(true);

            resolver({ value: 42, done: false });
            await tick();

            expect(c1.loading()).toBe(false);
            expect(c1.peek()).toBe(42);
        });

        test("sets error flag when the iterator rejects", async () => {
            async function* failing() {
                throw new Error("iterator error");
            }

            const c1 = c.task(() => { return failing(); });

            await tick();

            expect(c1.error()).toBe(true);
            expect(() => c1.peek()).toThrow("iterator error");
        });

        test("calls return() on the stale iterator when it next yields", async () => {
            let resolveStale;
            let returnCalled = false;

            const staleIter = {
                [Symbol.asyncIterator]() { return this; },
                next() { return new Promise(r => { resolveStale = r; }); },
                return() {
                    returnCalled = true;
                    return Promise.resolve({ value: undefined, done: true });
                }
            };

            const s1 = c.signal(true);
            const c1 = c.task(c => {
                if (c.val(s1)) {
                    return staleIter;
                }
                return (async function* () { yield 99; })();
            });

            s1.set(false);
            c1.peek();
            await tick();
            await tick();

            expect(c1.peek()).toBe(99);

            resolveStale({ value: 42, done: false });
            await tick();

            expect(returnCalled).toBe(true);
            expect(c1.peek()).toBe(99);
        });
    });

    describe("context", () => {
        test("reads a signal before and after await", async () => {
            const s1 = c.signal(1);
            const s2 = c.signal(10);
            const c1 = c.task(async (c) => {
                let a = c.val(s1);
                await c.suspend(tick());
                let b = c.val(s2);
                return a + b;
            });
            await settle();
            expect(c1.peek()).toBe(11);
        });

        test("re-runs when a dep added post-await changes", async () => {
            const s1 = c.signal(1);
            const s2 = c.signal(10);
            let runs = 0;
            const c1 = c.task(async (c) => {
                runs++;
                c.val(s1);
                await c.suspend(tick());
                return c.val(s2);
            });
            await settle();
            expect(c1.peek()).toBe(10);
            expect(runs).toBe(1);

            s2.set(20);
            c1.peek();
            await settle();
            expect(c1.peek()).toBe(20);
            expect(runs).toBe(2);
        });

        test("tear-down: stale dep is not re-subscribed if not re-read", async () => {
            const s1 = c.signal(true);
            const sA = c.signal('a');
            const sB = c.signal('b');
            let runs = 0;
            const c1 = c.task(async (c) => {
                runs++;
                let sel = c.val(s1);
                await c.suspend(tick());
                return sel ? c.val(sA) : c.val(sB);
            });
            await settle();
            expect(c1.peek()).toBe('a');

            // sB is not a current dep — changing it must NOT trigger a re-run.
            sB.set('B');
            await tick();
            expect(runs).toBe(1);

            // Flip: now sB becomes the dep, sA is torn down.
            s1.set(false);
            c1.peek();
            await settle();
            expect(c1.peek()).toBe('B');
            expect(runs).toBe(2);

            // sA no longer a dep.
            sA.set('AA');
            await tick();
            expect(runs).toBe(2);
        });

        test("duplicate reads in same sync chunk are cleaned by checkDeps", async () => {
            const s1 = c.signal(5);
            let runs = 0;
            const c1 = c.task(async (c) => {
                runs++;
                let sum = 0;
                for (let i = 0; i < 10; i++) {
                    sum += c.val(s1);
                }
                await c.suspend(tick());
                return sum;
            });
            await settle();
            expect(c1.peek()).toBe(50);
            expect(runs).toBe(1);

            s1.set(6);
            c1.peek();
            await settle();
            expect(c1.peek()).toBe(60);
            expect(runs).toBe(2);

            c1.dispose();
            const c2 = c.compute(c => c.val(s1) + 1);
            expect(c2.peek()).toBe(7);
            s1.set(7);
            expect(c2.peek()).toBe(8);
        });

        test("cross-compute pollution: same signal read twice across await is deduped", async () => {
            const s1 = c.signal(1);
            const s2 = c.signal(10);
            const c0 = c.compute(c => c.val(s2) * 100);
            expect(c0.peek()).toBe(1000);

            let runs = 0;
            const c1 = c.task(async (c) => {
                runs++;
                c.val(s1);
                c.val(s2);
                await c.suspend(tick());
                return c.val(s2);
            });
            await settle();
            expect(c1.peek()).toBe(10);
            expect(runs).toBe(1);

            s2.set(20);
            c1.peek();
            await settle();
            expect(c1.peek()).toBe(20);
            expect(runs).toBe(2);

            c1.dispose();
            const c2 = c.compute(c => c.val(s2));
            expect(c2.peek()).toBe(20);
            s2.set(21);
            expect(c2.peek()).toBe(21);
        });

        test("captured context is the node itself", async () => {
            const s1 = c.signal(1);
            let captured;
            const c1 = c.task(async (c) => {
                if (captured === undefined) {
                    captured = c;
                }
                await c.suspend(tick());
                return c.val(s1);
            });
            await settle();
            expect(c1.peek()).toBe(1);
            /** Without Reader, captured context IS the node object. */
            expect(captured).toBe(c1);
        });

        test("task with bound signal dependency", async () => {
            const s1 = c.signal(5);
            const c1 = c.task(s1, async (val, c) => {
                return await c.suspend(Promise.resolve(val * 2));
            });
            await settle();
            expect(c1.peek()).toBe(10);

            s1.set(6);
            c1.peek();
            await settle();
            expect(c1.peek()).toBe(12);
        });

        test("spawn with bound signal dependency", async () => {
            const s1 = c.signal(1);
            let observed = null;
            c.spawn(s1, async (val, c) => {
                observed = await c.suspend(Promise.resolve(val));
            });
            await settle();
            expect(observed).toBe(1);

            s1.set(2);
            await settle();
            expect(observed).toBe(2);
        });

        test("dynamic spawn: reads signals across await in an effect", async () => {
            const s1 = c.signal(1);
            const s2 = c.signal(10);
            let observed = null;
            c.spawn(async (c) => {
                let a = c.val(s1);
                await c.suspend(tick());
                let b = c.val(s2);
                observed = a + b;
            });
            await settle();
            expect(observed).toBe(11);

            s2.set(20);
            await settle();
            expect(observed).toBe(21);
        });
    });

    describe("stable context", () => {
        test("c.stable(): post-stable reads do not register new deps", async () => {
            const s1 = c.signal(1);
            const s2 = c.signal(10);
            let runs = 0;
            const c1 = c.task(async (c) => {
                runs++;
                const v1 = c.val(s1);
                c.stable();
                const v2 = c.val(s2);
                await c.suspend(tick());
                return v1 + v2;
            });
            await settle();
            expect(c1.peek()).toBe(11);
            expect(runs).toBe(1);

            s2.set(99);
            await tick();
            expect(runs).toBe(1);
        });

        test("c.stable(): pre-stable reads stay tracked and trigger reruns", async () => {
            const s1 = c.signal(1);
            const s2 = c.signal(10);
            let runs = 0;
            const c1 = c.task(async (c) => {
                runs++;
                const v1 = c.val(s1);
                c.stable();
                const v2 = c.val(s2);
                await c.suspend(tick());
                return v1 + v2;
            });
            await settle();
            expect(c1.peek()).toBe(11);

            s1.set(2);
            c1.peek();
            await settle();
            expect(c1.peek()).toBe(12);
            expect(runs).toBe(2);
        });

        test("c.equal() is callable on the context and propagates to node", async () => {
            const src = c.signal(0);
            const c1 = c.task(async (c) => {
                const v = c.val(src);
                c.equal(true);
                await c.suspend(tick());
                return v;
            });
            await settle();
            expect(c1.peek()).toBe(0);
        });

        test("c.stable() on spawn()", async () => {
            const s1 = c.signal(1);
            const s2 = c.signal(100);
            let runs = 0;
            let observed;
            c.spawn(async (c) => {
                runs++;
                const v1 = c.val(s1);
                c.stable();
                const v2 = c.val(s2);
                await c.suspend(tick());
                observed = v1 + v2;
            });
            await settle();
            expect(observed).toBe(101);
            expect(runs).toBe(1);

            s2.set(200); // not tracked
            await tick();
            expect(runs).toBe(1);

            s1.set(2); // tracked
            await settle();
            expect(observed).toBe(202);
            expect(runs).toBe(2);
        });

        test("c.stable() before any reads: node goes dormant", async () => {
            const s1 = c.signal(1);
            let runs = 0;
            const c1 = c.task(async (c) => {
                runs++;
                c.stable();
                const v = c.val(s1);
                await c.suspend(tick());
                return v;
            });
            await settle();
            expect(c1.peek()).toBe(1);
            expect(runs).toBe(1);

            s1.set(2);
            await tick();
            expect(runs).toBe(1);
            expect(c1.peek()).toBe(1);
        });
    });

    describe("loading suppresses downstream", () => {
        test("effect does not re-run when a task dependency changes while loading", async () => {
            let resolve1, resolve2;
            const s1 = c.signal(1);
            let taskRuns = 0;
            const c1 = c.task((c) => {
                taskRuns++;
                const v = c.val(s1);
                if (v === 1) {
                    return c.suspend(new Promise(r => { resolve1 = r; }));
                }
                return c.suspend(new Promise(r => { resolve2 = r; }));
            }, 0);
            let effectRuns = 0;

            c.effect(c => {
                c.val(c1);
                effectRuns++;
            });

            expect(effectRuns).toBe(1);
            expect(c1.loading()).toBe(true);
            expect(taskRuns).toBe(1);

            /**
             * Update s1 while the task is still loading. The task
             * re-executes (fires a new promise), but the downstream
             * effect must NOT be notified because the task is still
             * loading — its value hasn't settled yet.
             */
            s1.set(2);
            await tick();

            expect(taskRuns).toBe(2);
            expect(effectRuns).toBe(1);

            resolve2(42);
            await tick();

            /** Now the task has settled — the effect should run. */
            expect(effectRuns).toBe(2);
        });

        test("chained computes: intermediate task loading blocks downstream effect", async () => {
            let resolve;
            const s1 = c.signal(1);
            const c1 = c.task((c) => {
                const v = c.val(s1);
                return c.suspend(new Promise(r => { resolve = r; }));
            }, 0);
            const c2 = c.compute(c => c.val(c1) * 10);
            let runs = 0;
            let observed = void 0;

            c.effect(c => {
                observed = c.val(c2);
                runs++;
            });

            expect(runs).toBe(1);
            expect(observed).toBe(0);

            /** Changing s1 while task is loading should not propagate. */
            s1.set(2);
            await tick();

            expect(runs).toBe(1);

            resolve(5);
            await tick();

            expect(runs).toBe(2);
            expect(observed).toBe(50);
        });

        test("multiple dep changes while loading do not cause multiple effect runs", async () => {
            let resolve;
            const s1 = c.signal(1);
            const s2 = c.signal(10);
            const c1 = c.task((c) => {
                const a = c.val(s1);
                const b = c.val(s2);
                return c.suspend(new Promise(r => { resolve = r; }));
            }, 0);
            let runs = 0;

            c.effect(c => {
                c.val(c1);
                runs++;
            });

            expect(runs).toBe(1);

            /**
             * Two dependency updates while loading — neither should
             * cause an extra effect run.
             */
            s1.set(2);
            await tick();
            s2.set(20);
            await tick();

            expect(runs).toBe(1);

            resolve(99);
            await tick();

            expect(runs).toBe(2);
        });
    });
    describe("suspend", () => {
        test("resolves value when node is still alive", async () => {
            const c1 = c.task(async (c) => {
                const val = await c.suspend(Promise.resolve(42));
                return val;
            });
            await settle();
            expect(c1.peek()).toBe(42);
        });

        test("never resumes when node is disposed", async () => {
            let continued = false;
            let resolve;
            const c1 = c.task(async (c) => {
                await c.suspend(new Promise(r => { resolve = r; }));
                continued = true;
                return 99;
            });

            c1.dispose();
            resolve(42);
            await settle();

            expect(continued).toBe(false);
        });

        test("never resumes when node re-runs (stale activation)", async () => {
            const s1 = c.signal(1);
            let firstContinued = false;
            let firstResolve;
            let runs = 0;

            const c1 = c.task(async (c) => {
                runs++;
                const v = c.val(s1);
                if (runs === 1) {
                    await c.suspend(new Promise(r => { firstResolve = r; }));
                    firstContinued = true;
                    return v;
                }
                return await c.suspend(Promise.resolve(v * 10));
            });

            expect(c1.loading()).toBe(true);
            expect(runs).toBe(1);

            s1.set(2);
            c1.peek();
            await settle();

            expect(runs).toBe(2);
            expect(c1.peek()).toBe(20);

            firstResolve(999);
            await settle();

            expect(firstContinued).toBe(false);
            expect(c1.peek()).toBe(20);
        });

        test("throws ASSERT_SUSPEND when async fn returns promise without suspend", () => {
            expect(() => {
                c.task(() => {
                    return Promise.resolve(42);
                });
            }).toThrow("Async node must call c.suspend() on all awaited promises");
        });

        test("suspend propagates rejections when node is current", async () => {
            const c1 = c.task(async (c) => {
                return await c.suspend(Promise.reject(new Error("boom")));
            });
            await settle();

            expect(c1.error()).toBe(true);
            expect(() => c1.peek()).toThrow("boom");
        });

        test("suspend works with bound task", async () => {
            const s1 = c.signal(5);
            const c1 = c.task(s1, async (val, c) => {
                const result = await c.suspend(Promise.resolve(val + 1));
                return result;
            });
            await settle();
            expect(c1.peek()).toBe(6);

            s1.set(10);
            c1.peek();
            await settle();
            expect(c1.peek()).toBe(11);
        });

        test("suspend works with spawn", async () => {
            let observed = null;
            c.spawn(async (c) => {
                observed = await c.suspend(Promise.resolve(42));
            });
            await settle();
            expect(observed).toBe(42);
        });
    });
});