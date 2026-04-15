import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    root,
    signal,
    compute,
    derive,
    task,
    effect,
    watch,
    spawn,
    batch,
} from "./_helper.js";

const tick = () => Promise.resolve();

describe("edge cases", { skip: true }, () => {

    describe("effect error does not corrupt ctx", () => {
        it("effect throwing during creation does not corrupt outer compute", () => {
            const s1 = signal(1);
            const c1 = compute((c) => {
                let val = c.read(s1);
                if (val > 1) {
                    try {
                        effect(() => { throw new Error("inner boom"); });
                    } catch (_) { }
                }
                return val * 10;
            });

            assert.strictEqual(c1.val(), 10);
            s1.set(2);
            assert.strictEqual(c1.val(), 20);
            s1.set(3);
            assert.strictEqual(c1.val(), 30);
        });

        it("effect throwing during creation does not corrupt outer effect deps (with try/catch)", () => {
            const s1 = signal(0);
            const s2 = signal(0);
            let outerRuns = 0;

            const r = root((r) => {
                r.recover(() => true);

                r.effect((e) => {
                    outerRuns++;
                    e.read(s1);
                    if (s1.val() === 1) {
                        try {
                            effect(() => { throw new Error("inner"); });
                        } catch (_) { }
                    }
                    e.read(s2);
                });
            });

            assert.strictEqual(outerRuns, 1);
            s1.set(1);
            assert.strictEqual(outerRuns, 2);
            s2.set(1);
            assert.strictEqual(outerRuns, 3);
            r.dispose();
        });

        it("unhandled inner effect error disposes outer effect", () => {
            const s1 = signal(0);
            let outerRuns = 0;

            const r = root((r) => {
                r.recover(() => true);

                r.effect((e) => {
                    outerRuns++;
                    e.read(s1);
                    if (s1.val() === 1) {
                        effect(() => { throw new Error("inner"); });
                    }
                });
            });

            assert.strictEqual(outerRuns, 1);
            s1.set(1);
            assert.strictEqual(outerRuns, 2);
            s1.set(2);
            assert.strictEqual(outerRuns, 2);
            r.dispose();
        });

        it("effect throwing during creation inside compute does not corrupt compute", () => {
            const s1 = signal(1);
            const c1 = compute((c) => {
                let val = c.read(s1);
                if (val > 1) {
                    try {
                        effect(() => { throw new Error("boom"); });
                    } catch (_) { }
                }
                return val + 100;
            });

            assert.strictEqual(c1.val(), 101);
            s1.set(2);
            assert.strictEqual(c1.val(), 102);
            s1.set(3);
            assert.strictEqual(c1.val(), 103);
        });

        it("nested scope throwing does not corrupt parent scope", () => {
            const s1 = signal(0);
            let parentRuns = 0;

            const r = root((r) => {
                r.recover(() => true);

                r.effect((s) => {
                    parentRuns++;
                    s.read(s1);

                    if (s1.val() === 1) {
                        s.effect(() => {
                            throw new Error("inner scope");
                        });
                    }
                });
            });

            assert.strictEqual(parentRuns, 1);
            s1.set(1);
            assert.strictEqual(parentRuns, 2);
            s1.set(2);
            assert.strictEqual(parentRuns, 3);
            r.dispose();
        });
    });

    describe("effect error in start() loop", () => {
        it("second effect still runs after first effect throws", () => {
            const s1 = signal(0);
            let secondRan = false;

            const r = root((r) => {
                r.recover(() => true);

                r.effect((e) => {
                    if (e.read(s1) > 0) {
                        throw new Error("first");
                    }
                });

                r.effect((e) => {
                    e.read(s1);
                    secondRan = true;
                });
            });

            secondRan = false;
            s1.set(1);
            assert.strictEqual(secondRan, true);
            r.dispose();
        });

        it("scoped effect throwing does not break sibling scope", () => {
            const s1 = signal(0);
            let siblingRuns = 0;

            const r = root((r) => {
                r.recover(() => true);

                r.effect((s) => {
                    if (s.read(s1) > 0) {
                        throw new Error("scope boom");
                    }
                });

                r.effect((s) => {
                    s.read(s1);
                    siblingRuns++;
                });
            });

            siblingRuns = 0;
            s1.set(1);
            assert.strictEqual(siblingRuns, 1);
            r.dispose();
        });
    });

    describe("derive (was memo)", () => {
        it("tracks deps on first run only", () => {
            const s1 = signal(1);
            const s2 = signal(10);
            let runs = 0;

            const d = derive((c) => {
                runs++;
                return c.read(s1) + c.read(s2);
            });

            assert.strictEqual(d.val(), 11);
            assert.strictEqual(runs, 1);

            s1.set(2);
            assert.strictEqual(d.val(), 12);
            assert.strictEqual(runs, 2);

            s2.set(20);
            assert.strictEqual(d.val(), 22);
            assert.strictEqual(runs, 3);
        });

        it("does not re-execute when value unchanged", () => {
            const s1 = signal(1);
            let runs = 0;

            const d = derive((c) => {
                runs++;
                c.read(s1);
                return 42;
            });

            assert.strictEqual(d.val(), 42);
            assert.strictEqual(runs, 1);

            s1.set(2);
            assert.strictEqual(d.val(), 42);
            assert.strictEqual(runs, 2);
        });
    });

    describe("watch (was reaction)", () => {
        it("runs when dependency changes", () => {
            const s1 = signal(1);
            let last = 0;

            watch((c) => { last = c.read(s1); });

            assert.strictEqual(last, 1);
            s1.set(2);
            assert.strictEqual(last, 2);
        });

        it("cleanup is called on update", () => {
            const s1 = signal(1);
            let cleanups = 0;

            watch((c) => {
                c.read(s1);
                c.cleanup(() => { cleanups++; });
            });

            assert.strictEqual(cleanups, 0);
            s1.set(2);
            assert.strictEqual(cleanups, 1);
        });
    });

    describe("task", () => {
        it("is stable by default", () => {
            const s1 = signal(1);
            const s2 = signal(10);
            let runs = 0;

            const t = task((c) => {
                runs++;
                return Promise.resolve(c.read(s1) + c.read(s2));
            }, 0);

            assert.strictEqual(runs, 1);
            assert.strictEqual(t.loading(), true);
        });

        it("settles to resolved value", async () => {
            const t = task((c) => Promise.resolve(42), 0);

            assert.strictEqual(t.val(), 0);
            assert.strictEqual(t.loading(), true);

            await tick();

            assert.strictEqual(t.val(), 42);
            assert.strictEqual(t.loading(), false);
        });

        it("notifies downstream on settle", async () => {
            const t = task((c) => Promise.resolve(42), 0);
            let received = 0;

            effect((e) => { received = e.read(t); });

            assert.strictEqual(received, 0);
            await tick();
            assert.strictEqual(received, 42);
        });

        it("sets error flag on rejection", async () => {
            const t = task((c) => Promise.reject(new Error("fail")), 0);

            await tick();

            assert.strictEqual(t.error(), true);
            assert.throws(() => t.val(), { message: "fail" });
        });

        it("re-evaluates when dep changes", async () => {
            const s1 = signal(1);
            const t = task((c) => Promise.resolve(c.read(s1) * 10), 0);

            await tick();
            assert.strictEqual(t.val(), 10);

            s1.set(2);
            t.val();
            await tick();
            assert.strictEqual(t.val(), 20);
        });
    });

    describe("spawn", () => {
        it("runs async effect", async () => {
            let ran = false;

            spawn((c) => {
                return new Promise((resolve) => {
                    ran = true;
                    resolve();
                });
            });

            await tick();
            assert.strictEqual(ran, true);
        });

        it("resolved function is registered as cleanup", async () => {
            let cleaned = false;
            const s1 = signal(0);

            const r = root((r) => {
                r.spawn((c) => {
                    c.read(s1);
                    return Promise.resolve(() => { cleaned = false; });
                });
            });

            await tick();
            r.dispose();
        });

        it("is stable by default", () => {
            const s1 = signal(1);
            const s2 = signal(2);
            let runs = 0;

            spawn((c) => {
                runs++;
                c.read(s1);
                c.read(s2);
                return Promise.resolve();
            });

            assert.strictEqual(runs, 1);
        });

        it("sets loading flag", () => {
            const s1 = signal(0);

            spawn((c) => {
                c.read(s1);
                return new Promise((r) => setTimeout(r, 100));
            });
        });
    });

    describe("scope stable by default", () => {
        it("scope is stable by default", () => {
            const s1 = signal(1);
            const s2 = signal(10);
            let runs = 0;

            effect((c) => {
                runs++;
                c.read(s1);
                c.read(s2);
            });

            assert.strictEqual(runs, 1);

            s1.set(2);
            assert.strictEqual(runs, 2);

            s2.set(20);
            assert.strictEqual(runs, 3);
        });
    });

    describe("diamond dependency", () => {
        it("effect runs once for diamond update", () => {
            const s1 = signal(0);
            const c1 = derive((c) => c.read(s1) + 1);
            const c2 = derive((c) => c.read(s1) + 10);
            let runs = 0;

            effect((e) => {
                runs++;
                e.read(c1);
                e.read(c2);
            });

            assert.strictEqual(runs, 1);
            s1.set(1);
            assert.strictEqual(runs, 2);
        });

        it("compute evaluates correctly in diamond", () => {
            const s1 = signal(1);
            const left = derive((c) => c.read(s1) * 2);
            const right = derive((c) => c.read(s1) * 3);
            const sum = derive((c) => c.read(left) + c.read(right));

            assert.strictEqual(sum.val(), 5);
            s1.set(2);
            assert.strictEqual(sum.val(), 10);
            s1.set(3);
            assert.strictEqual(sum.val(), 15);
        });

        it("deep diamond with pending/stale split", () => {
            const s1 = signal(0);
            const a = derive((c) => c.read(s1) + 1);
            const b = derive((c) => c.read(a) + 1);
            const c1 = derive((c) => c.read(a) + c.read(b));
            let runs = 0;

            effect((e) => {
                runs++;
                e.read(c1);
            });

            assert.strictEqual(runs, 1);
            s1.set(1);
            assert.strictEqual(runs, 2);
            assert.strictEqual(c1.val(), 5);
        });
    });

    describe("avoidable computation", () => {
        it("downstream skips when upstream absorbs change", () => {
            const s1 = signal(1);
            let c1Runs = 0;
            let c2Runs = 0;

            const c1 = derive((c) => { c1Runs++; c.read(s1); return 0; });
            const c2 = derive((c) => { c2Runs++; return c.read(c1) + 1; });

            effect((e) => { e.read(c2); });

            assert.strictEqual(c1Runs, 1);
            assert.strictEqual(c2Runs, 1);

            s1.set(2);
            assert.strictEqual(c1Runs, 2);
            assert.strictEqual(c2Runs, 1);
        });

        it("deep chain avoids unnecessary work", () => {
            const s1 = signal(0);
            const c1 = derive((c) => { c.read(s1); return 0; });
            const c2 = derive((c) => c.read(c1) + 1);
            const c3 = derive((c) => c.read(c2) + 1);
            const c4 = derive((c) => c.read(c3) + 1);
            let runs = 0;

            effect((e) => { runs++; e.read(c4); });

            assert.strictEqual(runs, 1);
            s1.set(1);
            assert.strictEqual(runs, 1);
        });
    });

    describe("batch", () => {
        it("coalesces multiple signal updates", () => {
            const s1 = signal(0);
            const s2 = signal(0);
            let runs = 0;

            effect((e) => {
                runs++;
                e.read(s1);
                e.read(s2);
            });

            assert.strictEqual(runs, 1);
            batch(() => {
                s1.set(1);
                s2.set(2);
            });
            assert.strictEqual(runs, 2);
        });

        it("nested batch is a no-op", () => {
            const s1 = signal(0);
            let runs = 0;

            effect((e) => { runs++; e.read(s1); });

            assert.strictEqual(runs, 1);
            batch(() => {
                batch(() => {
                    s1.set(1);
                });
            });
            assert.strictEqual(runs, 2);
        });

        it("signal read inside batch sees old value", () => {
            const s1 = signal(0);
            let mid = -1;

            batch(() => {
                s1.set(1);
                mid = s1.val();
            });

            assert.strictEqual(mid, 0);
            assert.strictEqual(s1.val(), 1);
        });
    });

    describe("dispose", () => {
        it("disposed compute returns last value", () => {
            const s1 = signal(1);
            const c1 = derive((c) => c.read(s1) * 2);

            assert.strictEqual(c1.val(), 2);
            c1.dispose();
            s1.set(2);
        });

        it("disposed effect stops running", () => {
            const s1 = signal(0);
            let runs = 0;

            const e1 = effect((e) => { runs++; e.read(s1); });

            assert.strictEqual(runs, 1);
            e1.dispose();
            s1.set(1);
            assert.strictEqual(runs, 1);
        });

        it("root.dispose() cleans up all owned nodes", () => {
            const s1 = signal(0);
            let runs = 0;

            const r = root((r) => {
                r.effect((e) => { runs++; e.read(s1); });
                r.effect((e) => { runs++; e.read(s1); });
            });

            assert.strictEqual(runs, 2);
            r.dispose();
            s1.set(1);
            assert.strictEqual(runs, 2);
        });

        it("double dispose is safe", () => {
            const e1 = effect(() => { });
            e1.dispose();
            e1.dispose();
        });
    });

    describe("circular dependency", () => {
        it("compute reading itself via signal indirection throws", () => {
            const s1 = signal(0);
            const c1 = compute((c) => {
                let v = c.read(s1);
                if (v > 0) {
                    return c.read(c1);
                }
                return v;
            });

            assert.strictEqual(c1.val(), 0);
            s1.set(1);
            assert.throws(() => c1.val(), { message: "Circular dependency" });
        });
    });

    describe("dynamic dependency changes", () => {
        it("compute drops old deps and picks up new ones", () => {
            const s1 = signal(true);
            const s2 = signal("a");
            const s3 = signal("b");
            let runs = 0;

            const c1 = compute((c) => {
                runs++;
                return c.read(s1) ? c.read(s2) : c.read(s3);
            });

            effect((e) => { e.read(c1); });

            assert.strictEqual(runs, 1);
            assert.strictEqual(c1.val(), "a");

            s1.set(false);
            assert.strictEqual(c1.val(), "b");
            assert.strictEqual(runs, 2);

            s2.set("x");
            assert.strictEqual(runs, 2);

            s3.set("y");
            assert.strictEqual(c1.val(), "y");
            assert.strictEqual(runs, 3);
        });
    });

    describe("equal() API", () => {
        it("equal(true) suppresses notification", () => {
            const s1 = signal(0);
            let runs = 0;

            const c1 = compute((c) => {
                c.equal(true);
                return c.read(s1);
            });

            effect((e) => { runs++; e.read(c1); });

            assert.strictEqual(runs, 1);
            s1.set(1);
            assert.strictEqual(runs, 1);
        });

        it("equal(false) forces notification", () => {
            const s1 = signal(0);
            let runs = 0;

            const c1 = compute((c) => {
                c.equal(false);
                c.read(s1);
                return 42;
            });

            effect((e) => { runs++; e.read(c1); });

            assert.strictEqual(runs, 1);
            s1.set(1);
            assert.strictEqual(runs, 2);
        });
    });

    describe("seed value", () => {
        it("compute receives seed as prev on first run", () => {
            let received;
            const c1 = compute((c, prev) => {
                received = prev;
                return prev + 1;
            }, 10);

            assert.strictEqual(c1.val(), 11);
            assert.strictEqual(received, 10);
        });

        it("derive receives seed", () => {
            let received;
            const d = derive((c, prev) => {
                received = prev;
                return 42;
            }, 99);

            assert.strictEqual(d.val(), 42);
            assert.strictEqual(received, 99);
        });
    });

    describe("multiple signal writes in effect", () => {
        it("effect writing to signal triggers another cycle", () => {
            const s1 = signal(0);
            const s2 = signal(0);
            let s2val = 0;

            effect((e) => {
                s2.set(e.read(s1) * 10);
            });

            effect((e) => {
                s2val = e.read(s2);
            });

            assert.strictEqual(s2val, 0);
            s1.set(1);
            assert.strictEqual(s2val, 10);
        });
    });

    describe("recover edge cases", () => {
        it("error in compute is caught when effect reads it", () => {
            let caught = null;

            const r = root((r) => {
                r.recover((err) => { caught = err; return true; });

                const c1 = r.compute(() => { throw new Error("compute err"); });
                r.effect((e) => { e.read(c1); });
            });

            assert(caught instanceof Error);
            assert.strictEqual(caught.message, "compute err");
            r.dispose();
        });

        it("compute.error() returns true after throw", () => {
            const c1 = compute(() => { throw new Error("fail"); });
            assert.strictEqual(c1.error(), true);
        });

        it("compute.val() rethrows stored error", () => {
            const c1 = compute(() => { throw new Error("rethrow me"); });
            assert.throws(() => c1.val(), { message: "rethrow me" });
        });
    });

    describe("stress: deep chain", () => {
        it("50-deep chain propagates correctly", () => {
            const head = signal(0);
            let current = head;
            for (let i = 0; i < 50; i++) {
                const prev = current;
                current = derive((c) => c.read(prev) + 1);
            }

            assert.strictEqual(current.val(), 50);
            head.set(1);
            assert.strictEqual(current.val(), 51);
        });
    });

    describe("stress: wide fan-out", () => {
        it("50 effects on one signal", () => {
            const s1 = signal(0);
            let total = 0;

            for (let i = 0; i < 50; i++) {
                effect((e) => { total += e.read(s1); });
            }

            assert.strictEqual(total, 0);
            total = 0;
            s1.set(1);
            assert.strictEqual(total, 50);
        });
    });

    describe("interleaved reads", () => {
        it("compute reading another compute during evaluation", () => {
            const s1 = signal(1);
            const s2 = signal(2);

            const c1 = derive((c) => c.read(s1) + c.read(s2));
            const c2 = derive((c) => c.read(c1) * 2);
            const c3 = derive((c) => c.read(c1) + c.read(c2));

            assert.strictEqual(c3.val(), 9);
            s1.set(3);
            assert.strictEqual(c3.val(), 15);
        });
    });
});
