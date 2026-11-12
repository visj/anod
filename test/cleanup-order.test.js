import { describe, test, expect } from "#test-runner";
import { signal, root, batch, c, WEAK, DISPOSED, ERROR, FATAL } from "#anod-src";

describe("the controller is aborted before cleanups run", () => {
    test("compute re-run", () => {
        const s = signal(0);
        const seen = [];
        const comp = c.compute((cx) => {
            const v = cx.val(s);
            const signal = cx.controller().signal;
            cx.cleanup(() => seen.push(signal.aborted));
            return v;
        });
        comp.get();
        s.set(1);
        comp.get();
        expect(seen).toEqual([true]);
    });

    test("compute dispose", () => {
        const seen = [];
        const comp = c.compute((cx) => {
            const signal = cx.controller().signal;
            cx.cleanup(() => seen.push(signal.aborted));
            return 1;
        });
        comp.get();
        comp.dispose();
        expect(seen).toEqual([true]);
    });

    test("effect re-run", () => {
        const s = signal(0);
        const seen = [];
        c.effect((cx) => {
            cx.val(s);
            const signal = cx.controller().signal;
            cx.cleanup(() => seen.push(signal.aborted));
        });
        s.set(1);
        expect(seen).toEqual([true]);
    });

    test("effect dispose, for its own cleanups and its children's", () => {
        const seen = [];
        const e = c.effect((cx) => {
            const signal = cx.controller().signal;
            cx.cleanup(() => seen.push("own:" + signal.aborted));
            cx.effect((cx2) => {
                cx2.cleanup(() => seen.push("child:" + signal.aborted));
            });
        });
        e.dispose();
        expect(seen).toEqual(["child:true", "own:true"]);
    });
});

describe("teardown runs abort, then finalize, then children, then cleanups", () => {
    function inflight(s, log) {
        /** A callback suspend that never resolves keeps the run in
         *  flight, so its finalizers are still pending. */
        return c.spawn((cx) => {
            const v = cx.val(s);
            cx.controller().signal.addEventListener("abort", () => log.push("abort" + v));
            cx.cleanup(() => log.push("cleanup" + v));
            cx.finalize(() => log.push("finalize" + v));
            cx.effect((cx2) => {
                cx2.cleanup(() => log.push("child" + v));
            });
            cx.suspend(() => {});
        });
    }

    test("re-run of a run still in flight", () => {
        const s = signal(0);
        const log = [];
        inflight(s, log);
        s.set(1);
        expect(log).toEqual(["abort0", "finalize0", "child0", "cleanup0"]);
    });

    test("dispose of a run still in flight", () => {
        const s = signal(0);
        const log = [];
        const e = inflight(s, log);
        e.dispose();
        expect(log).toEqual(["abort0", "finalize0", "child0", "cleanup0"]);
    });

    test("a compute aborts before its cleanups, on re-run and dispose", () => {
        const s = signal(0);
        const log = [];
        const comp = c.compute((cx) => {
            const v = cx.val(s);
            cx.controller().signal.addEventListener("abort", () => log.push("abort" + v));
            cx.cleanup(() => log.push("cleanup" + v));
            return v;
        });
        comp.get();
        s.set(1);
        comp.get();
        comp.dispose();
        expect(log).toEqual(["abort0", "cleanup0", "abort1", "cleanup1"]);
    });
});

