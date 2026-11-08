import { describe, test, expect } from "#test-runner";
import { signal, resource, root, batch, flush, c, REFUSE, PANIC, FATAL, refuse, panic, OPT_DEFER, OPT_STABLE, OPT_SETUP, OPT_WEAK, OPT_EAGER } from "#anod-src";

/**
 * Exploratory tests: ownership, disposal, cleanup/finalize and error
 * handling/recovery. Tests marked BUG are expected to fail against the
 * current engine; the comment above each states expected vs actual and
 * the root cause.
 */

describe("ownership", () => {
    test("owned child effects and computes are disposed when the parent re-runs", () => {
        const s = signal(0);
        const inner = signal(0);
        const log = [];
        let childEffect;
        let childCompute;
        root((r) => {
            r.effect((cx) => {
                const v = cx.val(s);
                childCompute = cx.compute((cc) => cc.val(inner) + v);
                cx.cleanup(() => log.push("parent-cleanup:" + v));
                childEffect = cx.effect((c2) => {
                    log.push("child:" + v + ":" + c2.val(inner));
                    c2.cleanup(() => log.push("child-cleanup:" + v));
                });
            });
        });
        const oldEffect = childEffect;
        const oldCompute = childCompute;
        s.set(1);
        expect(oldEffect.disposed).toBe(true);
        expect(oldCompute.disposed).toBe(true);
        expect(childEffect.disposed).toBe(false);
        log.length = 0;
        inner.set(5);
        /** Only the new child reacts; the old one is gone for good. */
        expect(log).toEqual(["child-cleanup:1", "child:1:5"]);
        expect(childCompute.get()).toBe(6);
    });

    test("owned siblings are disposed in reverse creation order", () => {
        const log = [];
        const r1 = root((r) => {
            for (let i = 0; i < 4; i++) {
                r.effect((cx) => {
                    cx.cleanup(() => log.push(i));
                });
            }
        });
        r1.dispose();
        expect(log).toEqual([3, 2, 1, 0]);
    });

    test("effects nested beyond the initial level table update and dispose", () => {
        const s = signal(0);
        const runs = [];
        let leaf;
        const r1 = root((r) => {
            const nest = (owner, depth) => {
                owner.effect((cx) => {
                    if (depth === 6) {
                        runs.push(cx.val(s));
                        leaf = cx;
                        return;
                    }
                    nest(cx, depth + 1);
                });
            };
            nest(r, 0);
        });
        s.set(1);
        s.set(2);
        expect(runs).toEqual([0, 1, 2]);
        r1.dispose();
        expect(leaf.disposed).toBe(true);
        s.set(3);
        expect(runs).toEqual([0, 1, 2]);
    });

    test("a root created inside an effect is not owned by it", () => {
        const s = signal(0);
        const log = [];
        let inner;
        const outer = root((r) => {
            r.effect((cx) => {
                cx.val(s);
                if (inner === undefined) {
                    inner = root((r2) => {
                        r2.effect((c2) => {
                            log.push(c2.val(s));
                        });
                    });
                }
            });
        });
        outer.dispose();
        expect(inner.disposed).toBe(false);
        s.set(1);
        expect(log).toEqual([0, 1]);
        inner.dispose();
    });

    /**
     * BUG (medium). Expected: a disposed child is dropped from its owner's
     * `_owned` list (or at least not accumulated forever). Actual: every
     * child created through a long-lived owner and later disposed stays in
     * `_owned` until the owner itself is disposed or re-runs, so a root that
     * creates and disposes effects on demand grows without bound.
     * Root cause: dispose()/_dispose never unlink from the owner; only
     * clearOwned (src/internal.js:3133) empties the array. addOwned
     * (src/internal.js:3118) only ever appends.
     */
    test("disposed children are not retained by a long-lived root", () => {
        let ctx;
        const r1 = root((r) => {
            ctx = r;
        });
        for (let i = 0; i < 100; i++) {
            const e = ctx.effect(() => { });
            e.dispose();
        }
        expect(r1._owned === null || r1._owned.length < 100).toBe(true);
        r1.dispose();
    });
});

