import { describe, test, expect } from "bun:test";
import { c, OPT_STABLE } from "../";

const tick = () => Promise.resolve();

describe("async", () => {
    describe("promise", () => {
        test("is loading while the promise is pending", async () => {
            let resolve;
            const c1 = c.task(() => { return new Promise(r => { resolve = r; }); });

            expect(c1.loading()).toBe(true);

            resolve(42);
            await tick();

            expect(c1.loading()).toBe(false);
        });

        test("returns seed value while loading", async () => {
            let resolve;
            const c1 = c.task(() => { return new Promise(r => { resolve = r; }); }, 0);

            expect(c1.peek()).toBe(0);
            expect(c1.loading()).toBe(true);

            resolve(99);
            await tick();

            expect(c1.peek()).toBe(99);
            expect(c1.loading()).toBe(false);
        });

        test("settles to the resolved value", async () => {
            const c1 = c.task(() => { return Promise.resolve(42); });

            expect(c1.loading()).toBe(true);
            await tick();

            expect(c1.peek()).toBe(42);
            expect(c1.loading()).toBe(false);
            expect(c1.error()).toBe(false);
        });

        test("sets error flag on rejection", async () => {
            const c1 = c.task(() => { return Promise.reject(new Error("async error")); });

            await tick();

            expect(c1.error()).toBe(true);
            expect(c1.loading()).toBe(false);
        });

        test("rethrows the error when read after rejection", async () => {
            const c1 = c.task(() => { return Promise.reject(new Error("async error")); });

            await tick();

            expect(() => c1.peek()).toThrow("async error");
        });

        test("clears error on subsequent successful resolution", async () => {
            const s1 = c.signal(true);
            const c1 = c.task(c => {
                return c.val(s1)
                    ? Promise.reject(new Error("fail"))
                    : Promise.resolve(42);
            });

            await tick();
            expect(c1.error()).toBe(true);

            s1.set(false);
            c1.peek(); // Pull to trigger re-evaluation
            await tick();

            expect(c1.error()).toBe(false);
            expect(c1.peek()).toBe(42);
        });

        test("notifies downstream effect when promise settles", async () => {
            const c1 = c.task(() => { return Promise.resolve(42); });
            let received = void 0;

            c.effect(c => { received = c.val(c1); });

            expect(received).toBeUndefined(); // seed while loading
            await tick();

            expect(received).toBe(42);
        });

        test("ignores stale promise when signal updates before it resolves", async () => {
            const resolvers = [];
            const s1 = c.signal(0);

            const c1 = c.task(c => {
                const v = c.val(s1);
                return new Promise(r => { resolvers[v] = r; });
            });

            // Trigger a second promise by updating the signal
            s1.set(1);
            c1.peek(); // Pull to trigger re-evaluation with new signal value

            // Resolve the stale (first) promise — should be ignored
            resolvers[0](100);
            await tick();

            expect(c1.loading()).toBe(true); // still loading; second promise not yet resolved

            // Resolve the current (second) promise
            resolvers[1](200);
            await tick();

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

            // Always call c1.peek() so the effect subscribes to c1 as a dependency;
            // without this, c1 is never tracked and the effect won't re-run on settle.
            c.effect(c => {
                const v = c.val(c1);
                if (!c1.loading()) {
                    values.push(v);
                }
            });

            // Each resolver[n] is created by the previous onNext calling iterator.next()
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

            // An iterator whose first next() won't resolve until we manually trigger it
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
                return (async function*() { yield 99; })();
            });

            // Signal update — c1 re-runs, picks up the new generator; staleIter is now stale
            s1.set(false);
            c1.peek(); // Pull to trigger re-evaluation
            // Async generators need 2 microtask steps to resolve a yield in JSC/Bun
            await tick();
            await tick();

            expect(c1.peek()).toBe(99);

            // staleIter's pending next() now resolves — return() must be called
            resolveStale({ value: 42, done: false });
            await tick();

            expect(returnCalled).toBe(true);
            expect(c1.peek()).toBe(99); // value unchanged by the stale yield
        });
    });

    describe("context", () => {
        test("reads a signal before and after await", async () => {
            const s1 = c.signal(1);
            const s2 = c.signal(10);
            const c1 = c.task(async (c) => {
                let a = c.val(s1);
                await tick();
                let b = c.val(s2);
                return a + b;
            });
            await tick();
            await tick();
            expect(c1.peek()).toBe(11);
        });

        test("re-runs when a dep added post-await changes", async () => {
            const s1 = c.signal(1);
            const s2 = c.signal(10);
            let runs = 0;
            const c1 = c.task(async (c) => {
                runs++;
                c.val(s1);
                await tick();
                return c.val(s2);
            });
            await tick();
            await tick();
            expect(c1.peek()).toBe(10);
            expect(runs).toBe(1);

            s2.set(20);
            c1.peek();
            await tick();
            await tick();
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
                await tick();
                return sel ? c.val(sA) : c.val(sB);
            });
            await tick();
            await tick();
            expect(c1.peek()).toBe('a');

            // sB is not a current dep — changing it must NOT trigger a re-run.
            sB.set('B');
            await tick();
            expect(runs).toBe(1);

            // Flip: now sB becomes the dep, sA is torn down.
            s1.set(false);
            c1.peek();
            await tick();
            await tick();
            expect(c1.peek()).toBe('B');
            expect(runs).toBe(2);

            // sA no longer a dep.
            sA.set('AA');
            await tick();
            expect(runs).toBe(2);
        });

        test("duplicate reads in same sync chunk are deduped", async () => {
            const s1 = c.signal(5);
            let runs = 0;
            const c1 = c.task(async (c) => {
                runs++;
                let sum = 0;
                // Read s1 ten times in the same sync chunk.
                for (let i = 0; i < 10; i++) {
                    sum += c.val(s1);
                }
                return sum;
            });
            await tick();
            await tick();
            expect(c1.peek()).toBe(50);
            expect(runs).toBe(1);

            s1.set(6);
            c1.peek();
            await tick();
            await tick();
            expect(c1.peek()).toBe(60);
            expect(runs).toBe(2);

            // Disposing c1 unsubscribes exactly once from s1 (if duplicates
            // leaked, clearDeps would over-release). Then a fresh compute on
            // s1 must still work — sanity check that s1's sub graph isn't
            // corrupt.
            c1.dispose();
            const c2 = c.compute(c => c.val(s1) + 1);
            expect(c2.peek()).toBe(7);
            s1.set(7);
            expect(c2.peek()).toBe(8);
        });

        test("cross-compute pollution: same signal read twice across await is deduped", async () => {
            const s1 = c.signal(1);
            const s2 = c.signal(10);
            // Unrelated compute also reading s2 — its first read sets s2._version.
            const c0 = c.compute(c => c.val(s2) * 100);
            expect(c0.peek()).toBe(1000);

            let runs = 0;
            const c1 = c.task(async (c) => {
                runs++;
                c.val(s1);
                c.val(s2);
                await tick();
                return c.val(s2);
            });
            await tick();
            await tick();
            expect(c1.peek()).toBe(10);
            expect(runs).toBe(1);

            s2.set(20);
            c1.peek();
            await tick();
            await tick();
            expect(c1.peek()).toBe(20);
            expect(runs).toBe(2);

            // Sanity: dispose c1, a fresh compute on s2 must still work
            c1.dispose();
            const c2 = c.compute(c => c.val(s2));
            expect(c2.peek()).toBe(20);
            s2.set(21);
            expect(c2.peek()).toBe(21);
        });

        test("disposed context throws on val after node re-updates", async () => {
            const s1 = c.signal(1);
            let captured;
            const c1 = c.task(async (c) => {
                if (captured === undefined) {
                    captured = c;
                }
                return c.val(s1);
            });
            await tick();
            await tick();
            expect(c1.peek()).toBe(1);

            s1.set(2);
            c1.peek();
            await tick();
            await tick();

            expect(() => captured.val(s1)).toThrow('Reader disposed');
        });

        test("task with bound signal dependency", async () => {
            const s1 = c.signal(5);
            const c1 = c.task(async (c) => c.val(s1) * 2);
            await tick();
            expect(c1.peek()).toBe(10);

            s1.set(6);
            c1.peek();
            await tick();
            expect(c1.peek()).toBe(12);
        });

        test("spawn with bound signal dependency", async () => {
            const s1 = c.signal(1);
            let observed = null;
            c.spawn(async (c) => { observed = c.val(s1); });
            await tick();
            expect(observed).toBe(1);

            s1.set(2);
            await tick();
            expect(observed).toBe(2);
        });

        test("dynamic spawn: reads signals across await in an effect", async () => {
            const s1 = c.signal(1);
            const s2 = c.signal(10);
            let observed = null;
            c.spawn(async (c) => {
                let a = c.val(s1);
                await tick();
                let b = c.val(s2);
                observed = a + b;
            });
            await tick();
            await tick();
            expect(observed).toBe(11);

            s2.set(20);
            await tick();
            await tick();
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
                return v1 + v2;
            });
            await tick(); await tick();
            expect(c1.peek()).toBe(11);
            expect(runs).toBe(1);

            // s2 was read after stable() — not tracked. Changing it
            // should NOT cause a rerun.
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
                return v1 + v2;
            });
            await tick(); await tick();
            expect(c1.peek()).toBe(11);

            s1.set(2);
            c1.peek();
            await tick(); await tick();
            expect(c1.peek()).toBe(12); // v1=2, v2=10 (s2 not tracked)
            expect(runs).toBe(2);
        });

        test("c.equal() is callable on the context and propagates to node", async () => {
            const src = c.signal(0);
            const c1 = c.task(async (c) => {
                const v = c.val(src);
                c.equal(true);
                return v;
            });
            await tick(); await tick();
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
                observed = v1 + v2;
            });
            await tick(); await tick();
            expect(observed).toBe(101);
            expect(runs).toBe(1);

            s2.set(200); // not tracked
            await tick();
            expect(runs).toBe(1);

            s1.set(2); // tracked
            await tick(); await tick();
            expect(observed).toBe(202);
            expect(runs).toBe(2);
        });

        test("c.stable() before any reads: node goes dormant", async () => {
            const s1 = c.signal(1);
            let runs = 0;
            const c1 = c.task(async (c) => {
                runs++;
                c.stable();
                return c.val(s1); // post-stable — no subscribe
            });
            await tick(); await tick();
            expect(c1.peek()).toBe(1);
            expect(runs).toBe(1);

            s1.set(2);
            await tick();
            expect(runs).toBe(1);
            expect(c1.peek()).toBe(1);
        });
    });
});
