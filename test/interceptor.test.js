import { describe, test, expect } from "#test-runner";
import { signal, relay, root, batch } from "#anod";

const tick = () => Promise.resolve();
const settle = () => tick().then(tick).then(tick);

describe("contextual set (interceptor pattern)", () => {
    test("effect can read and write to the same signal without looping", () => {
        root((c) => {
            const count = signal(0);
            let runs = 0;
            c.effect(count, (val, c) => {
                runs++;
                c.set(count, val + 1);
            });
            /** Initial run sees 0, writes 1. The write is deferred to
             *  drain time. When it drains, the effect is paused so it
             *  doesn't re-run from its own write. */
            expect(runs).toBe(1);
            expect(count.get()).toBe(1);

            /** External write triggers the effect normally. */
            count.set(10);
            expect(runs).toBe(2);
            expect(count.get()).toBe(11);
        });
    });

    test("compute can read and write to the same signal", () => {
        root((c) => {
            const s = signal(5);
            const doubled = c.compute(s, (val, c) => {
                c.set(s, val * 2);
                return val;
            });
            /** Compute reads s=5, writes s=10 via guarded assign.
             *  The compute itself is paused during the write. */
            expect(doubled.get()).toBe(5);
            expect(s.get()).toBe(10);
        });
    });

    test("paused receiver ignores transitive notifications", () => {
        root((c) => {
            const s = signal(0);
            const derived = c.compute(s, (val) => val + 100);
            let effectRuns = 0;
            c.effect((c) => {
                effectRuns++;
                let val = c.val(s);
                c.val(derived);
                if (val === 0) {
                    c.set(s, 1);
                }
            });
            /** Effect depends on both s and derived (which also depends on s).
             *  The c.set(s, 1) triggers both paths, but the effect is paused
             *  so neither the direct nor transitive notification re-enqueues it. */
            expect(effectRuns).toBe(1);
            expect(s.get()).toBe(1);
            expect(derived.get()).toBe(101);

            /** External write triggers the effect. */
            s.set(5);
            expect(effectRuns).toBe(2);
        });
    });

    test("external writes still trigger the effect after a guarded write", () => {
        root((c) => {
            const s = signal("a");
            let seen = [];
            c.effect(s, (val, c) => {
                seen.push(val);
                if (val === "a") {
                    c.set(s, "b");
                }
            });
            /** Initial: sees "a", writes "b". Effect doesn't re-run. */
            expect(seen).toEqual(["a"]);
            expect(s.get()).toBe("b");

            /** External write: effect runs normally. */
            s.set("c");
            expect(seen).toEqual(["a", "c"]);
        });
    });

    test("guarded write works inside batch", () => {
        root((c) => {
            const a = signal(0);
            const b = signal(0);
            let runs = 0;
            c.effect((c) => {
                runs++;
                let val = c.val(a);
                c.val(b);
                if (val > 0) {
                    c.set(b, val * 10);
                }
            });
            expect(runs).toBe(1);

            a.set(5);
            /** Effect runs from a changing, writes b=50 via guarded assign.
             *  Effect does NOT re-run from its own b write. */
            expect(runs).toBe(2);
            expect(b.get()).toBe(50);
        });
    });

    test("multiple guarded writes in one effect body", () => {
        root((c) => {
            const x = signal(1);
            const y = signal(1);
            let runs = 0;
            c.effect((c) => {
                runs++;
                let xv = c.val(x);
                let yv = c.val(y);
                if (xv !== yv) {
                    c.set(y, xv);
                }
            });
            expect(runs).toBe(1);

            x.set(5);
            expect(runs).toBe(2);
            expect(y.get()).toBe(5);
        });
    });

    test("guarded write with relay always notifies", () => {
        root((c) => {
            const r = relay({ count: 0 });
            let runs = 0;
            c.effect(r, (val, c) => {
                runs++;
                if (val.count === 0) {
                    val.count = 1;
                    c.set(r, val);
                }
            });
            expect(runs).toBe(1);
            expect(r.get().count).toBe(1);

            /** External set triggers normally. */
            r.set({ count: 5 });
            expect(runs).toBe(2);
        });
    });

    test("guarded write with updater function", () => {
        root((c) => {
            const s = signal(10);
            c.effect(s, (val, c) => {
                if (val < 100) {
                    c.set(s, (prev) => prev * 2);
                }
            });
            expect(s.get()).toBe(20);

            s.set(50);
            expect(s.get()).toBe(100);
        });
    });
});

describe("contextual post (deferred interceptor)", () => {
    test("deferred write does not trigger self", async () => {
        let runs = 0;
        root((c) => {
            const s = signal(0);
            c.effect(s, (val, c) => {
                runs++;
                if (val === 0) {
                    c.post(s, 1);
                }
            });
        });
        expect(runs).toBe(1);
        await Promise.resolve();
        /** The post flushed on microtask, but the effect is paused
         *  during the drain so it doesn't re-run from its own write. */
        expect(runs).toBe(1);
    });

    test("external write after deferred still triggers effect", async () => {
        let seen = [];
        let s;
        root((c) => {
            s = signal(0);
            c.effect(s, (val, c) => {
                seen.push(val);
                if (val === 0) {
                    c.post(s, 1);
                }
            });
        });
        expect(seen).toEqual([0]);
        await Promise.resolve();
        expect(seen).toEqual([0]);

        s.set(5);
        expect(seen).toEqual([0, 5]);
    });
});

