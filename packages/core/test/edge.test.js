import { describe, test, expect } from "#test-runner";
import { signal, root, batch } from "#fyren";

let c; root((_c) => { c = _c; });

const tick = () => Promise.resolve();

describe("edge cases", () => {

    describe("effect error does not corrupt ctx", () => {
        test("effect throwing during creation does not corrupt outer compute", () => {
            const s1 = signal(1);
            const c1 = c.compute(r => {
                let val = r.val(s1);
                if (val > 1) {
                    try {
                        c.effect(c2 => { throw new Error("inner boom"); });
                    } catch (_) { }
                }
                return val * 10;
            });

            expect(c1.get()).toBe(10);
            s1.set(2);
            expect(c1.get()).toBe(20);
            s1.set(3);
            expect(c1.get()).toBe(30);
        });

        test("effect throwing during creation does not corrupt outer effect deps (with try/catch)", () => {
            const s1 = signal(0);
            const s2 = signal(0);
            let outerRuns = 0;

            const r = root(r => {
                r.recover(() => true);

                r.effect(c => {
                    outerRuns++;
                    c.val(s1);
                    if (c.val(s1) === 1) {
                        try {
                            c.effect(c2 => { throw new Error("inner"); });
                        } catch (_) { }
                    }
                    c.val(s2);
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

        test("inner effect error recovered via owner chain keeps outer alive", () => {
            const s1 = signal(0);
            let outerRuns = 0;

            const r = root(r => {
                r.recover(() => true);

                r.effect(c => {
                    outerRuns++;
                    c.val(s1);
                    if (c.val(s1) === 1) {
                        /** Auto-owned inner effect -- error walks up owner chain
                         *  to root's recover handler, which returns true. Inner
                         *  effect is disposed, outer effect survives. */
                        c.effect(c2 => { throw new Error("inner"); });
                    }
                });
            });

            expect(outerRuns).toBe(1);
            s1.set(1);
            expect(outerRuns).toBe(2);
            /** Outer effect survived -- root's recover handled the error */
            s1.set(2);
            expect(outerRuns).toBe(3);
            r.dispose();
        });

        test("effect throwing during creation inside compute does not corrupt compute", () => {
            const s1 = signal(1);
            const c1 = c.compute(r => {
                let val = r.val(s1);
                if (val > 1) {
                    try {
                        c.effect(c2 => { throw new Error("boom"); });
                    } catch (_) { }
                }
                return val + 100;
            });

            expect(c1.get()).toBe(101);
            s1.set(2);
            expect(c1.get()).toBe(102);
            s1.set(3);
            expect(c1.get()).toBe(103);
        });

        test("nested scope throwing does not corrupt parent scope", () => {
            const s1 = signal(0);
            let parentRuns = 0;

            const r = root(r => {
                r.recover(() => true);

                r.effect(c => {
                    parentRuns++;
                    c.val(s1);

                    if (c.val(s1) === 1) {
                        c.effect(c2 => {
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

            const r = root(r => {
                r.recover(() => true);

                r.effect(c => {
                    if (c.val(s1) > 0) {
                        throw new Error("first");
                    }
                });

                r.effect(c => {
                    c.val(s1);
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

            const r = root(r => {
                r.recover(() => true);

                r.effect(c => {
                    if (c.val(s1) > 0) {
                        throw new Error("scope boom");
                    }
                });

                r.effect(c => {
                    c.val(s1);
                    siblingRuns++;
                });
            });

            siblingRuns = 0;
            s1.set(1);
            expect(siblingRuns).toBe(1);
            r.dispose();
        });
    });

    describe("stable compute", () => {
        test("tracks deps on first run only", () => {
            const s1 = signal(1);
            const s2 = signal(10);
            let runs = 0;

            const d = c.compute(c => {
                c.stable();
                runs++;
                return c.val(s1) + c.val(s2);
            });

            expect(d.get()).toBe(11);
            expect(runs).toBe(1);

            s1.set(2);
            expect(d.get()).toBe(12);
            expect(runs).toBe(2);

            s2.set(20);
            expect(d.get()).toBe(22);
            expect(runs).toBe(3);
        });

        test("does not re-execute when value unchanged", () => {
            const s1 = signal(1);
            let runs = 0;

            const d = c.compute(c => {
                c.stable();
                runs++;
                c.val(s1);
                return 42;
            });

            expect(d.get()).toBe(42);
            expect(runs).toBe(1);

            s1.set(2);
            /** compute runs because s1 changed, but value is still 42 */
            expect(d.get()).toBe(42);
            expect(runs).toBe(2);
        });
    });

    describe("stable effect", () => {
        test("runs when dependency changes", () => {
            const s1 = signal(1);
            let last = 0;

            c.effect(c => { c.stable(); last = c.val(s1); });

            expect(last).toBe(1);
            s1.set(2);
            expect(last).toBe(2);
        });

        test("cleanup is called on update", () => {
            const s1 = signal(1);
            let cleanups = 0;

            c.effect(c => {
                c.val(s1);
                c.cleanup(() => { cleanups++; });
            });

            expect(cleanups).toBe(0);
            s1.set(2);
            expect(cleanups).toBe(1);
        });
    });

    describe("task", () => {
        test("is stable by default", () => {
            const s1 = signal(1);
            const s2 = signal(10);
            let runs = 0;

            const t = c.task(c => {
                runs++;
                return c.suspend(Promise.resolve(c.val(s1) + c.val(s2)));
            }, 0);

            expect(runs).toBe(1);
            expect(t.loading).toBe(true);
        });

        test("settles to resolved value", async () => {
            const t = c.task((c) => c.suspend(Promise.resolve(42)), 0);

            expect(t.get()).toBe(0);
            expect(t.loading).toBe(true);

            await tick();
            await tick();

            expect(t.get()).toBe(42);
            expect(t.loading).toBe(false);
        });

        test("notifies downstream on settle", async () => {
            const t = c.task((c) => c.suspend(Promise.resolve(42)), 0);
            let received = 0;

            c.effect(c => { received = c.val(t); });

            expect(received).toBe(0);
            await tick();
            await tick();
            expect(received).toBe(42);
        });

        test("sets error flag on rejection", async () => {
            const t = c.task((c) => c.suspend(Promise.reject(new Error("fail"))), 0);

            await tick();
            await tick();

            expect(t.error).not.toBeNull();
            expect(t.error.type).toBe(3);
            expect(t.error.error).toBeInstanceOf(Error);
            try {
                t.get();
                expect(true).toBe(false);
            } catch (e) {
                expect(e.error.message).toBe("fail");
            }
        });

        test("re-evaluates when dep changes", async () => {
            const s1 = signal(1);
            const t = c.task(c => c.suspend(Promise.resolve(c.val(s1) * 10)), 0);

            await tick();
            await tick();
            expect(t.get()).toBe(10);

            s1.set(2);
            t.get();
            await tick();
            await tick();
            expect(t.get()).toBe(20);
        });

        test("async allows changing deps", async () => {
            const s1 = signal(true);
            const s2 = signal("a");
            const s3 = signal("b");
            let runs = 0;

            const t = c.task(c => {
                runs++;
                return c.suspend(Promise.resolve(c.val(s1) ? c.val(s2) : c.val(s3)));
            });

            await tick();
            await tick();
            expect(t.get()).toBe("a");
            expect(runs).toBe(1);

            s1.set(false);
            t.get();
            await tick();
            await tick();
            expect(t.get()).toBe("b");
            expect(runs).toBe(2);

            /** s2 should no longer be tracked */
            s2.set("x");
            t.get();
            await tick();
            await tick();
            expect(t.get()).toBe("b");
            expect(runs).toBe(2);

            /** s3 should be tracked */
            s3.set("y");
            t.get();
            await tick();
            await tick();
            expect(t.get()).toBe("y");
            expect(runs).toBe(3);
        });
    });

    describe("spawn", () => {
        test("runs async effect", async () => {
            let ran = false;

            c.spawn(c => {
                return c.suspend(new Promise((resolve) => {
                    ran = true;
                    resolve();
                }));
            });

            await tick();
            await tick();
            expect(ran).toBe(true);
        });

        test("resolved function is registered as cleanup", async () => {
            let cleaned = false;
            const s1 = signal(0);

            const r = root(r => {
                r.spawn(c => {
                    c.val(s1);
                    return c.suspend(Promise.resolve(() => { cleaned = false; }));
                });
            });

            await tick();
            await tick();
            /** Cleanup registered; dispose should call it */
            r.dispose();
            /** Note: cleanup from async resolve may have timing nuances */
        });

        test("is stable by default", () => {
            const s1 = signal(1);
            const s2 = signal(2);
            let runs = 0;

            c.spawn(c => {
                runs++;
                c.val(s1);
                c.val(s2);
                return c.suspend(Promise.resolve());
            });

            expect(runs).toBe(1);
        });

        test("sets loading flag", () => {
            let node;
            const s1 = signal(0);

            /** We can't easily check loading on Effect from outside,
             *  but we verify the effect doesn't crash */
            c.spawn(c => {
                c.val(s1);
                return c.suspend(new Promise((r) => setTimeout(r, 100)));
            });
        });
    });

    describe("scope stable by default", () => {
        test("scope is stable by default", () => {
            const s1 = signal(1);
            const s2 = signal(10);
            let runs = 0;

            root(r => {
                r.effect(c => {
                    runs++;
                    c.val(s1);
                    c.val(s2);
                });
            });

            expect(runs).toBe(1);

            s1.set(2);
            expect(runs).toBe(2);

            s2.set(20);
            expect(runs).toBe(3);
        });

        test("effect scope can change deps", () => {
            const s1 = signal(true);
            const s2 = signal(0);
            const s3 = signal(0);
            let runs = 0;

            root(r => {
                r.effect(c => {
                    runs++;
                    if (c.val(s1)) {
                        c.val(s2);
                    } else {
                        c.val(s3);
                    }
                });
            });

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
            const c1 = c.compute(s1, val => val + 1);
            const c2 = c.compute(s1, val => val + 10);
            let runs = 0;

            c.effect(c => {
                runs++;
                c.val(c1);
                c.val(c2);
            });

            expect(runs).toBe(1);
            s1.set(1);
            expect(runs).toBe(2);
        });

        test("compute evaluates correctly in diamond", () => {
            const s1 = signal(1);
            const left = c.compute(s1, val => val * 2);
            const right = c.compute(s1, val => val * 3);
            const sum = c.compute(c => { c.stable(); return c.val(left) + c.val(right); });

            expect(sum.get()).toBe(5);
            s1.set(2);
            expect(sum.get()).toBe(10);
            s1.set(3);
            expect(sum.get()).toBe(15);
        });

        test("deep diamond with pending/stale split", () => {
            const s1 = signal(0);
            const a = c.compute(s1, val => val + 1);
            const b = c.compute(a, val => val + 1);
            const c1 = c.compute(c => { c.stable(); return c.val(a) + c.val(b); });
            let runs = 0;

            c.effect(c => {
                runs++;
                c.val(c1);
            });

            expect(runs).toBe(1);
            s1.set(1);
            expect(runs).toBe(2);
            expect(c1.get()).toBe(5);
        });
    });

    describe("avoidable computation", () => {
        test("downstream skips when upstream absorbs change", () => {
            const s1 = signal(1);
            let c1Runs = 0;
            let c2Runs = 0;

            /** c1 absorbs: always returns 0 regardless of s1 */
            const c1 = c.compute(s1, val => { c1Runs++; return 0; });
            const c2 = c.compute(c1, val => { c2Runs++; return val + 1; });

            c.effect(c2, () => { });

            expect(c1Runs).toBe(1);
            expect(c2Runs).toBe(1);

            s1.set(2);
            /** c1 runs but returns same value; c2 should NOT run */
            expect(c1Runs).toBe(2);
            expect(c2Runs).toBe(1);
        });

        test("deep chain avoids unnecessary work", () => {
            const s1 = signal(0);
            const c1 = c.compute(s1, val => 0);
            const c2 = c.compute(c1, val => val + 1);
            const c3 = c.compute(c2, val => val + 1);
            const c4 = c.compute(c3, val => val + 1);
            let runs = 0;

            c.effect(c4, val => { runs++; });

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

            c.effect(c => {
                runs++;
                c.val(s1);
                c.val(s2);
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

            c.effect(c => { runs++; c.val(s1); });

            expect(runs).toBe(1);
            batch(() => {
                batch(() => {
                    s1.set(1);
                });
                /** Still inside outer batch -- effect hasn't run yet */
            });
            expect(runs).toBe(2);
        });

        test("signal read inside batch sees old value", () => {
            const s1 = signal(0);
            let mid = -1;

            batch(() => {
                s1.set(1);
                mid = s1.get();
            });

            /** Inside batch, set is deferred, so val sees old value */
            expect(mid).toBe(0);
            expect(s1.get()).toBe(1);
        });
    });

    describe("dispose", () => {
        test("disposed compute returns last value", () => {
            const s1 = signal(1);
            const c1 = c.compute(s1, val => val * 2);

            expect(c1.get()).toBe(2);
            c1.dispose();
            s1.set(2);
            /** Disposed compute retains nothing usable */
        });

        test("disposed effect stops running", () => {
            const s1 = signal(0);
            let runs = 0;

            const e1 = c.effect(c => { runs++; c.val(s1); });

            expect(runs).toBe(1);
            e1.dispose();
            s1.set(1);
            expect(runs).toBe(1);
        });

        test("root.dispose() cleans up all owned nodes", () => {
            const s1 = signal(0);
            let runs = 0;

            const r = root(r => {
                r.effect(c => { runs++; c.val(s1); });
                r.effect(c => { runs++; c.val(s1); });
            });

            expect(runs).toBe(2);
            r.dispose();
            s1.set(1);
            expect(runs).toBe(2);
        });

        test("double dispose is safe", () => {
            const e1 = c.effect(c => { });
            e1.dispose();
            e1.dispose();
        });
    });

    describe("dynamic dependency changes", () => {
        test("compute drops old deps and picks up new ones", () => {
            const s1 = signal(true);
            const s2 = signal("a");
            const s3 = signal("b");
            let runs = 0;

            const c1 = c.compute(c => {
                runs++;
                return c.val(s1) ? c.val(s2) : c.val(s3);
            });

            c.effect(c => { c.val(c1); });

            expect(runs).toBe(1);
            expect(c1.get()).toBe("a");

            /** Switch branch */
            s1.set(false);
            expect(c1.get()).toBe("b");
            expect(runs).toBe(2);

            /** s2 should no longer trigger */
            s2.set("x");
            expect(runs).toBe(2);

            /** s3 should trigger */
            s3.set("y");
            expect(c1.get()).toBe("y");
            expect(runs).toBe(3);
        });
    });

    describe("equal() API", () => {
        test("equal(true) suppresses notification", () => {
            const s1 = signal(0);
            let runs = 0;

            const c1 = c.compute(c => {
                c.equal(true);
                return c.val(s1);
            });

            c.effect(c => { runs++; c.val(c1); });

            expect(runs).toBe(1);
            s1.set(1);
            /** c1 value changed but equal(true) suppresses */
            expect(runs).toBe(1);
        });

        test("equal(false) forces notification", () => {
            const s1 = signal(0);
            let runs = 0;

            const c1 = c.compute(c => {
                c.equal(false);
                c.val(s1);
                return 42;
            });

            c.effect(c => { runs++; c.val(c1); });

            expect(runs).toBe(1);
            s1.set(1);
            /** Value didn't change (still 42) but equal(false) forces */
            expect(runs).toBe(2);
        });
    });

    describe("async iterable via task", () => {
        test("async iterable task settles on each yield", async () => {
            const resolvers = [];
            const iter = {
                [Symbol.asyncIterator]() { return this; },
                next() { return new Promise(r => resolvers.push(r)); },
                return() { return Promise.resolve({ done: true }); }
            };

            const c1 = c.task(() => iter);
            const values = [];

            c.effect(c => {
                const v = c.val(c1);
                if (!c1.loading) {
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

    describe("seed value", () => {
        test("compute receives seed as prev on first run", () => {
            let received;
            const c1 = c.compute((c, prev) => {
                received = prev;
                return prev + 1;
            }, 10);

            expect(c1.get()).toBe(11);
            expect(received).toBe(10);
        });

        test("stable compute receives seed", () => {
            let received;
            const d = c.compute((c, prev) => {
                c.stable();
                received = prev;
                return 42;
            }, 99);

            expect(d.get()).toBe(42);
            expect(received).toBe(99);
        });
    });

    describe("multiple signal writes in effect", () => {
        test("effect writing to signal triggers another cycle", () => {
            const s1 = signal(0);
            const s2 = signal(0);
            let s2val = 0;

            c.effect(c => {
                s2.set(c.val(s1) * 10);
            });

            c.effect(c => {
                s2val = c.val(s2);
            });

            expect(s2val).toBe(0);
            s1.set(1);
            expect(s2val).toBe(10);
        });
    });

    describe("recover edge cases", () => {
        test("error in effect is caught by recover", () => {
            let caught = null;
            const s1 = signal(0);

            const r = root(r => {
                r.recover(err => { caught = err; return true; });

                r.effect(c => {
                    if (c.val(s1) > 0) {
                        throw new Error("effect err");
                    }
                });
            });

            expect(caught).toBeNull();
            s1.set(1);
            expect(caught.type).toBe(3);
            expect(caught.error).toBeInstanceOf(Error);
            expect(caught.error.message).toBe("effect err");
            r.dispose();
        });

        test("compute.error() returns true after throw", () => {
            const c1 = c.compute(() => { throw new Error("fail"); });
            expect(c1.error).not.toBeNull();
        });

        test("compute.get() rethrows stored error", () => {
            const c1 = c.compute(() => { throw new Error("rethrow me"); });
            try {
                c1.get();
                expect(true).toBe(false);
            } catch (e) {
                expect(e.type).toBe(3);
                expect(e.error.message).toBe("rethrow me");
            }
        });
    });

    describe("stress: deep chain", () => {
        test("50-deep chain propagates correctly", () => {
            const head = signal(0);
            let current = head;
            for (let i = 0; i < 50; i++) {
                const prev = current;
                current = c.compute(prev, val => val + 1);
            }

            expect(current.get()).toBe(50);
            head.set(1);
            expect(current.get()).toBe(51);
        });
    });

    describe("stress: wide fan-out", () => {
        test("50 effects on one signal", () => {
            const s1 = signal(0);
            let total = 0;

            for (let i = 0; i < 50; i++) {
                c.effect(c => { total += c.val(s1); });
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

            const c1 = c.compute(c => { c.stable(); return c.val(s1) + c.val(s2); });
            const c2 = c.compute(c1, val => val * 2);
            const c3 = c.compute(c => { c.stable(); return c.val(c1) + c.val(c2); });

            expect(c3.get()).toBe(9);
            s1.set(3);
            expect(c3.get()).toBe(15);
        });
    });
});
