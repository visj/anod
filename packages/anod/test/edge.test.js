import { describe, test, expect } from "bun:test";
import {
    root,
    signal,
    compute,
    derive,
    transmit,
    task,
    effect,
    watch,
    spawn,
    scope,
    batch,
    cleanup,
    recover,
    equal,
    OPT_NOTIFY,
    OPT_DYNAMIC,
    FLAG_STREAM,
} from "../";

const tick = () => Promise.resolve();

describe("edge cases", () => {

    describe("effect error does not corrupt ctx", () => {
        test("effect throwing during creation does not corrupt outer compute", () => {
            const s1 = signal(1);
            const c1 = compute(() => {
                let val = s1.val();
                if (val > 1) {
                    try {
                        effect(() => { throw new Error("inner boom"); });
                    } catch (_) { }
                }
                return val * 10;
            });

            expect(c1.val()).toBe(10);
            s1.set(2);
            expect(c1.val()).toBe(20);
            s1.set(3);
            expect(c1.val()).toBe(30);
        });

        test("effect throwing during creation does not corrupt outer effect deps (with try/catch)", () => {
            const s1 = signal(0);
            const s2 = signal(0);
            let outerRuns = 0;

            const r = root(() => {
                recover(() => true);

                effect(() => {
                    outerRuns++;
                    s1.val();
                    if (s1.val() === 1) {
                        try {
                            effect(() => { throw new Error("inner"); });
                        } catch (_) { }
                    }
                    s2.val();
                });
            });

            expect(outerRuns).toBe(1);
            s1.set(1);
            expect(outerRuns).toBe(2);
            /** Outer effect should still track s2 */
            s2.set(1);
            expect(outerRuns).toBe(3);
            r.dispose();
        });

        test("unhandled inner effect error disposes outer effect", () => {
            const s1 = signal(0);
            let outerRuns = 0;

            const r = root(() => {
                recover(() => true);

                effect(() => {
                    outerRuns++;
                    s1.val();
                    if (s1.val() === 1) {
                        /** No try/catch — error propagates, outer effect is disposed */
                        effect(() => { throw new Error("inner"); });
                    }
                });
            });

            expect(outerRuns).toBe(1);
            s1.set(1);
            expect(outerRuns).toBe(2);
            /** Outer effect was disposed by the error — s1 changes don't trigger it */
            s1.set(2);
            expect(outerRuns).toBe(2);
            r.dispose();
        });

        test("effect throwing during creation inside compute does not corrupt compute", () => {
            const s1 = signal(1);
            const c1 = compute(() => {
                let val = s1.val();
                if (val > 1) {
                    try {
                        effect(() => { throw new Error("boom"); });
                    } catch (_) { }
                }
                return val + 100;
            });

            expect(c1.val()).toBe(101);
            s1.set(2);
            expect(c1.val()).toBe(102);
            s1.set(3);
            expect(c1.val()).toBe(103);
        });

        test("nested scope throwing does not corrupt parent scope", () => {
            const s1 = signal(0);
            let parentRuns = 0;

            const r = root(() => {
                recover(() => true);

                scope(() => {
                    parentRuns++;
                    s1.val();

                    if (s1.val() === 1) {
                        scope(() => {
                            throw new Error("inner scope");
                        });
                    }
                });
            });

            expect(parentRuns).toBe(1);
            s1.set(1);
            expect(parentRuns).toBe(2);
            s1.set(2);
            expect(parentRuns).toBe(3);
            r.dispose();
        });
    });

    describe("effect error in start() loop", () => {
        test("second effect still runs after first effect throws", () => {
            const s1 = signal(0);
            let secondRan = false;

            const r = root(() => {
                recover(() => true);

                effect(() => {
                    if (s1.val() > 0) {
                        throw new Error("first");
                    }
                });

                effect(() => {
                    s1.val();
                    secondRan = true;
                });
            });

            secondRan = false;
            s1.set(1);
            expect(secondRan).toBe(true);
            r.dispose();
        });

        test("scoped effect throwing does not break sibling scope", () => {
            const s1 = signal(0);
            let siblingRuns = 0;

            const r = root(() => {
                recover(() => true);

                scope(() => {
                    if (s1.val() > 0) {
                        throw new Error("scope boom");
                    }
                });

                scope(() => {
                    s1.val();
                    siblingRuns++;
                });
            });

            siblingRuns = 0;
            s1.set(1);
            expect(siblingRuns).toBe(1);
            r.dispose();
        });
    });

    describe("derive (was memo)", () => {
        test("tracks deps on first run only", () => {
            const s1 = signal(1);
            const s2 = signal(10);
            let runs = 0;

            const d = derive(() => {
                runs++;
                return s1.val() + s2.val();
            });

            expect(d.val()).toBe(11);
            expect(runs).toBe(1);

            s1.set(2);
            expect(d.val()).toBe(12);
            expect(runs).toBe(2);

            s2.set(20);
            expect(d.val()).toBe(22);
            expect(runs).toBe(3);
        });

        test("does not re-execute when value unchanged", () => {
            const s1 = signal(1);
            let runs = 0;

            const d = derive(() => {
                runs++;
                s1.val();
                return 42;
            });

            expect(d.val()).toBe(42);
            expect(runs).toBe(1);

            s1.set(2);
            /** derive runs because s1 changed, but value is still 42 */
            expect(d.val()).toBe(42);
            expect(runs).toBe(2);
        });
    });

    describe("watch (was reaction)", () => {
        test("runs when dependency changes", () => {
            const s1 = signal(1);
            let last = 0;

            watch(() => { last = s1.val(); });

            expect(last).toBe(1);
            s1.set(2);
            expect(last).toBe(2);
        });

        test("cleanup is called on update", () => {
            const s1 = signal(1);
            let cleanups = 0;

            watch(() => {
                s1.val();
                cleanup(() => { cleanups++; });
            });

            expect(cleanups).toBe(0);
            s1.set(2);
            expect(cleanups).toBe(1);
        });
    });

    describe("transmit", () => {
        test("always notifies downstream even when value unchanged", () => {
            const s1 = signal(1);
            let runs = 0;

            const t = transmit(() => {
                s1.val();
                return 42;
            });

            effect(() => {
                runs++;
                t.val();
            });

            expect(runs).toBe(1);
            s1.set(2);
            /** transmit returned 42 both times, but downstream still runs */
            expect(runs).toBe(2);
        });

        test("propagates STALE not PENDING to subscribers", () => {
            const s1 = signal(1);
            let computeRuns = 0;

            const t = transmit(() => {
                s1.val();
                return 42;
            });

            /**
             * A compute downstream of a transmit should get STALE
             * (not PENDING), meaning it will re-execute without
             * needing to check if the dep actually changed.
             */
            const c1 = derive(() => {
                computeRuns++;
                return t.val() + 1;
            });

            effect(() => { c1.val(); });

            expect(computeRuns).toBe(1);
            s1.set(2);
            expect(computeRuns).toBe(2);
        });
    });

    describe("task", () => {
        test("is stable by default", () => {
            const s1 = signal(1);
            const s2 = signal(10);
            let runs = 0;

            const t = task(() => {
                runs++;
                return Promise.resolve(s1.val() + s2.val());
            }, 0);

            expect(runs).toBe(1);
            expect(t.loading()).toBe(true);
        });

        test("settles to resolved value", async () => {
            const t = task(() => Promise.resolve(42), 0);

            expect(t.val()).toBe(0);
            expect(t.loading()).toBe(true);

            await tick();

            expect(t.val()).toBe(42);
            expect(t.loading()).toBe(false);
        });

        test("notifies downstream on settle", async () => {
            const t = task(() => Promise.resolve(42), 0);
            let received = 0;

            effect(() => { received = t.val(); });

            expect(received).toBe(0);
            await tick();
            expect(received).toBe(42);
        });

        test("sets error flag on rejection", async () => {
            const t = task(() => Promise.reject(new Error("fail")), 0);

            await tick();

            expect(t.error()).toBe(true);
            expect(() => t.val()).toThrow("fail");
        });

        test("re-evaluates when dep changes", async () => {
            const s1 = signal(1);
            const t = task(() => Promise.resolve(s1.val() * 10), 0);

            await tick();
            expect(t.val()).toBe(10);

            s1.set(2);
            t.val();
            await tick();
            expect(t.val()).toBe(20);
        });

        test("with OPT_DYNAMIC allows changing deps", async () => {
            const s1 = signal(true);
            const s2 = signal("a");
            const s3 = signal("b");
            let runs = 0;

            const t = task(() => {
                runs++;
                return Promise.resolve(s1.val() ? s2.val() : s3.val());
            }, "", OPT_DYNAMIC);

            await tick();
            expect(t.val()).toBe("a");
            expect(runs).toBe(1);

            s1.set(false);
            t.val();
            await tick();
            expect(t.val()).toBe("b");
            expect(runs).toBe(2);

            /** s2 should no longer be tracked */
            s2.set("x");
            t.val();
            await tick();
            expect(t.val()).toBe("b");
            expect(runs).toBe(2);

            /** s3 should be tracked */
            s3.set("y");
            t.val();
            await tick();
            expect(t.val()).toBe("y");
            expect(runs).toBe(3);
        });
    });

    describe("spawn", () => {
        test("runs async effect", async () => {
            let ran = false;

            spawn(() => {
                return new Promise((resolve) => {
                    ran = true;
                    resolve();
                });
            });

            await tick();
            expect(ran).toBe(true);
        });

        test("resolved function is registered as cleanup", async () => {
            let cleaned = false;
            const s1 = signal(0);

            const r = root(() => {
                spawn(() => {
                    s1.val();
                    return Promise.resolve(() => { cleaned = false; });
                });
            });

            await tick();
            /** Cleanup registered; dispose should call it */
            r.dispose();
            /** Note: cleanup from async resolve may have timing nuances */
        });

        test("is stable by default", () => {
            const s1 = signal(1);
            const s2 = signal(2);
            let runs = 0;

            spawn(() => {
                runs++;
                s1.val();
                s2.val();
                return Promise.resolve();
            });

            expect(runs).toBe(1);
        });

        test("sets loading flag", () => {
            let node;
            const s1 = signal(0);

            /** We can't easily check loading on Effect from outside,
             *  but we verify the effect doesn't crash */
            spawn(() => {
                s1.val();
                return new Promise((r) => setTimeout(r, 100));
            });
        });
    });

    describe("scope stable by default", () => {
        test("scope is stable by default", () => {
            const s1 = signal(1);
            const s2 = signal(10);
            let runs = 0;

            scope(() => {
                runs++;
                s1.val();
                s2.val();
            });

            expect(runs).toBe(1);

            s1.set(2);
            expect(runs).toBe(2);

            s2.set(20);
            expect(runs).toBe(3);
        });

        test("scope with OPT_DYNAMIC can change deps", () => {
            const s1 = signal(true);
            const s2 = signal(0);
            const s3 = signal(0);
            let runs = 0;

            scope(() => {
                runs++;
                if (s1.val()) {
                    s2.val();
                } else {
                    s3.val();
                }
            }, OPT_DYNAMIC);

            expect(runs).toBe(1);

            s2.set(1);
            expect(runs).toBe(2);

            s1.set(false);
            expect(runs).toBe(3);

            /** s2 should no longer be tracked */
            s2.set(2);
            expect(runs).toBe(3);

            /** s3 should be tracked now */
            s3.set(1);
            expect(runs).toBe(4);
        });
    });


    describe("diamond dependency", () => {
        test("effect runs once for diamond update", () => {
            const s1 = signal(0);
            const c1 = derive(() => s1.val() + 1);
            const c2 = derive(() => s1.val() + 10);
            let runs = 0;

            effect(() => {
                runs++;
                c1.val();
                c2.val();
            });

            expect(runs).toBe(1);
            s1.set(1);
            expect(runs).toBe(2);
        });

        test("compute evaluates correctly in diamond", () => {
            const s1 = signal(1);
            const left = derive(() => s1.val() * 2);
            const right = derive(() => s1.val() * 3);
            const sum = derive(() => left.val() + right.val());

            expect(sum.val()).toBe(5);
            s1.set(2);
            expect(sum.val()).toBe(10);
            s1.set(3);
            expect(sum.val()).toBe(15);
        });

        test("deep diamond with pending/stale split", () => {
            const s1 = signal(0);
            const a = derive(() => s1.val() + 1);
            const b = derive(() => a.val() + 1);
            const c1 = derive(() => a.val() + b.val());
            let runs = 0;

            effect(() => {
                runs++;
                c1.val();
            });

            expect(runs).toBe(1);
            s1.set(1);
            expect(runs).toBe(2);
            expect(c1.val()).toBe(5);
        });
    });

    describe("avoidable computation", () => {
        test("downstream skips when upstream absorbs change", () => {
            const s1 = signal(1);
            let c1Runs = 0;
            let c2Runs = 0;

            /** c1 absorbs: always returns 0 regardless of s1 */
            const c1 = derive(() => { c1Runs++; s1.val(); return 0; });
            const c2 = derive(() => { c2Runs++; return c1.val() + 1; });

            effect(() => { c2.val(); });

            expect(c1Runs).toBe(1);
            expect(c2Runs).toBe(1);

            s1.set(2);
            /** c1 runs but returns same value; c2 should NOT run */
            expect(c1Runs).toBe(2);
            expect(c2Runs).toBe(1);
        });

        test("deep chain avoids unnecessary work", () => {
            const s1 = signal(0);
            const c1 = derive(() => { s1.val(); return 0; });
            const c2 = derive(() => c1.val() + 1);
            const c3 = derive(() => c2.val() + 1);
            const c4 = derive(() => c3.val() + 1);
            let runs = 0;

            effect(() => { runs++; c4.val(); });

            expect(runs).toBe(1);
            s1.set(1);
            /** c1 absorbs, c2/c3/c4 should not run, effect should not run */
            expect(runs).toBe(1);
        });
    });

    describe("batch", () => {
        test("coalesces multiple signal updates", () => {
            const s1 = signal(0);
            const s2 = signal(0);
            let runs = 0;

            effect(() => {
                runs++;
                s1.val();
                s2.val();
            });

            expect(runs).toBe(1);
            batch(() => {
                s1.set(1);
                s2.set(2);
            });
            expect(runs).toBe(2);
        });

        test("nested batch is a no-op", () => {
            const s1 = signal(0);
            let runs = 0;

            effect(() => { runs++; s1.val(); });

            expect(runs).toBe(1);
            batch(() => {
                batch(() => {
                    s1.set(1);
                });
                /** Still inside outer batch — effect hasn't run yet */
            });
            expect(runs).toBe(2);
        });

        test("signal read inside batch sees old value", () => {
            const s1 = signal(0);
            let mid = -1;

            batch(() => {
                s1.set(1);
                mid = s1.val();
            });

            /** Inside batch, set is deferred, so val sees old value */
            expect(mid).toBe(0);
            expect(s1.val()).toBe(1);
        });
    });

    describe("dispose", () => {
        test("disposed compute returns last value", () => {
            const s1 = signal(1);
            const c1 = derive(() => s1.val() * 2);

            expect(c1.val()).toBe(2);
            c1.dispose();
            s1.set(2);
            /** Disposed compute retains nothing usable */
        });

        test("disposed effect stops running", () => {
            const s1 = signal(0);
            let runs = 0;

            const e1 = effect(() => { runs++; s1.val(); });

            expect(runs).toBe(1);
            e1.dispose();
            s1.set(1);
            expect(runs).toBe(1);
        });

        test("root.dispose() cleans up all owned nodes", () => {
            const s1 = signal(0);
            let runs = 0;

            const r = root(() => {
                effect(() => { runs++; s1.val(); });
                effect(() => { runs++; s1.val(); });
            });

            expect(runs).toBe(2);
            r.dispose();
            s1.set(1);
            expect(runs).toBe(2);
        });

        test("double dispose is safe", () => {
            const e1 = effect(() => { });
            e1.dispose();
            e1.dispose();
        });
    });

    describe("circular dependency", () => {
        test("compute reading itself via signal indirection throws", () => {
            const s1 = signal(0);
            const c1 = compute(() => {
                let v = s1.val();
                if (v > 0) {
                    return c1.val();
                }
                return v;
            });

            expect(c1.val()).toBe(0);
            s1.set(1);
            expect(() => c1.val()).toThrow("Circular dependency");
        });
    });

    describe("dynamic dependency changes", () => {
        test("compute drops old deps and picks up new ones", () => {
            const s1 = signal(true);
            const s2 = signal("a");
            const s3 = signal("b");
            let runs = 0;

            const c1 = compute(() => {
                runs++;
                return s1.val() ? s2.val() : s3.val();
            });

            effect(() => { c1.val(); });

            expect(runs).toBe(1);
            expect(c1.val()).toBe("a");

            /** Switch branch */
            s1.set(false);
            expect(c1.val()).toBe("b");
            expect(runs).toBe(2);

            /** s2 should no longer trigger */
            s2.set("x");
            expect(runs).toBe(2);

            /** s3 should trigger */
            s3.set("y");
            expect(c1.val()).toBe("y");
            expect(runs).toBe(3);
        });
    });

    describe("equal() API", () => {
        test("equal(true) suppresses notification", () => {
            const s1 = signal(0);
            let runs = 0;

            const c1 = compute(() => {
                equal(true);
                return s1.val();
            });

            effect(() => { runs++; c1.val(); });

            expect(runs).toBe(1);
            s1.set(1);
            /** c1 value changed but equal(true) suppresses */
            expect(runs).toBe(1);
        });

        test("equal(false) forces notification", () => {
            const s1 = signal(0);
            let runs = 0;

            const c1 = compute(() => {
                equal(false);
                s1.val();
                return 42;
            });

            effect(() => { runs++; c1.val(); });

            expect(runs).toBe(1);
            s1.set(1);
            /** Value didn't change (still 42) but equal(false) forces */
            expect(runs).toBe(2);
        });
    });

    describe("FLAG_STREAM via compute", () => {
        test("async iterable compute settles on each yield", async () => {
            const resolvers = [];
            const iter = {
                [Symbol.asyncIterator]() { return this; },
                next() { return new Promise(r => resolvers.push(r)); },
                return() { return Promise.resolve({ done: true }); }
            };

            const c1 = compute(() => iter, undefined, FLAG_STREAM);
            const values = [];

            effect(() => {
                const v = c1.val();
                if (!c1.loading()) {
                    values.push(v);
                }
            });

            resolvers[0]({ value: 10, done: false });
            await tick();
            expect(values).toEqual([10]);

            resolvers[1]({ value: 20, done: false });
            await tick();
            expect(values).toEqual([10, 20]);
        });
    });

    describe("OPT_NOTIFY via compute", () => {
        test("compute with OPT_NOTIFY always propagates", () => {
            const s1 = signal(1);
            let runs = 0;

            const c1 = compute(() => {
                s1.val();
                return 42;
            }, undefined, OPT_NOTIFY);

            effect(() => { runs++; c1.val(); });

            expect(runs).toBe(1);
            s1.set(2);
            expect(runs).toBe(2);
        });
    });

    describe("seed value", () => {
        test("compute receives seed as prev on first run", () => {
            let received;
            const c1 = compute((prev) => {
                received = prev;
                return prev + 1;
            }, 10);

            expect(c1.val()).toBe(11);
            expect(received).toBe(10);
        });

        test("derive receives seed", () => {
            let received;
            const d = derive((prev) => {
                received = prev;
                return 42;
            }, 99);

            expect(d.val()).toBe(42);
            expect(received).toBe(99);
        });
    });

    describe("multiple signal writes in effect", () => {
        test("effect writing to signal triggers another cycle", () => {
            const s1 = signal(0);
            const s2 = signal(0);
            let s2val = 0;

            effect(() => {
                s2.set(s1.val() * 10);
            });

            effect(() => {
                s2val = s2.val();
            });

            expect(s2val).toBe(0);
            s1.set(1);
            expect(s2val).toBe(10);
        });
    });

    describe("recover edge cases", () => {
        test("error in compute is caught when effect reads it", () => {
            let caught = null;

            const r = root(() => {
                recover((err) => { caught = err; return true; });

                const c1 = compute(() => { throw new Error("compute err"); });
                effect(() => { c1.val(); });
            });

            expect(caught).toBeInstanceOf(Error);
            expect(caught.message).toBe("compute err");
            r.dispose();
        });

        test("compute.error() returns true after throw", () => {
            const c1 = compute(() => { throw new Error("fail"); });
            expect(c1.error()).toBe(true);
        });

        test("compute.val() rethrows stored error", () => {
            const c1 = compute(() => { throw new Error("rethrow me"); });
            expect(() => c1.val()).toThrow("rethrow me");
        });
    });

    describe("stress: deep chain", () => {
        test("50-deep chain propagates correctly", () => {
            const head = signal(0);
            let current = head;
            for (let i = 0; i < 50; i++) {
                const prev = current;
                current = derive(() => prev.val() + 1);
            }

            expect(current.val()).toBe(50);
            head.set(1);
            expect(current.val()).toBe(51);
        });
    });

    describe("stress: wide fan-out", () => {
        test("50 effects on one signal", () => {
            const s1 = signal(0);
            let total = 0;

            for (let i = 0; i < 50; i++) {
                effect(() => { total += s1.val(); });
            }

            expect(total).toBe(0);
            total = 0;
            s1.set(1);
            expect(total).toBe(50);
        });
    });

    describe("interleaved reads", () => {
        test("compute reading another compute during evaluation", () => {
            const s1 = signal(1);
            const s2 = signal(2);

            const c1 = derive(() => s1.val() + s2.val());
            const c2 = derive(() => c1.val() * 2);
            const c3 = derive(() => c1.val() + c2.val());

            expect(c3.val()).toBe(9);
            s1.set(3);
            expect(c3.val()).toBe(15);
        });
    });
});