describe("a cleanup error never changes an outcome", () => {
    test("every cleanup still runs, in reverse order", () => {
        const s = signal(0);
        const log = [];
        c.effect((cx) => {
            cx.val(s);
            cx.cleanup(() => log.push(1));
            cx.cleanup(() => {
                log.push(2);
                throw new Error("boom");
            });
            cx.cleanup(() => log.push(3));
        });
        s.set(1);
        expect(log).toEqual([3, 2, 1]);
    });

    test("a compute's re-run is not failed by its cleanup", () => {
        const s = signal(0);
        const comp = c.compute((cx) => {
            const v = cx.val(s);
            cx.cleanup(() => {
                throw new Error("boom");
            });
            return v * 10;
        });
        expect(comp.get()).toBe(0);
        s.set(1);
        expect(comp.get()).toBe(10);
        expect(comp.is(ERROR)).toBe(false);
    });

    test("an effect's re-run goes ahead, and its recover handler is not asked", () => {
        const s = signal(0);
        const caught = [];
        let runs = 0;
        const e = c.effect((cx) => {
            runs++;
            const v = cx.val(s);
            cx.recover((err) => {
                caught.push(err);
                return true;
            });
            cx.cleanup(() => {
                throw new Error("own " + v);
            });
            cx.effect((cx2) => {
                cx2.cleanup(() => {
                    throw new Error("child " + v);
                });
            });
        });
        s.set(1);
        expect(runs).toBe(2);
        expect(caught).toEqual([]);
        expect(e.is(DISPOSED)).toBe(false);
    });

    test("an owner's recover handler is not asked either", () => {
        const s = signal(0);
        const caught = [];
        root((r) => {
            r.recover((err) => {
                caught.push(err);
                return true;
            });
            r.effect((cx) => {
                cx.val(s);
                cx.cleanup(() => {
                    throw new Error("boom");
                });
            });
        });
        s.set(1);
        expect(caught).toEqual([]);
    });

    test("a write does not throw for a cleanup", () => {
        const s = signal(0);
        c.effect((cx) => {
            cx.val(s);
            cx.cleanup(() => {
                throw new Error("boom");
            });
        });
        expect(() => s.set(1)).not.toThrow();
        expect(() => batch(() => s.set(2))).not.toThrow();
    });

    test("dispose() does not throw, and finishes the disposal", () => {
        const log = [];
        const r = root((r) => {
            r.cleanup(() => log.push("root"));
            r.effect((cx) => {
                cx.cleanup(() => {
                    log.push("child");
                    throw new Error("boom");
                });
            });
        });
        expect(() => r.dispose()).not.toThrow();
        expect(log).toEqual(["child", "root"]);
        expect(r.is(DISPOSED)).toBe(true);
    });

    test("a weak compute's cleanup error does not reach the writer", () => {
        const s = signal(0);
        const show = signal(true);
        let ran = 0;
        const weak = c.compute((cx) => {
            cx.val(s);
            cx.cleanup(() => {
                ran++;
                throw new Error("weak");
            });
            return 1;
        }, void 0, WEAK);
        c.effect((cx) => {
            if (cx.val(show)) {
                cx.val(weak);
            }
        });
        expect(() => show.set(false)).not.toThrow();
        expect(ran).toBe(1);
    });

    test("a failed first run keeps its own error when teardown throws", () => {
        let caught = null;
        try {
            c.effect((cx) => {
                cx.cleanup(() => {
                    throw new Error("cleanup");
                });
                cx.effect((cx2) => {
                    cx2.cleanup(() => {
                        throw new Error("child cleanup");
                    });
                });
                throw new Error("run");
            });
        } catch (err) {
            caught = err;
        }
        expect(caught.type).toBe(FATAL);
        expect(caught.error.message).toBe("run");
    });

    test("a failed re-run keeps its own error when teardown throws", () => {
        const s = signal(0);
        const caught = [];
        root((r) => {
            r.recover((err) => {
                caught.push(err.error.message);
                return true;
            });
            r.effect((cx) => {
                const v = cx.val(s);
                cx.cleanup(() => {
                    throw new Error("cleanup");
                });
                if (v === 1) {
                    throw new Error("run");
                }
            });
        });
        s.set(1);
        expect(caught).toEqual(["run"]);
    });
});

describe("an async run is torn down by the next run", () => {
    const tick = () => new Promise((r) => setTimeout(r, 0));

    test("async spawn whose runs settle", async () => {
        const s = signal(0);
        const log = [];
        c.spawn(async (cx) => {
            const v = cx.val(s);
            cx.cleanup(() => log.push("cleanup" + v));
            cx.effect((cx2) => {
                cx2.cleanup(() => log.push("child" + v));
            });
            await cx.suspend(Promise.resolve());
        });
        await tick();
        s.set(1);
        expect(log).toEqual(["child0", "cleanup0"]);
        await tick();
        s.set(2);
        expect(log).toEqual(["child0", "cleanup0", "child1", "cleanup1"]);
    });

    test("async spawn still in flight", () => {
        const s = signal(0);
        const log = [];
        c.spawn(async (cx) => {
            const v = cx.val(s);
            cx.controller().signal.addEventListener("abort", () => log.push("abort" + v));
            cx.cleanup(() => log.push("cleanup" + v));
            cx.finalize(() => log.push("finalize" + v));
            await cx.suspend(new Promise(() => {}));
        });
        s.set(1);
        expect(log).toEqual(["abort0", "finalize0", "cleanup0"]);
    });

    test("task whose first run is still in flight", async () => {
        const s = signal(0);
        const log = [];
        const t = c.task(async (cx) => {
            const v = cx.val(s);
            cx.cleanup(() => log.push("cleanup" + v));
            return await cx.suspend(new Promise(() => {}));
        });
        c.spawn(async (cx) => {
            await cx.suspend(t);
        });
        await tick();
        s.set(1);
        expect(log).toEqual(["cleanup0"]);
    });
});