describe("disposal timing", () => {
    test("an effect that disposes itself mid-run finishes the run and never runs again", () => {
        const s = signal(0);
        const log = [];
        root((r) => {
            r.effect((cx) => {
                const v = cx.val(s);
                cx.cleanup(() => log.push("cleanup:" + v));
                if (v === 1) {
                    cx.dispose();
                    log.push("after-dispose:" + v);
                }
                log.push("run:" + v);
            });
        });
        s.set(1);
        expect(log).toEqual(["run:0", "cleanup:0", "after-dispose:1", "run:1", "cleanup:1"]);
        s.set(2);
        expect(log.length).toBe(5);
    });

    test("an effect that disposes its root mid-flush stops every sibling", () => {
        const s = signal(0);
        const log = [];
        let r1;
        r1 = root((r) => {
            r.effect((cx) => {
                if (cx.val(s) === 1) {
                    r1.dispose();
                }
            });
            r.effect((cx) => {
                log.push("b:" + cx.val(s));
            });
        });
        s.set(1);
        expect(r1.disposed).toBe(true);
        const settled = log.length;
        s.set(2);
        s.set(3);
        expect(log.length).toBe(settled);
    });

    test("a root disposed by its own effect during setup rejects new children", () => {
        let threw = false;
        let disposedAfterEffect;
        root((r) => {
            r.effect(() => {
                r.dispose();
            });
            disposedAfterEffect = r.disposed;
            try {
                r.effect(() => { });
            } catch (e) {
                threw = true;
            }
        });
        expect(disposedAfterEffect).toBe(true);
        expect(threw).toBe(true);
    });

    test("dispose inside a batch wins over a write in the same batch", () => {
        const s = signal(0);
        const log = [];
        let e;
        root((r) => {
            e = r.effect((cx) => {
                log.push(cx.val(s));
            });
        });
        batch(() => {
            s.set(1);
            e.dispose();
        });
        expect(log).toEqual([0]);
        expect(e.disposed).toBe(true);
    });

    test("disposing twice runs cleanup once", () => {
        let calls = 0;
        let e;
        const r1 = root((r) => {
            e = r.effect((cx) => {
                cx.cleanup(() => calls++);
            });
        });
        e.dispose();
        e.dispose();
        r1.dispose();
        r1.dispose();
        expect(calls).toBe(1);
    });

    /**
     * BUG (medium). Expected: a write from a cleanup that runs during
     * root.dispose() does not re-run a sibling that is being torn down by
     * the same dispose. Actual: E1 re-runs with the new value during the
     * root's disposal, before clearOwned reaches it.
     * Root cause: idle dispose() calls _dispose() directly without leaving
     * IDLE (src/internal.js:432-433), so `s.set()` inside the cleanup flushes
     * immediately (src/internal.js:546) while clearOwned
     * (src/internal.js:3133) is half-way through the owned list.
     */
    test("a cleanup write during root disposal does not re-run a sibling being disposed", () => {
        const s = signal(0);
        const log = [];
        const r1 = root((r) => {
            r.effect((cx) => {
                log.push("e1:" + cx.val(s));
            });
            r.effect((cx) => {
                cx.cleanup(() => s.set(1));
            });
        });
        r1.dispose();
        expect(log).toEqual(["e1:0"]);
    });

    /**
     * BUG (medium). Expected: if the root callback throws, the effects it
     * already created are disposed (the caller never gets the root back, so
     * nothing else can dispose them). Actual: they stay alive and keep
     * reacting forever.
     * Root cause: startRoot (src/internal.js:4143-4151) uses try/finally only
     * for IDLE and never disposes the half-built root on a throw.
     */
    test("a root callback that throws does not leave its effects running", () => {
        const s = signal(0);
        const log = [];
        try {
            root((r) => {
                r.effect((cx) => {
                    log.push(cx.val(s));
                });
                throw new Error("setup failed");
            });
        } catch (e) { }
        s.set(1);
        expect(log).toEqual([0]);
    });

});