describe("optimistic update interceptor (async)", () => {
    test("server agrees — value persists", async () => {
        await new Promise((done) => {
            root((c) => {
                const name = signal("alice");
                let serverLog = [];

                c.spawn(async (c) => {
                    let val = c.val(name);
                    let snapshot = val;
                    try {
                        /** Fake server call that echoes the value back. */
                        let response = await c.suspend(
                            Promise.resolve({ ok: true, value: val })
                        );
                        if (response.value !== snapshot) {
                            c.set(name, response.value);
                        }
                        serverLog.push("saved:" + response.value);
                    } catch (e) {
                        c.set(name, snapshot);
                        serverLog.push("rollback:" + snapshot);
                    }
                });

                /** Let the initial spawn settle. */
                settle().then(() => {
                    expect(name.get()).toBe("alice");
                    expect(serverLog).toEqual(["saved:alice"]);

                    /** User writes optimistically. */
                    name.set("bob");
                    settle().then(() => {
                        expect(name.get()).toBe("bob");
                        expect(serverLog).toEqual(["saved:alice", "saved:bob"]);
                        done();
                    });
                });
            });
        });
    });

    test("server rejects — rollback to snapshot", async () => {
        await new Promise((done) => {
            root((c) => {
                const count = signal(0);
                let log = [];

                c.spawn(async (c) => {
                    let val = c.val(count);
                    let snapshot = val;
                    try {
                        await c.suspend(
                            Promise.reject(new Error("server error"))
                        );
                    } catch (e) {
                        /** Server rejected — roll back to what we had. */
                        c.set(count, snapshot);
                        log.push("rollback:" + snapshot);
                    }
                });

                settle().then(() => {
                    /** Initial save rejected, rolled back to 0. */
                    expect(count.get()).toBe(0);
                    expect(log).toEqual(["rollback:0"]);

                    /** User writes optimistically. */
                    count.set(5);
                    settle().then(() => {
                        /** Server rejects again, rolls back to 5 (the
                         *  snapshot at the time of the spawn re-run). */
                        expect(count.get()).toBe(5);
                        expect(log).toEqual(["rollback:0", "rollback:5"]);
                        done();
                    });
                });
            });
        });
    });

    test("server corrects value — c.set overwrites optimistic", async () => {
        await new Promise((done) => {
            root((c) => {
                const price = signal(100);

                c.spawn(async (c) => {
                    let val = c.val(price);
                    let snapshot = val;
                    try {
                        /** Server always clamps to max 50. */
                        let serverVal = Math.min(val, 50);
                        let response = await c.suspend(
                            Promise.resolve({ value: serverVal })
                        );
                        if (response.value !== snapshot) {
                            c.set(price, response.value);
                        }
                    } catch (e) {
                        c.set(price, snapshot);
                    }
                });

                settle().then(() => {
                    /** Server clamped 100 → 50. */
                    expect(price.get()).toBe(50);

                    /** User writes 200 optimistically. */
                    price.set(200);
                    expect(price.get()).toBe(200);

                    settle().then(() => {
                        /** Server clamped 200 → 50 again. */
                        expect(price.get()).toBe(50);
                        done();
                    });
                });
            });
        });
    });

    test("last-write-wins — rapid writes only save the last", async () => {
        await new Promise((done) => {
            root((c) => {
                const value = signal("a");
                let saves = [];

                c.spawn(async (c) => {
                    let val = c.val(value);
                    let snapshot = val;
                    try {
                        /** Simulate server latency. */
                        let response = await c.suspend(
                            new Promise((r) => setTimeout(() => r({ value: val }), 10))
                        );
                        saves.push(response.value);
                        if (response.value !== snapshot) {
                            c.set(value, response.value);
                        }
                    } catch (e) {
                        c.set(value, snapshot);
                    }
                });

                /** Rapid-fire writes — each one restarts the spawn,
                 *  dropping the in-flight request via suspend. */
                value.set("b");
                value.set("c");
                value.set("d");

                /** Only "d" should actually reach the server. */
                setTimeout(() => {
                    expect(saves).toEqual(["d"]);
                    expect(value.get()).toBe("d");
                    done();
                }, 50);
            });
        });
    });

    test("c.set rollback does not re-trigger the spawn", async () => {
        await new Promise((done) => {
            root((c) => {
                const s = signal("init");
                let spawnRuns = 0;

                c.spawn(async (c) => {
                    spawnRuns++;
                    let val = c.val(s);
                    let snapshot = val;
                    try {
                        await c.suspend(
                            Promise.reject(new Error("fail"))
                        );
                    } catch (e) {
                        /** Rollback via c.set — should NOT re-trigger
                         *  this spawn because of the interceptor pattern. */
                        c.set(s, snapshot);
                    }
                });

                settle().then(() => {
                    expect(spawnRuns).toBe(1);
                    expect(s.get()).toBe("init");

                    /** External write does trigger re-run. */
                    s.set("changed");
                    settle().then(() => {
                        expect(spawnRuns).toBe(2);
                        expect(s.get()).toBe("changed");
                        done();
                    });
                });
            });
        });
    });
});

