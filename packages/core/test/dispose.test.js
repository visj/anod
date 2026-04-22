import { describe, test, expect, expectCollected } from "#test-runner";
import { signal, root } from "#fyren";

let c; root((_c) => { c = _c; });

const tick = () => Promise.resolve();
const settle = () => tick().then(tick).then(tick);

describe("dispose", () => {
    describe("scope", () => {
        test("disables updates and clears computation's value", () => {
            let count = 0;
            let s1;
            let c1;

            const r1 = root(r => {
                count = 0;
                s1 = signal(0);
                c1 = r.compute(c => {
                    count++;
                    return c.val(s1);
                });

                expect(c1.get()).toBe(0);
                expect(count).toBe(1);

                s1.set(1);
                expect(c1.get()).toBe(1);
                expect(count).toBe(2);
            });

            r1.dispose();
            s1.set(2);

            expect(count).toBe(2); // "Compute should not execute after disposal"
            expect(c1.get()).toBeNull(); // "Disposed compute value should be null"
        });
    });

    describe("computations", () => {
        test("persists through cycle when manually disposed", () => {
            root(r => {
                const s1 = signal(0);
                const c1 = r.compute(c => c.val(s1));
                let count = 0;

                r.effect(c => {
                    c.effect(c2 => {
                        if (c2.val(s1) > 0) {
                            c1.dispose();
                        }
                    });
                    c.effect(c2 => {
                        count += (c2.val(c1) || 0);
                    });
                });

                s1.set(s1.get() + 1);
                s1.set(s1.get() + 1);
                /** e3 runs once before c1 is disposed (adds 1), then
                 *  subsequent cycles skip c1 reads since its dep was cleared
                 *  on dispose. Assertion proves dispose-during-cycle didn't
                 *  crash -- the original scope-based test relied on IDLE=false
                 *  inside scope, which queued sets so the expect fired before
                 *  any effect re-ran. */
                expect(count).toBe(1);
            });
        });
    });

    describe("bound dep1 error/dispose guards", () => {
        test("bound compute throws when dep1 has FLAG_ERROR", () => {
            const s1 = signal(1);
            const bad = c.compute((cx) => {
                if (cx.val(s1) > 1) {
                    throw new Error("boom");
                }
                return cx.val(s1);
            });
            const bound = c.compute(bad, (val) => val * 2);
            expect(bound.get()).toBe(2);

            // Make bad error
            s1.set(2);
            // Pulling bound should propagate the error from bad
            let threw = false;
            try {
                bound.get();
            } catch (e) {
                threw = true;
            }
            expect(threw).toBe(true);
            expect(bound.error).not.toBeNull();
        });

        test("bound compute throws when dep1 is disposed", () => {
            const s1 = signal(1);
            const dep = c.compute((cx) => cx.val(s1));
            const bound = c.compute(dep, (val) => val * 2);
            expect(bound.get()).toBe(2);

            dep.dispose();
            // Reading bound should throw because dep1 is disposed
            let threw = false;
            try {
                bound.get();
            } catch (e) {
                threw = true;
            }
            expect(threw).toBe(true);
        });
    });

    describe("disposed owner guards", () => {
        test("disposed root cannot create compute", () => {
            const r = root(() => {});
            r.dispose();
            expect(() => r.compute((cx) => 1)).toThrow();
        });

        test("disposed root cannot create effect", () => {
            const r = root(() => {});
            r.dispose();
            expect(() => r.effect(() => {})).toThrow();
        });

        test("disposed root cannot create task", () => {
            const r = root(() => {});
            r.dispose();
            expect(() => r.task((cx) => cx.suspend(Promise.resolve(1)))).toThrow();
        });

        test("disposed root cannot create spawn", () => {
            const r = root(() => {});
            r.dispose();
            expect(() => r.spawn(async (cx) => { await cx.suspend(Promise.resolve()); })).toThrow();
        });

    });

    describe("async disposal: task disposes while awaited", () => {
        test("task dispose panics awaiting task (sets FLAG_ERROR)", async () => {
            /**
             * A task awaiting another task via c.suspend(taskB). When taskB
             * disposes, the awaiting task should error (like a thrown error).
             */
            let resolve;
            const taskB = c.task((cx) => cx.suspend(new Promise((r) => { resolve = r; })));

            const taskA = c.task(async (cx) => {
                return cx.suspend(taskB);
            });

            await settle();
            expect(taskA.loading).toBe(true);
            expect(taskB.loading).toBe(true);

            // Dispose taskB while taskA is awaiting it
            taskB.dispose();
            await settle();

            // taskA should now be in error state
            expect(taskA.error).not.toBeNull();
            expect(taskA.loading).toBe(false);
        });

        test("task dispose panics awaiting spawn (self-recover keeps alive)", async () => {
            /**
             * A spawn awaiting a task via c.suspend(task). When the task
             * disposes, the spawn's promise rejects. If the spawn has a
             * self-recover handler that returns true, the spawn survives
             * (no dispose, no cleanup). Cleanup only runs on explicit dispose.
             */
            let resolve;
            const taskB = c.task((cx) => cx.suspend(new Promise((r) => { resolve = r; })));

            let recovered = null;
            let cleanupRan = false;
            const r = root((r) => {
                r.spawn(async (cx) => {
                    cx.cleanup(() => { cleanupRan = true; });
                    cx.recover((err) => {
                        recovered = err;
                        return true; // self-recover: node stays alive
                    });
                    await cx.suspend(taskB);
                });
            });

            await settle();
            expect(cleanupRan).toBe(false);
            expect(recovered).toBe(null);

            // Dispose taskB
            taskB.dispose();
            await settle();

            // Spawn self-recovered: stays alive, no cleanup yet
            expect(recovered).not.toBeNull();
            expect(cleanupRan).toBe(false);

            // Cleanup runs when we explicitly dispose
            r.dispose();
            expect(cleanupRan).toBe(true);
        });

        test("multiple awaiters: all panic when task disposes", async () => {
            let resolve;
            const taskB = c.task((cx) => cx.suspend(new Promise((r) => { resolve = r; })));

            let errors = 0;
            const r = root((r) => {
                for (let i = 0; i < 3; i++) {
                    r.spawn(async (cx) => {
                        cx.recover(() => { errors++; return true; });
                        await cx.suspend(taskB);
                    });
                }
            });

            await settle();
            expect(errors).toBe(0);

            taskB.dispose();
            await settle();

            expect(errors).toBe(3);
            r.dispose();
        });

        test("disposed task: awaiting spawn cleanup runs", async () => {
            /**
             * Even without recover(), the spawn's cleanup must run so
             * resources allocated before the await are released.
             */
            let resolve;
            const taskB = c.task((cx) => cx.suspend(new Promise((r) => { resolve = r; })));

            let cleanups = 0;
            const r = root((r) => {
                r.spawn(async (cx) => {
                    cx.cleanup(() => { cleanups++; });
                    await cx.suspend(taskB);
                });
            });

            await settle();
            expect(cleanups).toBe(0);

            taskB.dispose();
            await settle();

            expect(cleanups).toBe(1);
            r.dispose();
        });

        test("GC: panic'd nodes are fully freed", async () => {
            let resolve;
            const taskB = c.task((cx) => cx.suspend(new Promise((r) => { resolve = r; })));

            const refs = (() => {
                const nodes = [];
                const r = root((r) => {
                    r.spawn(async (cx) => {
                        await cx.suspend(taskB);
                    });
                    nodes.push(r);
                });
                taskB.dispose();
                // r is still alive — dispose it
                r.dispose();
                return nodes.map((n) => new WeakRef(n));
            })();

            await expectCollected(refs);
            for (const ref of refs) {
                expect(ref.deref()).toBeUndefined();
            }
        });
    });
});