describe("cleanup and finalize", () => {
    test("cleanup unwinds in reverse and finalize runs forward within one activation", () => {
        const s = signal(0);
        const log = [];
        root((r) => {
            r.effect((cx) => {
                const v = cx.val(s);
                cx.cleanup(() => log.push("c1:" + v));
                cx.cleanup(() => log.push("c2:" + v));
                cx.finalize(() => log.push("f1:" + v));
                cx.finalize(() => log.push("f2:" + v));
                log.push("run:" + v);
            });
        });
        s.set(1);
        expect(log).toEqual([
            "run:0", "f1:0", "f2:0",
            "c2:0", "c1:0", "run:1", "f1:1", "f2:1"
        ]);
    });

    test("cleanup and finalize may write signals without looping", () => {
        const s = signal(0);
        const cleaned = signal(0);
        const finalized = signal(0);
        const seen = [];
        root((r) => {
            r.effect((cx) => {
                const v = cx.val(s);
                cx.cleanup(() => cleaned.set(v + 100));
                cx.finalize(() => finalized.set(v + 200));
            });
            r.effect((cx) => {
                seen.push([cx.val(cleaned), cx.val(finalized)]);
            });
        });
        s.set(1);
        expect(cleaned.get()).toBe(100);
        expect(finalized.get()).toBe(201);
        expect(seen[seen.length - 1]).toEqual([100, 201]);
    });

    test("a cleanup on an owned compute runs when the owning effect re-runs", () => {
        const s = signal(0);
        const log = [];
        root((r) => {
            r.effect((cx) => {
                const v = cx.val(s);
                const comp = cx.compute((cc) => {
                    cc.cleanup(() => log.push("compute-cleanup:" + v));
                    return v;
                });
                comp.get();
            });
        });
        s.set(1);
        expect(log).toEqual(["compute-cleanup:0"]);
    });

    /**
     * BUG (high). Expected: a cleanup that throws when the effect re-runs is
     * reported to recover; if the effect recovers itself it stays alive and
     * keeps reacting, and the throwing cleanup is not kept for a second run.
     * Actual: the effect never runs again (it is a zombie: alive, not
     * disposed, but deaf to its deps).
     * Root cause: EffectProto._update calls clearCleanup before its
     * try/finally (src/internal.js:2524-2525), so the throw skips the
     * `this._flag &= ~(FLAG_SETUP | FLAG_STALE | FLAG_PENDING)` in that
     * finally (src/internal.js:2623). The effect keeps FLAG_STALE, and
     * notify() never re-enqueues a STALE node (src/internal.js:3379).
     */
    test("a cleanup that throws on re-run does not deafen a self-recovered effect", () => {
        const s = signal(0);
        const log = [];
        root((r) => {
            r.effect((cx) => {
                cx.recover(() => true);
                const v = cx.val(s);
                log.push(v);
                if (v === 0) {
                    cx.cleanup(() => {
                        throw new Error("cleanup boom");
                    });
                }
            });
        });
        s.set(1);
        s.set(2);
        expect(log[log.length - 1]).toBe(2);
    });

    /**
     * BUG (high). Expected: a cleanup that throws runs once, and the failure
     * reaches the caller as an anod `{ error, type: FATAL }` like any other
     * effect error. Actual: the cleanup runs twice and a raw Error escapes
     * flush().
     * Root cause: clearCleanup's single-fn form only nulls `_cleanup` after
     * the call returns (src/internal.js:3070-3071). The throw escapes
     * _update, flushEffects' catch disposes the node, and _dispose calls
     * clearCleanup again (src/internal.js:2731). The second throw escapes
     * the catch block of flushEffects (src/internal.js:4244-4256).
     */
    test("a cleanup that throws on re-run runs once and surfaces as a FATAL error", () => {
        const s = signal(0);
        let calls = 0;
        let e;
        root((r) => {
            e = r.effect((cx) => {
                if (cx.val(s) === 0) {
                    cx.cleanup(() => {
                        calls++;
                        throw new Error("cleanup boom");
                    });
                }
            });
        });
        let caught = null;
        try {
            s.set(1);
        } catch (err) {
            caught = err;
        }
        expect(calls).toBe(1);
        expect(caught.type).toBe(FATAL);
        expect(caught.error.message).toBe("cleanup boom");
        expect(e.disposed).toBe(true);
    });

    /**
     * BUG (medium-high). Expected: root.dispose() always tears down owned
     * effects, even if one of the root's own cleanups throws (finalize
     * already swallows; cleanup at least must not abort disposal). Actual:
     * the root reports `disposed === true` but its effect keeps running.
     * Root cause: RootProto._dispose runs clearCleanup before clearOwned
     * with no protection (src/internal.js:1810-1815); the throw skips
     * clearOwned. EffectProto._dispose has the same shape
     * (src/internal.js:2730-2735).
     */
    test("a throwing root cleanup does not keep owned effects alive", () => {
        const s = signal(0);
        const log = [];
        const r1 = root((r) => {
            r.cleanup(() => {
                throw new Error("root cleanup boom");
            });
            r.effect((cx) => {
                log.push(cx.val(s));
            });
        });
        try {
            r1.dispose();
        } catch (e) { }
        expect(r1.disposed).toBe(true);
        s.set(1);
        expect(log).toEqual([0]);
    });
});

describe("error propagation", () => {
    /**
     * BUG (high). Expected: an effect created on the global `c` that throws
     * surfaces the documented `{ error, type: FATAL }` object. Actual:
     * TypeError "undefined is not an object (evaluating 'recover.length')".
     * Root cause: global-c effects get the Clock instance as `_owner`
     * (`new Effect(..., this, ...)`, src/internal.js:2874). tryRecover walks
     * into it (src/internal.js:3187-3192), but Clock.prototype defines no
     * `_recover` (src/internal.js:240-244). _checkRecover sees `undefined !==
     * null` and calls `.length` on undefined (src/internal.js:3149-3156).
     */
    test("an unowned effect that throws on creation surfaces a FATAL error", () => {
        let caught = null;
        try {
            c.effect(() => {
                throw new Error("boom");
            });
        } catch (e) {
            caught = e;
        }
        expect(caught instanceof TypeError).toBe(false);
        expect(caught.type).toBe(FATAL);
        expect(caught.error.message).toBe("boom");
    });

    /**
     * BUG (high). Same root cause as above, on the re-run path. Expected: a
     * global-c effect that throws on re-run is disposed and the error is a
     * FATAL object. Actual: a TypeError escapes and the effect is never
     * disposed (tryRecover throws before `node._dispose()` at
     * src/internal.js:4250-4252).
     */
    test("an unowned effect that throws on re-run is disposed", () => {
        const s = signal(0);
        const e = c.effect((cx) => {
            if (cx.val(s) === 1) {
                throw new Error("boom");
            }
        });
        let caught = null;
        try {
            s.set(1);
        } catch (err) {
            caught = err;
        }
        expect(caught instanceof TypeError).toBe(false);
        expect(e.disposed).toBe(true);
    });

    /**
     * BUG (high). Expected: an unhandled throw from a child effect created
     * during its parent's run reaches the caller as `{ error: Error, type:
     * FATAL }`, and each recover handler on the owner chain is asked once.
     * Actual: the outer and root handlers are each called twice, and the
     * second call (plus the final throw) gets a double-wrapped
     * `{ error: { error, type }, type: FATAL }`.
     * Root cause: startEffect's non-idle branch rethrows the already-wrapped
     * error after tryRecover returned RECOVER_NONE (src/internal.js:4216-4218).
     * The parent's catch then wraps it again (src/internal.js:4191) and runs
     * tryRecover a second time over the same owners.
     */
    test("an unhandled child-effect throw is wrapped once and each handler sees it once", () => {
        const calls = [];
        let caught = null;
        try {
            root((r) => {
                r.recover((e) => {
                    calls.push(["root", e.type, e.error instanceof Error]);
                    return false;
                });
                r.effect((cx) => {
                    cx.recover((e) => {
                        calls.push(["outer", e.type, e.error instanceof Error]);
                        return false;
                    });
                    cx.effect(() => {
                        throw new Error("inner");
                    });
                });
            });
        } catch (e) {
            caught = e;
        }
        expect(calls).toEqual([["outer", FATAL, true], ["root", FATAL, true]]);
        expect(caught.type).toBe(FATAL);
        expect(caught.error.message).toBe("inner");
    });

    /**
     * BUG (high). Same unhandled child-effect throw, PANIC flavour. Expected:
     * the PANIC type survives to the caller. Actual: it reaches the caller
     * as FATAL wrapping the PANIC object.
     * Root cause: as above (src/internal.js:4191 wraps every non-own-panic
     * throw).
     */
    test("an unhandled child-effect panic keeps its PANIC type", () => {
        let caught = null;
        try {
            root((r) => {
                r.effect((cx) => {
                    cx.effect((c2) => {
                        c2.panic("nope");
                    });
                });
            });
        } catch (e) {
            caught = e;
        }
        expect(caught).toEqual(panic("nope"));
    });

    /**
     * BUG (high). Expected: an unbound compute that reads an errored dep via
     * c.val() ends up with the same error value as a bound compute on that
     * dep. The bound path passes the dep's `{ error, type }` through
     * unchanged. Actual: the unbound compute stores
     * `{ error: { error: "neg", type: REFUSE }, type: FATAL }`, and each extra
     * unbound hop adds another layer.
     * Root cause: val() rethrows the dep's error object
     * (src/internal.js:476-477). ComputeProto._update's catch wraps any
     * throw that is not its own panic as FATAL (src/internal.js:2369-2374),
     * while the bound path copies dep._value (src/internal.js:2309-2312).
     */
    test("an unbound compute propagates a dep's error like a bound compute does", () => {
        const s = signal(-1);
        const a = c.compute((cx) => {
            const v = cx.val(s);
            return v < 0 ? cx.refuse("neg") : v;
        });
        const bound = c.compute(a, (v) => v * 2);
        const unbound = c.compute((cx) => cx.val(a) * 2);
        expect(bound.get()).toEqual(refuse("neg"));
        expect(unbound.get()).toEqual(refuse("neg"));
    });

    /**
     * BUG (medium-high). Expected: when an effect reads a compute that
     * refused, the recover handler sees the REFUSE error (README: "This lets
     * you cleanly separate expected errors from unexpected crashes").
     * Actual: the handler gets
     * `{ error: { error: "neg", type: REFUSE }, type: FATAL }`, so a handler
     * that filters on FATAL treats the validation failure as a crash.
     * Root cause: val() / the bound effect path rethrows the dep's error
     * object (src/internal.js:477, 2548). flushEffects/startEffect wrap it
     * as FATAL because the effect itself never panicked
     * (src/internal.js:4191, 4248).
     */
    test("an effect reading a refused compute hands recover the REFUSE error", () => {
        const s = signal(-1);
        let unbound = null;
        let bound = null;
        root((r) => {
            const a = r.compute((cx) => {
                const v = cx.val(s);
                return v < 0 ? cx.refuse("neg") : v;
            });
            r.effect((cx) => {
                cx.recover((e) => {
                    unbound = e;
                    return true;
                });
                cx.val(a);
            });
            r.effect((cx) => {
                cx.recover((e) => {
                    bound = e;
                    return true;
                });
                cx.effect(a, () => { });
            });
        });
        expect(unbound).toEqual(refuse("neg"));
        expect(bound).toEqual(refuse("neg"));
    });

    /**
     * BUG (medium-high). Async counterpart. Expected: a spawn that awaits a
     * failed task without catching hands recover the task's
     * `{ error: Error, type: FATAL }`, the same object a try/catch around
     * the await receives (see test/async.test.js "caught.error.message").
     * Actual: recover gets `{ error: { error: Error, type: FATAL }, type: FATAL }`.
     * Root cause: the rejected suspend() promise carries the task's error
     * object. resolvePromise routes it to node._error (src/internal.js:3698),
     * and EffectProto._error wraps it as FATAL again (src/internal.js:2710-2712).
     */
    test("a spawn awaiting a failed task hands recover the task's error unwrapped", async () => {
        let seen = null;
        const r1 = root((r) => {
            const t = r.task(async (cx) => {
                await cx.suspend(Promise.resolve());
                throw new Error("task fail");
            });
            r.spawn(async (cx) => {
                cx.recover((e) => {
                    seen = e;
                    return true;
                });
                await cx.suspend(t);
            });
        });
        for (let i = 0; i < 5; i++) {
            await Promise.resolve();
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
        expect(seen.type).toBe(FATAL);
        expect(seen.error instanceof Error).toBe(true);
        expect(seen.error.message).toBe("task fail");
        r1.dispose();
    });

    test("a disposed compute is not re-run by get() and c.val() reports ILLEGAL_READ as FATAL", () => {
        let calls = 0;
        let got = "unset";
        let seen = null;
        const r1 = root((r) => {
            const comp = r.compute(() => {
                calls++;
                return 1;
            });
            comp.dispose();
            /** A disposed compute has no value: get() throws (D4). */
            try {
                comp.get();
            } catch (err) {
                got = err.message;
            }
            r.effect((cx) => {
                cx.recover((e) => {
                    seen = e;
                    return true;
                });
                cx.val(comp);
            });
        });
        expect(calls).toBe(1);
        expect(got).toBe("Cannot read a disposed node or yourself");
        expect(seen.type).toBe(FATAL);
        expect(seen.error.message).toBe("Cannot read a disposed node or yourself");
        r1.dispose();
    });

    /**
     * BUG (high). Expected: a panic caught inside one activation does not
     * change how a later activation's unexpected throw is classified. Actual:
     * the next run's `throw new Error("real")` reaches recover as a raw Error
     * (no `{ error, type }` wrapper, `type` undefined).
     * Root cause: panic() sets FLAG_PANIC on the effect
     * (src/internal.js:1086). Only the error path clears it
     * (src/internal.js:4249). EffectProto._update never resets it at the
     * start of a run (src/internal.js:2516-2536), unlike
     * ComputeProto._update (src/internal.js:2278-2288).
     */
    test("a panic caught in one run does not leak FLAG_PANIC into the next run", () => {
        const s = signal(0);
        const seen = [];
        root((r) => {
            r.effect((cx) => {
                cx.recover((e) => {
                    seen.push(e);
                    return true;
                });
                const v = cx.val(s);
                if (v === 0) {
                    try {
                        cx.panic("handled locally");
                    } catch (_) { }
                }
                if (v === 1) {
                    throw new Error("real");
                }
            });
        });
        s.set(1);
        expect(seen.length).toBe(1);
        expect(seen[0] instanceof Error).toBe(false);
        expect(seen[0].type).toBe(FATAL);
        expect(seen[0].error.message).toBe("real");
    });

    /**
     * BUG (high). Expected: effect C's creation only triggers a downstream
     * effect, which throws with no handler. That error is not C's: C stays
     * alive and C's root handler is not asked about it (or at least not
     * with a double-wrapped error). Actual: startEffect attributes the
     * downstream error to C, wraps it again, hands it to C's root recover
     * and disposes C.
     * Root cause: in startEffect's idle branch the trailing `flush()` sits
     * inside the same try as `node._update(TIME)` (src/internal.js:4181-4186),
     * so the catch (src/internal.js:4187-4199) treats every error from that
     * flush as the new node's own.
     */
    test("an effect is not disposed for an error thrown by an effect it triggered", () => {
        const trigger = signal(0);
        const s = signal(0);
        const seen = [];
        const runs = [];
        root((r) => {
            r.effect((cx) => {
                if (cx.val(trigger) === 1) {
                    throw new Error("downstream");
                }
            });
        });
        /** Created after setup: an error escaping root() would dispose the root. */
        const r2 = root((r2) => {
            r2.recover((e) => {
                seen.push(e);
                return true;
            });
        });
        let creator;
        try {
            /** The downstream error escapes this call, so capture the node from its context. */
            r2.effect((cx) => {
                creator = cx;
                runs.push(cx.val(s));
                trigger.set(1);
            });
        } catch (e) { }
        expect(creator.disposed).toBe(false);
        s.set(1);
        expect(runs).toEqual([0, 1]);
    });

    test("an effect that throws on creation under a recovering root does not stop root setup", () => {
        const log = [];
        let failed;
        const r1 = root((r) => {
            r.recover((e) => {
                log.push("recovered:" + e.error.message);
                return true;
            });
            failed = r.effect(() => {
                throw new Error("init");
            });
            r.effect(() => {
                log.push("second");
            });
        });
        expect(log).toEqual(["recovered:init", "second"]);
        expect(failed.disposed).toBe(true);
        r1.dispose();
    });

    test("deep owner recovery disposes only the failing node", () => {
        const s = signal(0);
        const log = [];
        let mid;
        let leaf;
        root((r) => {
            r.recover((e) => {
                log.push("root:" + e.error.message);
                return true;
            });
            r.effect((cx) => {
                mid = cx.effect((c2) => {
                    leaf = c2.effect((c3) => {
                        if (c3.val(s) === 1) {
                            throw new Error("leaf");
                        }
                        log.push("leaf:" + c3.val(s));
                    });
                });
            });
        });
        s.set(1);
        expect(log).toEqual(["leaf:0", "root:leaf"]);
        expect(leaf.disposed).toBe(true);
        expect(mid.disposed).toBe(false);
    });

    test("an effect that recovers itself re-runs once the errored compute heals", () => {
        const s = signal(-1);
        const log = [];
        root((r) => {
            const a = r.compute((cx) => {
                const v = cx.val(s);
                if (v < 0) {
                    throw new Error("bad:" + v);
                }
                return v;
            });
            r.effect((cx) => {
                cx.recover((e) => {
                    log.push("recover");
                    return true;
                });
                log.push("val:" + cx.val(a));
            });
        });
        expect(log).toEqual(["recover"]);
        s.set(4);
        expect(log).toEqual(["recover", "val:4"]);
        s.set(-2);
        s.set(5);
        expect(log).toEqual(["recover", "val:4", "recover", "val:5"]);
    });

    test("c.rejected() tracks error state reactively without throwing", () => {
        const s = signal(1);
        const states = [];
        root((r) => {
            const a = r.compute((cx) => {
                const v = cx.val(s);
                return v > 10 ? cx.refuse("too large") : v;
            });
            r.effect((cx) => {
                const err = cx.rejected(a);
                states.push(err === null ? "ok:" + a.get() : "err:" + err.error + ":" + err.type);
            });
        });
        s.set(20);
        s.set(2);
        expect(states).toEqual(["ok:1", "err:too large:" + REFUSE, "ok:2"]);
    });

    test("stable and weak computes recover once their dep stops throwing", () => {
        const s = signal(-1);
        const make = (opts) => c.compute((cx) => {
            const v = cx.val(s);
            if (v < 0) {
                throw new Error("neg");
            }
            return v * 10;
        }, undefined, opts);
        const stable = make(OPT_STABLE);
        const weak = make(OPT_WEAK);
        expect(stable.error).toBe(true);
        expect(weak.error).toBe(true);
        s.set(2);
        expect(stable.get()).toBe(20);
        expect(stable.error).toBe(false);
        expect(weak.get()).toBe(20);
        const seen = [];
        const e = c.effect(weak, (v) => seen.push(v));
        e.dispose();
        /** Weak compute dropped its value; it must re-derive the error, then heal. */
        s.set(-1);
        expect(weak.get().error.message).toBe("neg");
        s.set(3);
        expect(weak.get()).toBe(30);
        expect(seen).toEqual([20]);
    });

    test("c.equal(true) before a throw does not suppress the error downstream", () => {
        const s = signal(0);
        const seen = [];
        root((r) => {
            const a = r.compute((cx) => {
                const v = cx.val(s);
                cx.equal(true);
                if (v === 1) {
                    throw new Error("x");
                }
                return 0;
            });
            r.effect((cx) => {
                seen.push(cx.rejected(a) === null ? "ok" : "err");
            });
        });
        s.set(1);
        expect(seen).toEqual(["ok", "err"]);
    });
});

describe("engine state after errors", () => {
    test("a throw in one flat effect does not stop siblings in the same queue", () => {
        const s = signal(0);
        const log = [];
        let bad;
        root((r) => {
            bad = r.effect((cx) => {
                if (cx.val(s) === 1) {
                    throw new Error("bad");
                }
            });
            r.effect((cx) => {
                log.push(cx.val(s));
            });
        });
        let caught = null;
        try {
            s.set(1);
        } catch (e) {
            caught = e;
        }
        expect(caught.error.message).toBe("bad");
        expect(bad.disposed).toBe(true);
        s.set(2);
        expect(log).toEqual([0, 1, 2]);
    });

    /**
     * BUG (high). Expected: `victim.dispose()` called by an effect during a
     * flush takes effect even if another effect in that flush throws.
     * Actual: the dispose is silently dropped, and the victim stays alive
     * and keeps running.
     * Root cause: as above: DISPOSER_COUNT is zeroed in flush()'s `finally`
     * (src/internal.js:4360-4361) without draining DISPOSES.
     */
    test("a dispose queued by an effect survives another effect throwing in the same flush", () => {
        const s = signal(0);
        const other = signal(0);
        let runs = 0;
        let victim;
        root((r) => {
            victim = r.effect((cx) => {
                cx.val(other);
                runs++;
            });
            r.effect((cx) => {
                const v = cx.val(s);
                cx.effect(() => { });
                if (v === 1) {
                    victim.dispose();
                }
            });
            r.effect((cx) => {
                if (cx.val(s) === 1) {
                    throw new Error("boom");
                }
            });
        });
        try {
            s.set(1);
        } catch (e) { }
        other.set(1);
        expect(victim.disposed).toBe(true);
        expect(runs).toBe(1);
    });

    /**
     * BUG (high). Expected: if a recover handler itself throws, the failing
     * effect is still disposed, and its siblings in the same flush still
     * run and keep reacting. Actual: the failing effect stays alive (and
     * runs again on the next change), and the sibling behind it in the
     * queue is deaf from then on.
     * Root cause: tryRecover is called unguarded inside flushEffects' catch
     * (src/internal.js:4250). A throwing handler escapes before
     * `node._dispose()` (src/internal.js:4251-4253) and aborts the rest of
     * the queue, whose nodes keep FLAG_STALE (see notify,
     * src/internal.js:3379).
     */
    test("a throwing recover handler still disposes the effect and keeps siblings alive", () => {
        const s = signal(0);
        const log = [];
        let bad;
        root((r) => {
            r.recover(() => {
                throw new Error("handler boom");
            });
            bad = r.effect((cx) => {
                if (cx.val(s) === 1) {
                    throw new Error("boom");
                }
            });
            r.effect((cx) => {
                log.push(cx.val(s));
            });
        });
        try {
            s.set(1);
        } catch (e) { }
        expect(bad.disposed).toBe(true);
        s.set(2);
        expect(log).toEqual([0, 1, 2]);
    });

});
