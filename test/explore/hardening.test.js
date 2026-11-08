import { describe, test, expect } from "#test-runner";
import {
    signal,
    resource,
    root,
    batch,
    c,
    REFUSE,
    PANIC,
    WEAK,
    SETUP,
    DEFER,
    EAGER,
    STABLE,
    Defect,
    DISPOSED,
    LOADING,
    ERROR,
} from "#anod-src";

/**
 * Second hardening round, on master after fix/all was merged. Every
 * numbered describe block is one bug in bugs/23-* .. bugs/38-*, and
 * every test in it fails on master. A comment above each test gives
 * the expected and the actual behavior; the README of the bug has the
 * root cause.
 *
 * The D blocks test decided design questions (bugs/design/README.md).
 * A few D9 tests guard the new mechanism and pass on master too.
 *
 * Imports come from source, like graph.test.js, because a few tests
 * check subscriber lists, whose field names are mangled in dist.
 */

const tick = () => Promise.resolve();
const settle = async (n = 10) => {
    for (let i = 0; i < n; i++) {
        await tick();
    }
};

function deferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

/** Counts occurrences of `node` in `sender`'s subscriber list. */
function subCount(sender, node) {
    let count = 0;
    if (sender._sub1 === node) {
        count++;
    }
    if (sender._subs !== null) {
        for (let i = 0; i < sender._subs.length; i += 2) {
            if (sender._subs[i] === node) {
                count++;
            }
        }
    }
    return count;
}

/** Collects `_dep1` + `_deps` of a receiver. */
function depsOf(node) {
    const out = [];
    if (node._dep1 !== null) {
        out.push(node._dep1);
    }
    if (node._deps !== null) {
        for (let i = 0; i < node._deps.length; i += 2) {
            out.push(node._deps[i]);
        }
    }
    return out;
}

describe("23: a plain write leaves a resource errored", () => {
    /**
     * Expected: a plain set() replaces the error with the new value, the
     * way the async form does ("error cleared on next successful set").
     * Actual: r.is(ERROR) stays true and r.get() is 5.
     */
    test("plain set() after a failed async write clears the error", () => {
        const r = resource(1);
        r.set(() => {
            throw new Error("boom");
        });
        expect(r.is(ERROR)).toBe(true);
        r.set(5);
        expect(r.is(ERROR)).toBe(false);
        expect(r.get()).toBe(5);
    });

    /**
     * Expected: c.val(r) returns 5.
     * Actual: c.val(r) throws the raw number 5, since FLAG_ERROR is still
     * set: a thrown value that is not a Defect.
     */
    test("c.val() of a resource rewritten after an error returns the new value", async () => {
        const r = resource(1);
        r.set(async (rc) => await rc.suspend(Promise.reject(new Error("net"))));
        await settle();
        expect(r.is(ERROR)).toBe(true);
        r.set(5);
        const seen = [];
        c.effect((cx) => {
            try {
                seen.push(["value", cx.val(r)]);
            } catch (err) {
                seen.push(["threw", err]);
            }
        });
        expect(seen).toEqual([["value", 5]]);
    });

    /** Expected: false. Actual: true (assign() never clears FLAG_ERROR). */
    test("a batched plain write clears the error", () => {
        const r = resource(1);
        r.set(() => {
            throw new Error("boom");
        });
        batch(() => {
            r.set(7);
        });
        expect(r.get()).toBe(7);
        expect(r.is(ERROR)).toBe(false);
    });

    /** Expected: false. Actual: true. */
    test("a posted plain write clears the error", async () => {
        const r = resource(1);
        r.set(() => {
            throw new Error("boom");
        });
        r.post(8);
        await settle();
        expect(r.get()).toBe(8);
        expect(r.is(ERROR)).toBe(false);
    });

    /**
     * Ending the error is a change by itself, so the write never asks
     * the equality function to compare a value with the Defect.
     * Actual: equal(Defect, { id: 1 }) is called.
     */
    test("a plain write to an errored resource does not call equal with the Defect", () => {
        const seen = [];
        const r = resource({ id: 1 }, (a, b) => {
            seen.push(a, b);
            return a.id === b.id;
        });
        r.set(() => {
            throw new Error("boom");
        });
        r.set({ id: 1 });
        expect(seen.some((v) => v instanceof Defect)).toBe(false);
        expect(r.is(ERROR)).toBe(false);
        expect(r.get()).toEqual({ id: 1 });
    });
});

describe("24: reads after a loading callback suspend corrupt dependency links", () => {
    /**
     * `e` reads two deps, calls c.suspend(task, onResolve) on a loading
     * task, then reads `b`. The read of `b` goes through subscribe()
     * while the setup run keeps its deps in DSTACK, so the slice at the
     * end of the run overwrites the `_deps` that subscribe() created.
     * `b` keeps a pair for `e` that points at `a2`'s slot. Disposing a
     * sibling of `e` in `b` repoints that slot, and disposing `e` then
     * unlinks `r2` from `a2` instead of `e`.
     *
     * Expected: both r1 and r2 run on a2.set(1).
     * Actual: only r1 runs; r2 is deaf to a2 for good.
     */
    test("reading after c.suspend(task, onResolve) does not deafen an unrelated effect", () => {
        const t = c.task((cx) => cx.suspend(new Promise(() => {})));
        const a = signal(0);
        const a2 = signal(0);
        const b = signal(0);
        const log = [];
        c.effect((cx) => {
            cx.val(a2);
            log.push("r1");
        });
        c.effect((cx) => {
            cx.val(a2);
            log.push("r2");
        });
        c.effect((cx) => {
            cx.val(b);
        });
        const o2 = c.effect((cx) => {
            cx.val(b);
        });
        const e = c.spawn((cx) => {
            cx.val(a);
            cx.val(a2);
            cx.suspend(t, () => {});
            cx.val(b);
        });
        o2.dispose();
        e.dispose();
        log.length = 0;
        a2.set(1);
        expect(log).toEqual(["r1", "r2"]);
    });

    /** Same, with the setup-function form in a sync effect (ComputeContext declares it). */
    test("reading after c.suspend(setupFn) in a sync effect does not deafen an unrelated effect", () => {
        const a = signal(0);
        const a2 = signal(0);
        const b = signal(0);
        const log = [];
        c.effect((cx) => {
            cx.val(a2);
            log.push("r1");
        });
        c.effect((cx) => {
            cx.val(a2);
            log.push("r2");
        });
        c.effect((cx) => {
            cx.val(b);
        });
        const o2 = c.effect((cx) => {
            cx.val(b);
        });
        const e = c.effect((cx) => {
            cx.val(a);
            cx.val(a2);
            cx.suspend(() => {});
            cx.val(b);
        });
        o2.dispose();
        e.dispose();
        log.length = 0;
        a2.set(1);
        expect(log).toEqual(["r1", "r2"]);
    });

    /** Same, with c.pending() as the read after the suspend, in a task. */
    test("c.pending() after c.suspend(setupFn) in a task does not deafen an unrelated effect", () => {
        const a = signal(0);
        const a2 = signal(0);
        const b = signal(0);
        const log = [];
        c.effect((cx) => {
            cx.val(a2);
            log.push("r1");
        });
        c.effect((cx) => {
            cx.val(a2);
            log.push("r2");
        });
        c.effect((cx) => {
            cx.val(b);
        });
        const o2 = c.effect((cx) => {
            cx.val(b);
        });
        const t = c.task((cx) => {
            cx.val(a);
            cx.val(a2);
            cx.suspend(() => {});
            cx.pending(b);
        });
        o2.dispose();
        t.dispose();
        log.length = 0;
        a2.set(1);
        expect(log).toEqual(["r1", "r2"]);
    });

    /**
     * With one dep read before the suspend, the setup run ends with
     * FLAG_SINGLE set while subscribe() has put `cmp` in `_deps`. A pull
     * through checkSingle then only looks at `a`.
     *
     * Expected: s.set(2) changes `cmp`, so the task re-runs (loading).
     * Actual: the task is not re-run and stays at its old value.
     */
    test("a task re-runs when a compute it read after a loading callback suspend changes", async () => {
        const a = signal(1);
        const s = signal(1);
        const cmp = c.compute((cx) => cx.val(s) * 10);
        let runs = 0;
        let resolve;
        const t = c.task((cx) => {
            runs++;
            cx.val(a);
            cx.suspend((res) => {
                resolve = res;
            });
            cx.val(cmp);
        });
        resolve("v1");
        await settle();
        c.effect((cx) => {
            cx.val(t);
        });
        expect(runs).toBe(1);
        s.set(2);
        expect(runs).toBe(2);
        expect(t.is(LOADING)).toBe(true);
    });

    /**
     * Expected: disposing the spawn removes it from `x`'s subscriber list.
     * Actual: `x` still lists the disposed spawn, which is not in the
     * spawn's own deps, so clearDeps never reaches it.
     */
    test("a disposed spawn is not left in the subscribers of a sender it read after a loading suspend", () => {
        const t = c.task((cx) => cx.suspend(new Promise(() => {})));
        const a = signal(1);
        const b = signal(2);
        const x = signal(3);
        const e = c.spawn((cx) => {
            cx.val(a);
            cx.val(b);
            cx.suspend(t, () => {});
            cx.val(x);
        });
        expect(depsOf(e).includes(x)).toBe(true);
        e.dispose();
        expect(subCount(x, e)).toBe(0);
    });

    /**
     * Expected: one subscription per sender, whatever the number of re-runs.
     * Actual: each re-run adds another entry for `e` in `b`'s list.
     */
    test("re-runs do not pile up subscriptions to a sender read after a loading suspend", async () => {
        const t = c.task((cx) => cx.suspend(new Promise(() => {})));
        const a = signal(0);
        const b = signal(0);
        c.effect((cx) => {
            cx.val(b);
        });
        const e = c.spawn((cx) => {
            cx.val(a);
            cx.suspend(t, () => {});
            cx.val(b);
        });
        for (let i = 1; i <= 3; i++) {
            a.set(i);
        }
        expect(subCount(b, e)).toBe(1);
    });
});

/** c.lock() is c.shield() since D10; see bugs/25-sync-lock. */
describe("25: c.lock() is never released when an activation finishes synchronously", () => {
    /**
     * README: lock() "prevents the node from re-running until the
     * current activation completes". A sync effect's activation
     * completes when its fn returns.
     * Expected: 3 runs. Actual: 1; FLAG_LOCKED is only cleared by _settle.
     */
    test("a sync effect that locks re-runs on the next change", () => {
        const s = signal(0);
        let runs = 0;
        c.effect((cx) => {
            cx.val(s);
            cx.shield();
            runs++;
        });
        s.set(1);
        s.set(2);
        expect(runs).toBe(3);
    });

    /**
     * README: a locked node "is disposed once it completes".
     * Expected: the cleanup runs when the root is disposed.
     * Actual: _dispose only sets FLAG_DISPOSED and waits for a settle
     * that never comes, so the cleanup never runs.
     */
    test("a sync effect that locks is disposed with its owner", () => {
        let cleaned = 0;
        const r = root((r) => {
            r.effect((cx) => {
                cx.shield();
                cx.cleanup(() => {
                    cleaned++;
                });
            });
        });
        r.dispose();
        expect(cleaned).toBe(1);
    });

    /** Expected: 2 runs. Actual: 1. */
    test("a spawn whose body returns synchronously after lock() re-runs", async () => {
        const s = signal(0);
        let runs = 0;
        c.spawn((cx) => {
            cx.val(s);
            cx.shield();
            runs++;
        });
        s.set(1);
        await settle();
        expect(runs).toBe(2);
    });

    /**
     * The task test this block had is gone: tasks can't shield (D10).
     * In its place, the same leak through a throw. Expected: the owner's
     * recover handler takes the error and the effect is disposed, as
     * without the lock. Actual: the teardown finds the lock and only
     * marks the effect, so its cleanup never runs.
     */
    test("a sync effect that locks and throws is disposed", () => {
        let cleaned = 0;
        root((r) => {
            r.recover(() => true);
            r.effect((cx) => {
                cx.cleanup(() => cleaned++);
                cx.shield();
                throw new Error("boom");
            });
        });
        expect(cleaned).toBe(1);
    });
});

describe("26: resource last-write-wins gaps", () => {
    /**
     * Fix 18 made an idle plain set() supersede the activation in
     * flight, and left the queued paths for after the chains merged.
     * Expected: loading ends at the write, and the stale result is
     * discarded. Actual: loading stays true, then "server" wins.
     */
    test("a batched plain write during an in-flight async write is not overwritten", async () => {
        const r = resource("a");
        const d = deferred();
        r.set("b", async (rc) => await rc.suspend(d.promise));
        batch(() => {
            r.set("plain");
        });
        expect(r.is(LOADING)).toBe(false);
        d.resolve("server");
        await settle();
        expect(r.get()).toBe("plain");
    });

    test("a posted plain write during an in-flight async write is not overwritten", async () => {
        const r = resource("a");
        const d = deferred();
        r.set("b", async (rc) => await rc.suspend(d.promise));
        r.post("plain");
        await settle();
        expect(r.is(LOADING)).toBe(false);
        d.resolve("server");
        await settle();
        expect(r.get()).toBe("plain");
    });

    /**
     * Ending the load is a change by itself, so a queued write of the
     * optimistic value is not dropped as unchanged. Expected: false.
     * Actual: true, since the batched set() compares and queues nothing.
     */
    test("a batched plain write of the optimistic value still ends loading", () => {
        const r = resource("a");
        const d = deferred();
        r.set("b", async (rc) => await rc.suspend(d.promise));
        batch(() => {
            r.set("b");
        });
        expect(r.is(LOADING)).toBe(false);
    });

    /** Expected: "plain". Actual: the task keeps waiting, then gets "server". */
    test("a task waiting on a resource resumes with a batched plain write", async () => {
        const r = resource("a");
        const d = deferred();
        r.set("b", async (rc) => await rc.suspend(d.promise));
        const t = c.task(async (cx) => await cx.suspend(r));
        batch(() => {
            r.set("plain");
        });
        await settle();
        expect(t.get()).toBe("plain");
        d.resolve("server");
        await settle();
        expect(r.get()).toBe("plain");
    });

    /**
     * A c.set() from a node that runs in a flush goes through the guarded
     * drain. Expected: loading ends, the writer is not re-run, and the
     * stale result is discarded. Actual: loading stays true.
     */
    test("a contextual write from a running effect ends loading without re-running it", async () => {
        const r = resource("a");
        const d = deferred();
        const s = signal(0);
        let runs = 0;
        r.set("b", async (rc) => await rc.suspend(d.promise));
        c.effect((cx) => {
            runs++;
            cx.val(r);
            if (cx.val(s) > 0) {
                cx.set(r, "fx");
            }
        });
        s.set(1);
        expect(runs).toBe(2);
        expect(r.is(LOADING)).toBe(false);
        expect(r.get()).toBe("fx");
        d.resolve("server");
        await settle();
        expect(r.get()).toBe("fx");
        expect(runs).toBe(2);
    });

    test("an idle c.set(r, v) during an in-flight async write is not overwritten", async () => {
        const r = resource("a");
        const d = deferred();
        const go = deferred();
        r.set("b", async (rc) => await rc.suspend(d.promise));
        c.spawn(async (cx) => {
            await cx.suspend(go.promise);
            cx.set(r, "ctx");
        });
        go.resolve();
        await settle();
        expect(r.get()).toBe("ctx");
        expect(r.is(LOADING)).toBe(false);
        d.resolve("server");
        await settle();
        expect(r.get()).toBe("ctx");
    });

    /**
     * A generator clears FLAG_LOADING at its first yield, but keeps the
     * activation token, so the plain write no longer bumps `_time`.
     * Expected: 100. Actual: 2.
     */
    test("a plain write after a generator's first yield is not overwritten by a later yield", async () => {
        const r = resource(0);
        const step = deferred();
        r.set(async function* () {
            yield 1;
            await step.promise;
            yield 2;
        });
        await settle();
        expect(r.get()).toBe(1);
        r.set(100);
        step.resolve();
        await settle();
        expect(r.get()).toBe(100);
    });

    /**
     * Whether resolve may be called twice is open (see the design
     * questions), but either way a newer plain write must win.
     * Expected: 100. Actual: 2.
     */
    test("a plain write is not overwritten by a late resolve of the callback form", () => {
        const r = resource(0);
        let res;
        r.set((rc) => {
            rc.suspend((resolve) => {
                res = resolve;
            });
        });
        res(1);
        expect(r.get()).toBe(1);
        r.set(100);
        res(2);
        expect(r.get()).toBe(100);
    });
});

describe("27: a callback that settles synchronously ends a spawn's activation mid-body", () => {
    /**
     * README: finalize "runs at the end of _this_ run".
     * Expected: the body finishes first. Actual: EffectProto._settle runs
     * inside the setup function, and runs the finalizers there.
     */
    test("finalize runs after the body when the callback resolves synchronously", () => {
        const order = [];
        c.spawn((cx) => {
            cx.finalize(() => order.push("finalize"));
            cx.suspend((res) => res(1));
            order.push("body");
        });
        expect(order).toEqual(["body", "finalize"]);
    });

    /**
     * A synchronous reject disposes the spawn from inside its own fn.
     * The deps of a setup run are still in DSTACK at that point, so
     * clearDeps misses them, and the end of the run then attaches them
     * to the disposed node.
     * Expected: `b` does not list the disposed spawn. Actual: it does.
     */
    test("a spawn disposed by a synchronous reject does not stay subscribed to its deps", () => {
        const a = signal(0);
        const b = signal(0);
        let sp;
        try {
            root((r) => {
                r.spawn((cx) => {
                    /** Taken from the context: the creation may throw. */
                    sp = cx;
                    cx.val(a);
                    cx.val(b);
                    cx.suspend((res, rej) => rej(new Error("x")));
                });
            });
        } catch (err) {
            /* whether the reject reaches the creator is a design question */
        }
        expect(sp.is(DISPOSED)).toBe(true);
        expect(subCount(b, sp)).toBe(0);
        expect(depsOf(sp)).toEqual([]);
    });

    /**
     * D7: a reject that runs before the fn returns fails the run like a
     * throw in the body, so the error reaches the creator instead of
     * being dropped. Since D9 it is held until the fn returns.
     */
    test("a synchronous reject reaches the creator, as a throw in the body does", () => {
        let thrown = null;
        try {
            root((r) => {
                r.spawn((cx) => {
                    cx.suspend((res, rej) => rej(new Error("x")));
                });
            });
        } catch (err) {
            thrown = err;
        }
        expect(thrown).toBeInstanceOf(Defect);
        expect(thrown.error.message).toBe("x");
    });

    /** The recover handler sees the reject, as it would see a throw. */
    test("a synchronous reject in a re-run goes to recover", () => {
        const s = signal(0);
        const seen = [];
        root((r) => {
            r.recover((err) => {
                seen.push(err.error.message);
                return true;
            });
            r.spawn((cx) => {
                if (cx.val(s) > 0) {
                    cx.suspend((res, rej) => rej(new Error("r" + s.get())));
                }
            });
        });
        s.set(1);
        expect(seen).toEqual(["r1"]);
    });

    /**
     * An effect clears the FLAG_STALE that queued its re-run only after
     * its fn returns. The callback guard read that flag as a newer
     * activation and dropped the resolve, so the re-run never finished.
     * Expected: the re-run's finalizer runs. Actual: it never does.
     */
    test("a callback that resolves synchronously in a re-run finishes that run", () => {
        const s = signal(0);
        const order = [];
        root((r) => {
            r.spawn((cx) => {
                let v = cx.val(s);
                cx.finalize(() => order.push("finalize " + v));
                cx.suspend((res) => res());
                order.push("body " + v);
            });
        });
        s.set(1);
        expect(order).toEqual(["body 0", "finalize 0", "body 1", "finalize 1"]);
    });
});

describe("28: a weak compute's throwing cleanup corrupts its reader", () => {
    /**
     * Releasing a weak compute runs its cleanups inside clearReceiver,
     * in the middle of the reader's patchDeps. A throw there escapes the
     * reconciliation half done: the new deps (y, z) are never connected
     * and the dropped dep (x) is never unlinked.
     * Expected: `e` runs on y and z, not on x. Actual: the opposite.
     */
    test("a reader that drops a weak compute whose cleanup throws keeps tracking its new deps", () => {
        const src = signal(1);
        const mode = signal(true);
        const x = signal(0);
        const y = signal(0);
        const z = signal(0);
        const w = c.compute(
            (cx) => {
                cx.cleanup(() => {
                    throw new Error("cleanup");
                });
                return cx.val(src);
            },
            void 0,
            WEAK
        );
        const log = [];
        c.effect((cx) => {
            cx.recover(() => true);
            if (cx.val(mode)) {
                cx.val(w);
                cx.val(x);
            } else {
                cx.val(y);
                cx.val(z);
            }
            log.push("e");
        });
        try {
            mode.set(false);
        } catch (err) {
            /* the cleanup error may surface; it must not corrupt `e` */
        }
        log.length = 0;
        y.set(1);
        z.set(1);
        expect(log).toEqual(["e", "e"]);
        log.length = 0;
        x.set(1);
        expect(log).toEqual([]);
    });

    /**
     * Fix 06: a throwing cleanup "counts as an error of its node".
     * Expected: the reader is not disposed for the weak compute's error.
     * Actual: the reader is disposed with it.
     */
    test("the reader is not disposed for the weak compute's cleanup error", () => {
        const src = signal(1);
        const mode = signal(true);
        const y = signal(0);
        const w = c.compute(
            (cx) => {
                cx.cleanup(() => {
                    throw new Error("cleanup");
                });
                return cx.val(src);
            },
            void 0,
            WEAK
        );
        let runs = 0;
        const e = c.effect((cx) => {
            if (cx.val(mode)) {
                cx.val(w);
            }
            cx.val(y);
            runs++;
        });
        try {
            mode.set(false);
        } catch (err) {
            /* may surface to the writer */
        }
        expect(e.is(DISPOSED)).toBe(false);
        const before = runs;
        y.set(1);
        expect(runs).toBe(before + 1);
    });

    /**
     * A compute reader calls patchDeps outside its fn's try, so the
     * error escapes its _update with the reconciliation half done.
     * Expected: the compute follows y, and no longer x.
     */
    test("a compute that drops a weak compute whose cleanup throws keeps tracking its new deps", () => {
        const src = signal(1);
        const mode = signal(true);
        const x = signal(0);
        const y = signal(0);
        const w = c.compute(
            (cx) => {
                cx.cleanup(() => {
                    throw new Error("cleanup");
                });
                return cx.val(src);
            },
            void 0,
            WEAK
        );
        let runs = 0;
        const r = c.compute((cx) => {
            runs++;
            return cx.val(mode) ? cx.val(w) + cx.val(x) : cx.val(y);
        });
        const log = [];
        c.effect((cx) => {
            log.push(cx.val(r));
        });
        try {
            mode.set(false);
        } catch (err) {
            /* the cleanup error may surface to the writer */
        }
        expect(r.is(ERROR)).toBe(false);
        log.length = 0;
        y.set(5);
        expect(log).toEqual([5]);
        const before = runs;
        x.set(1);
        expect(runs).toBe(before);
    });
});

describe("29: c.version() in a resource callback", () => {
    /**
     * The README's manual versioning example calls c.version() inside a
     * resource callback, where `c` is the resource.
     * Expected: a number. Actual: TypeError (Cell has no version()), and
     * the resource settles with a FATAL error.
     */
    test("c.version() is available in a resource callback, as the README shows", async () => {
        const likes = resource(0);
        let version;
        likes.set(likes.get() + 1, async (rc, optimistic) => {
            version = rc.version();
            return optimistic;
        });
        await settle();
        expect(likes.is(ERROR)).toBe(false);
        expect(typeof version).toBe("number");
        expect(likes.get()).toBe(1);
    });
});

describe("30: c.equal() is ignored when a task settles asynchronously", () => {
    /**
     * README: c.equal() controls "whether downstream subscribers are
     * notified after a compute re-runs". ComputeProto._settle never reads
     * FLAG_EQUAL / FLAG_NOTEQUAL; only the sync tail of _update does.
     * Expected: 1 run. Actual: 2.
     */
    test("c.equal(true) after an await keeps subscribers idle", async () => {
        const id = signal(1);
        const t = c.task(async (cx, prev) => {
            cx.val(id);
            const data = await cx.suspend(Promise.resolve({ name: "same" }));
            cx.equal(prev !== void 0 && prev.name === data.name);
            return data;
        });
        await settle();
        let runs = 0;
        c.effect((cx) => {
            cx.val(t);
            runs++;
        });
        id.set(2);
        t.get();
        await settle();
        expect(runs).toBe(1);
    });

    /** Expected: 2 runs. Actual: 1, since the reference is unchanged. */
    test("c.equal(false) after an await notifies subscribers of the same reference", async () => {
        const shared = { n: 0 };
        const s = signal(0);
        const t = c.task(async (cx) => {
            cx.val(s);
            await cx.suspend(Promise.resolve());
            shared.n++;
            cx.equal(false);
            return shared;
        });
        await settle();
        let runs = 0;
        c.effect((cx) => {
            cx.val(t);
            runs++;
        });
        s.set(1);
        t.get();
        await settle();
        expect(runs).toBe(2);
    });
});

describe("31: c.refuse() in an async task exposes the previous value as its error", () => {
    /**
     * refuse() sets FLAG_ERROR at once, but an async fn's return value
     * only reaches _settle a microtask later. Until then the task is
     * flagged errored while `_value` is still the previous result.
     * Expected: whatever a reader sees, an error is a Defect.
     * Actual: c.val(t) throws 10 and c.rejected(t) returns 10.
     */
    test("a reader in the same flush never sees the previous value as the error", async () => {
        const s = signal(5);
        const t = c.task(async (cx) => {
            const v = cx.val(s);
            if (v < 0) {
                return cx.refuse("negative");
            }
            return v * 2;
        });
        await settle();
        const thrown = [];
        const rejected = [];
        c.effect((cx) => {
            cx.val(s);
            try {
                cx.val(t);
            } catch (err) {
                thrown.push(err);
            }
            rejected.push(cx.rejected(t));
        });
        s.set(-1);
        for (const err of thrown) {
            expect(err instanceof Defect).toBe(true);
        }
        for (const err of rejected) {
            expect(err === null || err instanceof Defect).toBe(true);
        }
        if (t.is(ERROR)) {
            expect(t.get() instanceof Defect).toBe(true);
        }
        await settle();
        expect(t.is(ERROR)).toBe(true);
        expect(t.get().type).toBe(REFUSE);
    });
});

describe("32: disposed senders are accepted by c.defer() and the bound factories", () => {
    /**
     * Signals are not disposable (D8), so a compute owned by another root
     * plays the disposed sender. Expected: throws ILLEGAL_READ like
     * c.val(). Actual: returns the stale value.
     */
    test("c.defer() of a disposed sender throws like c.val()", async () => {
        let s;
        const other = root((r) => {
            s = r.compute(() => 1);
        });
        other.dispose();
        let caught = null;
        c.task(async (cx) => {
            try {
                cx.defer(s);
            } catch (err) {
                caught = err;
            }
            await cx.suspend(Promise.resolve());
        });
        await settle();
        expect(caught instanceof Error).toBe(true);
    });

    /**
     * Expected: the disposed sender keeps no reference to the task.
     * Actual: settleDeps subscribes the task to it (`s._sub1 === t`).
     */
    test("a deferred sender disposed during the await is not linked to the task at settle", async () => {
        let s;
        const other = root((r) => {
            s = r.compute(() => 1);
        });
        const go = deferred();
        const t = c.task(async (cx) => {
            const v = cx.defer(s);
            await cx.suspend(go.promise);
            return v;
        });
        other.dispose();
        go.resolve();
        await settle();
        expect(subCount(s, t)).toBe(0);
    });

    /**
     * Expected: the fn never runs with `null` (a value the compute never
     * held), and the disposed compute keeps no link to the effect.
     * Actual: the effect runs with null and sits in `s._sub1`.
     */
    test("a bound effect over a disposed compute does not run with null", () => {
        let s;
        const other = root((r) => {
            s = r.compute(() => 1);
        });
        s.get();
        other.dispose();
        const seen = [];
        let e = null;
        try {
            e = c.effect(s, (v) => {
                seen.push(v);
            });
        } catch (err) {
            /* throwing ILLEGAL_READ, like c.val(), is the expected outcome */
        }
        expect(seen).toEqual([]);
        expect(s._sub1).toBe(null);
    });
});

describe("D4: a bound node whose dep was disposed", () => {
    /**
     * The bound check in _update skips the fn and fails the run, as a
     * c.val() of the disposed dep would.
     */
    test("a bound effect fails with ILLEGAL_READ when it re-runs, without calling its fn", () => {
        let dep;
        const other = root((r) => {
            dep = r.compute(() => 1);
        });
        const k = signal(0);
        const errors = [];
        let calls = 0;
        root((r) => {
            r.recover((err) => {
                errors.push(err.error.message);
                return true;
            });
            r.effect(dep, (v, cx) => {
                calls++;
                cx.val(k);
            }, SETUP);
        });
        other.dispose();
        k.set(1);
        expect(calls).toBe(1);
        expect(errors.length).toBe(1);
        expect(errors[0]).toMatch(/disposed/);
    });

    /** DEFER skips the first run, so deferEffect needs the check too. */
    test("a deferred bound effect over a disposed compute throws, and is not linked", () => {
        let s;
        const other = root((r) => {
            s = r.compute(() => 1);
        });
        s.get();
        other.dispose();
        let thrown = null;
        try {
            c.effect(s, () => {}, DEFER);
        } catch (err) {
            thrown = err;
        }
        expect(thrown).toBeInstanceOf(Defect);
        expect(s._sub1).toBe(null);
    });

    test("a bound compute over a disposed compute starts errored, and is not linked", () => {
        let s;
        const other = root((r) => {
            s = r.compute(() => 1);
        });
        s.get();
        other.dispose();
        let calls = 0;
        const b = c.compute(s, (v) => {
            calls++;
            return v;
        });
        expect(b.is(ERROR)).toBe(true);
        expect(b.get().error.message).toMatch(/disposed/);
        expect(calls).toBe(0);
        expect(s._sub1).toBe(null);
    });
});

describe("D2: an owner's children are disposed before its cleanups run", () => {
    test("on re-run, the previous run's child is disposed before the parent's cleanup runs", () => {
        const s = signal(0);
        const log = [];
        c.effect((cx) => {
            const v = cx.val(s);
            cx.cleanup(() => log.push("parent" + v));
            cx.effect((cx2) => {
                cx2.cleanup(() => log.push("child" + v));
            });
        });
        s.set(1);
        expect(log).toEqual(["child0", "parent0"]);
    });

    test("an effect's child is disposed before the effect's cleanup runs", () => {
        const log = [];
        const e = c.effect((cx) => {
            cx.cleanup(() => log.push("parent"));
            cx.effect((cx2) => {
                cx2.cleanup(() => log.push("child"));
            });
        });
        e.dispose();
        expect(log).toEqual(["child", "parent"]);
    });

    test("a root's children are disposed before the root's cleanup runs", () => {
        const log = [];
        const r = root((r) => {
            r.cleanup(() => log.push("root"));
            r.effect((cx) => {
                cx.cleanup(() => log.push("child"));
            });
        });
        r.dispose();
        expect(log).toEqual(["child", "root"]);
    });

    /** The child's error is the parent's error, so the parent's cleanup
     *  must not be skipped by it. */
    test("a child whose cleanup throws on re-run still lets the parent's cleanup run", () => {
        const s = signal(0);
        const log = [];
        c.effect((cx) => {
            cx.recover(() => true);
            const v = cx.val(s);
            cx.cleanup(() => log.push("parent" + v));
            cx.effect((cx2) => {
                cx2.cleanup(() => {
                    if (v === 0) {
                        throw new Error("child cleanup");
                    }
                });
            });
        });
        s.set(1);
        expect(log).toEqual(["parent0"]);
    });

    /**
     * A teardown error on re-run goes to the recover handler of the run
     * being torn down, whether a child's cleanup or the node's own threw.
     * On master, clearOwned reset the handler, so a child's error went
     * past it to the owners.
     */
    test("a child's cleanup error on re-run reaches the previous run's recover handler", () => {
        const s = signal(0);
        const caught = [];
        let runs = 0;
        const parent = c.effect((cx) => {
            runs++;
            const v = cx.val(s);
            cx.recover((err) => {
                caught.push(v + ":" + err.error.message);
                return true;
            });
            cx.effect((cx2) => {
                cx2.cleanup(() => {
                    if (v === 0) {
                        throw new Error("child cleanup");
                    }
                });
            });
        });
        try {
            s.set(1);
        } catch (err) {}
        expect(caught).toEqual(["0:child cleanup"]);
        expect(parent.is(DISPOSED)).toBe(false);
        s.set(2);
        expect(runs).toBe(2);
    });
});

describe("33: an error escaping a flush's pre-run check deafens queued effects", () => {
    /**
     * flushEffects calls needsUpdate outside its try. A "Cycle detected"
     * thrown there escapes the flush, whose finally zeroes the queue
     * counts while the skipped effects keep FLAG_STALE / FLAG_PENDING,
     * so notify never queues them again. Cycles are unsupported, but
     * fix 06's contract is that an error never leaves the engine
     * inconsistent.
     * Expected: E2 runs for s2 and for `other`. Actual: E2 never runs again.
     */
    test("a cycle error from an effect's pre-run check does not deafen an unrelated effect", () => {
        const s = signal(0);
        const s2 = signal(0);
        const x = c.compute((cx) => cx.val(s));
        const y = c.compute((cx) => cx.val(s2));
        let b = null;
        let mode = 0;
        const a = c.compute((cx) => (mode === 0 ? cx.val(x) : cx.val(b) + cx.val(y)));
        b = c.compute((cx) => cx.val(a) + 1);
        a.get();
        b.get();
        mode = 1;
        s.set(1);
        try {
            a.get();
        } catch (err) {}
        try {
            b.get();
        } catch (err) {}
        const log = [];
        c.effect((cx) => {
            try {
                cx.val(a);
            } catch (err) {}
            log.push("E1");
        });
        const other = signal(0);
        c.effect((cx) => {
            cx.val(s2);
            cx.val(other);
            log.push("E2");
        });
        log.length = 0;
        try {
            s2.set(1);
        } catch (err) {
            /* the cycle may surface to the writer */
        }
        expect(log).toContain("E2");
        log.length = 0;
        other.set(1);
        expect(log).toEqual(["E2"]);
    });

    /**
     * The COMPUTES phase (eager computes) also called needsUpdate
     * outside a try, and the flush's finally never resets COMPUTE_COUNT.
     * Expected: E2 runs for s2 and for `other`.
     */
    test("a cycle error from an eager compute's pre-run check does not deafen an unrelated effect", () => {
        const s = signal(0);
        const s2 = signal(0);
        const x = c.compute((cx) => cx.val(s));
        const y = c.compute((cx) => cx.val(s2));
        let b = null;
        let mode = 0;
        const a = c.compute((cx) => (mode === 0 ? cx.val(x) : cx.val(b) + cx.val(y)));
        b = c.compute((cx) => cx.val(a) + 1);
        a.get();
        b.get();
        mode = 1;
        s.set(1);
        try {
            a.get();
        } catch (err) {}
        try {
            b.get();
        } catch (err) {}
        c.compute(
            (cx) => {
                try {
                    return cx.val(a);
                } catch (err) {
                    return -1;
                }
            },
            void 0,
            EAGER
        );
        const log = [];
        const other = signal(0);
        c.effect((cx) => {
            cx.val(s2);
            cx.val(other);
            log.push("E2");
        });
        log.length = 0;
        try {
            s2.set(1);
        } catch (err) {
            /* the cycle may surface to the writer */
        }
        expect(log).toContain("E2");
        log.length = 0;
        other.set(1);
        expect(log).toEqual(["E2"]);
    });
});

describe("34: node functions that run while the engine is idle", () => {
    /**
     * ComputeProto._settle replayed a change that arrived during a lock by
     * calling _update at idle. The write in the body then flushed at once,
     * in the middle of the run; the flush reset FENCE, the effect stamped
     * `s` over the task's stamp, and the task's patchDeps dropped `s`.
     * Tasks can't shield since D10, so this checks the same for a
     * shielded spawn, whose replay is queued and flushed.
     * Expected: the spawn still depends on `s`.
     */
    test("a shielded spawn replayed at release keeps its deps when its body writes a signal", async () => {
        const s = signal(1);
        const mode = signal(false);
        const extra = signal(0);
        const busy = signal(0);
        const resolvers = [];
        let runs = 0;
        const sp = c.spawn(async (cx) => {
            runs++;
            cx.val(s);
            cx.shield();
            cx.set(busy, runs);
            if (cx.val(mode)) {
                cx.val(extra);
            }
            await cx.suspend(new Promise((r) => resolvers.push(r)));
        });
        c.effect((cx) => {
            cx.val(busy);
            cx.val(s);
        });
        resolvers.shift()(1);
        await settle();
        s.set(2);
        mode.set(true);
        resolvers.shift()(2);
        await settle();
        expect(runs).toBe(3);
        expect(depsOf(sp).includes(s)).toBe(true);
        resolvers.forEach((r) => r(3));
        await settle();
        const before = runs;
        s.set(10);
        expect(runs).toBe(before + 1);
    });

    /** The same through the c.defer() replay, with a plain set() in the body. */
    test("a task re-run for a changed deferred dep keeps its deps when its body writes a signal", async () => {
        const s = signal(1);
        const token = signal("a");
        const mode = signal(false);
        const extra = signal(0);
        const busy = signal(0);
        const resolvers = [];
        let runs = 0;
        const t = c.task(async (cx) => {
            runs++;
            const v = cx.val(s);
            const tok = cx.defer(token);
            busy.set(runs);
            if (cx.val(mode)) {
                cx.val(extra);
            }
            await cx.suspend(new Promise((r) => resolvers.push(r)));
            return v + tok;
        });
        c.effect((cx) => {
            cx.val(busy);
            cx.val(s);
        });
        resolvers.shift()(1);
        await settle();
        mode.set(true);
        t.get();
        token.set("b");
        resolvers.shift()(2);
        await settle();
        expect(runs).toBe(3);
        expect(depsOf(t).includes(s)).toBe(true);
    });

    /**
     * resume() calls needsUpdate at idle, so a compute it pulls runs with
     * IDLE === true. The untracked d.get() inside takes the idle branch of
     * get(), which resets FENCE; `d` then restamps `x`, and C's patchDeps
     * drops `x`.
     * Expected: the effect sees 9 after x.set(3). Actual: it never updates.
     */
    test("resume() keeps the deps of a compute whose fn makes an untracked .get()", () => {
        const x = signal(1);
        const mode = signal(false);
        const extra = signal(0);
        const d = c.compute((cx) => cx.val(x) * 2);
        const C = c.compute((cx) => {
            const v = cx.val(x);
            const dv = d.get();
            if (cx.val(mode)) {
                cx.val(extra);
            }
            return v + dv;
        });
        const seen = [];
        const e = c.effect((cx) => {
            seen.push(cx.val(C));
        });
        e.pause();
        x.set(2);
        mode.set(true);
        e.resume();
        expect(seen).toEqual([3, 6]);
        x.set(3);
        expect(seen).toEqual([3, 6, 9]);
    });
    /**
     * An idle c.set from a node pauses the node, writes, and then refreshes
     * the node's deps (unguard) while still idle. A compute pulled there
     * runs at idle, so a write in its fn flushes in the middle of its run.
     * Expected: the effect does not run inside K's fn. Actual: it does.
     */
    test("an idle c.set from a node does not run a dep compute while idle", async () => {
        const s = signal(1);
        const trig = signal(0);
        const busy = signal(0);
        let kRuns = 0;
        let eRuns = 0;
        let nested = 0;
        const k = c.compute((cx) => {
            kRuns++;
            const v = cx.val(s);
            cx.val(trig);
            const before = eRuns;
            busy.set(kRuns);
            if (eRuns !== before) {
                nested++;
            }
            return v;
        });
        c.effect((cx) => {
            eRuns++;
            cx.val(busy);
            cx.val(s);
        });
        const t = c.task(async (cx) => {
            cx.val(k);
            await tick();
            cx.set(trig, 1);
        });
        t.get();
        await settle();
        expect(kRuns).toBe(2);
        expect(nested).toBe(0);
        expect(depsOf(k).includes(s)).toBe(true);
    });
});

describe("35: a throwing cleanup on re-run leaves the previous run's children alive", () => {
    /**
     * EffectProto._update runs clearCleanup and then clearOwned with no
     * try/finally between them, unlike _dispose. A cleanup that throws
     * skips clearOwned, so the children of the previous run stay alive
     * and keep reacting after the parent's resources were released.
     * Expected: the child of the first run is disposed and never runs
     * again. Actual: it is still alive and re-runs on other.set(1).
     */
    test("the previous run's child is disposed when the parent's cleanup throws", () => {
        const s = signal(0);
        const other = signal(0);
        const log = [];
        let child = null;
        c.effect((cx) => {
            cx.recover(() => true);
            const v = cx.val(s);
            cx.cleanup(() => {
                if (v === 0) {
                    throw new Error("cleanup");
                }
            });
            child = cx.effect((cx2) => {
                cx2.val(other);
                log.push("child" + v);
            });
        });
        const first = child;
        try {
            s.set(1);
        } catch (err) {
            /* the cleanup error may surface; the child must still go */
        }
        expect(first.is(DISPOSED)).toBe(true);
        log.length = 0;
        other.set(1);
        expect(log.includes("child0")).toBe(false);
    });
});

describe("36: c.suspend(task) in a stable task drops the task", () => {
    /**
     * The original bug: c.stable() called mid-run set FLAG_FREEZE, and
     * track(), which c.suspend(task) uses, ignored it, so patchDeps
     * dropped the task. STABLE is now a creation option and FLAG_FREEZE
     * is gone; this checks that a STABLE task still links the task it
     * suspends on in its first run, through track().
     */
    test("a STABLE task keeps the task it suspends on", async () => {
        const s = signal(1);
        const t = c.task((cx) => cx.val(s) * 10);
        let runs = 0;
        const outer = c.task(async (cx) => {
            runs++;
            return await cx.suspend(t);
        }, void 0, STABLE);
        c.effect((cx) => {
            cx.val(outer);
        });
        await settle();
        expect(depsOf(outer).includes(t)).toBe(true);
        const before = runs;
        s.set(2);
        outer.get();
        await settle();
        expect(runs).toBe(before + 1);
        expect(outer.get()).toBe(20);
    });
});

describe("37: a cleanup error that is already a Defect is wrapped again", () => {
    /**
     * Fix 07: a Defect travels on unchanged; only raw throws are wrapped
     * as FATAL. ComputeProto._update stores a throwing cleanup's error as
     * `new Defect(error, FATAL)` instead of `defect(error)`.
     * Expected: the compute holds the PANIC Defect. Actual: a FATAL Defect
     * whose error is the PANIC Defect.
     */
    test("a compute whose cleanup panics holds the PANIC Defect, not a FATAL wrapper", () => {
        const s = signal(0);
        const comp = c.compute((cx) => {
            const v = cx.val(s);
            cx.cleanup(() => {
                if (v === 0) {
                    cx.panic("bye");
                }
            });
            return v;
        });
        comp.get();
        s.set(1);
        const err = comp.get();
        expect(comp.is(ERROR)).toBe(true);
        expect(err.type).toBe(PANIC);
        expect(err.error).toBe("bye");
    });
});

describe("38: a bound effect with SETUP that reads its own dep is linked twice", () => {
    /**
     * The bound call in EffectProto._update never stamps the bound dep
     * (ComputeProto._update does), so c.val(dep) inside the fn records it
     * again and the setup run links it a second time.
     * Expected: one link, as for a bound compute. Actual: two.
     */
    test("the bound dep is linked once", () => {
        const d = signal(0);
        const e = c.effect(d, (v, cx) => {
            cx.val(d);
        }, SETUP);
        expect(subCount(d, e)).toBe(1);
        d.set(1);
        expect(subCount(d, e)).toBe(1);
    });
});

describe("D1: an effect's controller is aborted on every re-run", () => {
    /**
     * README: the controller "is automatically aborted when the node
     * re-runs or is disposed". A sync effect's completed activation used
     * to release its controller without aborting it, so a listener
     * registered with { signal } leaked on every re-run.
     */
    test("a sync effect's controller is aborted when the effect re-runs", () => {
        const s = signal(0);
        const ctrls = [];
        c.effect((cx) => {
            cx.val(s);
            ctrls.push(cx.controller());
        });
        s.set(1);
        expect(ctrls.length).toBe(2);
        expect(ctrls[0].signal.aborted).toBe(true);
        expect(ctrls[1].signal.aborted).toBe(false);
    });
});

describe("D9: a callback suspend waits for the fn to return", () => {
    /**
     * The reject is held, so the rest of the body runs, and then the run
     * fails as a throw in the body would.
     */
    test("code after a synchronous reject still runs, then the run fails", () => {
        const order = [];
        let thrown = null;
        try {
            root((r) => {
                r.spawn((cx) => {
                    cx.suspend((res, rej) => rej(new Error("x")));
                    order.push("after");
                });
            });
        } catch (err) {
            thrown = err;
        }
        expect(order).toEqual(["after"]);
        expect(thrown).toBeInstanceOf(Defect);
        expect(thrown.error.message).toBe("x");
    });

    /**
     * A held task callback runs after the deps of the run are tracked,
     * so its reads link like reads after an await: the spawn re-runs on
     * them, and the links do not pile up.
     */
    test("reads in a held task callback re-run the node, without piling up links", () => {
        const s = signal(0);
        let runs = 0;
        let sp;
        root((r) => {
            const t = r.task((cx) => cx.suspend((res) => res(1)));
            r.spawn((cx) => {
                sp = cx;
                runs++;
                cx.suspend(t, () => {
                    cx.val(s);
                });
            });
        });
        expect(runs).toBe(1);
        s.set(1);
        s.set(2);
        expect(runs).toBe(3);
        expect(subCount(s, sp)).toBe(1);
    });

    /**
     * A throw wins over a resolve held in the same run, and the held
     * resolve is dropped, so it can't settle a later run.
     */
    test("a throw after a synchronous resolve drops the held resolve", () => {
        const s = signal(0);
        const t = c.task((cx) => {
            if (cx.val(s) === 0) {
                cx.suspend((res) => res(1));
                throw new Error("x");
            }
            cx.suspend(() => {});
        });
        expect(t.is(ERROR)).toBe(true);
        s.set(1);
        t.get();
        expect(t.is(LOADING)).toBe(true);
    });

    test("a resource callback that resolves synchronously settles after it returns", () => {
        const r = resource(0);
        const seen = [];
        r.set((rc) => {
            rc.suspend((res) => res(1));
            seen.push(r.get());
        });
        expect(seen).toEqual([0]);
        expect(r.get()).toBe(1);
        expect(r.is(LOADING)).toBe(false);
    });

    /** The write supersedes the activation, so its end does not start loading. */
    test("a plain write inside a resource callback is not left loading", () => {
        const r = resource(0);
        r.set((rc) => {
            rc.suspend(() => {});
            r.set(5);
        });
        expect(r.get()).toBe(5);
        expect(r.is(LOADING)).toBe(false);
    });

    /**
     * The inner spawn holds its own resolve, then resolves the outer one
     * above it. Each run takes its own entry when its fn returns.
     */
    test("nested runs each settle with their own held delivery", () => {
        const order = [];
        c.spawn((cx) => {
            cx.finalize(() => order.push("outer finalize"));
            cx.suspend((res) => {
                cx.spawn((cy) => {
                    cy.finalize(() => order.push("inner finalize"));
                    cy.suspend((res2) => res2());
                    res();
                    order.push("inner body");
                });
            });
            order.push("outer body");
        });
        expect(order).toEqual(["inner body", "inner finalize", "outer body", "outer finalize"]);
    });
});

describe("D10: an await that closes a wait cycle is rejected", () => {
    /**
     * Two tasks that await each other after a startup gate. Expected:
     * the await that closes the cycle throws "Cycle detected", so both
     * tasks settle with an error. Before: both stayed loading for good.
     */
    test("two tasks awaiting each other both fail", async () => {
        const gate = deferred();
        let a, b;
        root((r) => {
            a = r.task(async (cx) => {
                await cx.suspend(gate.promise);
                return await cx.suspend(b);
            });
            b = r.task(async (cx) => {
                await cx.suspend(gate.promise);
                return await cx.suspend(a);
            });
        });
        gate.resolve();
        await settle();
        expect(a.is(LOADING)).toBe(false);
        expect(b.is(LOADING)).toBe(false);
        expect(a.is(ERROR)).toBe(true);
        expect(b.is(ERROR)).toBe(true);
        expect(b.get().error.message).toBe("Cycle detected");
        expect(a.get().error.message).toBe("Cycle detected");
    });

    test("a cycle through a third task is found", async () => {
        const gate = deferred();
        let a, b, d;
        root((r) => {
            a = r.task(async (cx) => {
                await cx.suspend(gate.promise);
                return await cx.suspend(b);
            });
            b = r.task(async (cx) => {
                await cx.suspend(gate.promise);
                return await cx.suspend(d);
            });
            d = r.task(async (cx) => {
                await cx.suspend(gate.promise);
                return await cx.suspend(a);
            });
        });
        gate.resolve();
        await settle();
        expect([a.is(LOADING), b.is(LOADING), d.is(LOADING)]).toEqual([false, false, false]);
        expect([a.is(ERROR), b.is(ERROR), d.is(ERROR)]).toEqual([true, true, true]);
    });

    test("an array await that closes a cycle fails", async () => {
        const gate = deferred();
        const other = deferred();
        let a, b, x;
        root((r) => {
            x = r.task(async (cx) => await cx.suspend(other.promise));
            a = r.task(async (cx) => {
                await cx.suspend(gate.promise);
                return await cx.suspend(b);
            });
            b = r.task(async (cx) => {
                await cx.suspend(gate.promise);
                return await cx.suspend([x, a]);
            });
        });
        gate.resolve();
        await settle();
        other.resolve(1);
        await settle();
        expect(a.is(LOADING)).toBe(false);
        expect(b.is(LOADING)).toBe(false);
        expect(b.is(ERROR)).toBe(true);
    });

    /** Control: waits that share a task without a cycle still settle. */
    test("a diamond of waits settles", async () => {
        const gate = deferred();
        let top, left, right;
        root((r) => {
            const base = r.task(async (cx) => {
                await cx.suspend(gate.promise);
                return 1;
            });
            left = r.task(async (cx) => (await cx.suspend(base)) + 1);
            right = r.task(async (cx) => (await cx.suspend(base)) + 2);
            top = r.task(async (cx) => {
                const [l, rr] = await cx.suspend([left, right]);
                return l + rr;
            });
        });
        gate.resolve();
        await settle();
        expect(top.get()).toBe(5);
    });
});

describe("D10: shield bookkeeping", () => {
    /** A spawn disposed on its own, once its shield releases, leaves its
     *  owner's children, so the owner's teardown can't dispose it again. */
    test("a shielded spawn disposed on its own leaves its owner's children", async () => {
        const d = deferred();
        let spawn;
        const r1 = root((r) => {
            r.effect(() => {});
            spawn = r.spawn(async (sc) => {
                sc.shield();
                await sc.suspend(d.promise);
            });
        });
        spawn.dispose();
        expect(r1._owned.includes(spawn)).toBe(true);
        d.resolve();
        await settle();
        expect(spawn.is(DISPOSED)).toBe(true);
        expect(r1._owned.includes(spawn)).toBe(false);
        r1.dispose();
    });
});

describe("39: a settle inside another node's run overwrites its dependency stamps", () => {
    /**
     * A callback suspend's resolve() runs later, here from inside
     * another node's fn. The task settles there: settleDeps stamps its
     * deps with a fresh SEED, and `s` is also a dep of `outer`, which is
     * still running. `outer` read nothing yet, so its read of `s` finds
     * a stamp that is not its own and subscribes `s` a second time.
     *
     * Expected: `outer` is subscribed to `s` once and runs once per write.
     * Actual: `outer` is subscribed twice.
     */
    test("a task resolved before the outer node reads a shared dep is not subscribed twice", () => {
        const s = signal(1);
        const u = signal(100);
        const k = signal(0);
        let resolveT = null;
        const t = c.task((cx) => {
            const v = cx.val(s) + cx.val(u);
            cx.suspend((resolve) => {
                resolveT = () => resolve(v * 10);
            });
        });
        let runs = 0;
        const outer = c.compute((cx) => {
            runs++;
            if (cx.val(k) > 0 && resolveT !== null) {
                const resolve = resolveT;
                resolveT = null;
                resolve();
            }
            return cx.val(s);
        });
        root((r) => {
            r.effect((cx) => {
                cx.val(outer);
            });
        });
        k.set(1);
        expect(t.get()).toBe(1010);
        expect(subCount(s, outer)).toBe(1);
        runs = 0;
        s.set(2);
        expect(outer.get()).toBe(2);
        expect(runs).toBe(1);
    });

    /**
     * `outer` reads `s`, then resolves the task, then reads a new dep,
     * so the run ends in patchDeps. The settle restamped `s`, and
     * patchDeps drops every dep whose stamp is not the run's own.
     *
     * Expected: `outer` keeps `s`, and s.set(2) gives 2 + 7.
     * Actual: `outer` loses `s` and stays at 8.
     */
    test("a compute keeps a dep it read before resolving a task", () => {
        const s = signal(1);
        const u = signal(100);
        const k = signal(0);
        const w = signal(7);
        let resolveT = null;
        c.task((cx) => {
            const v = cx.val(s) + cx.val(u);
            cx.suspend((resolve) => {
                resolveT = () => resolve(v * 10);
            });
        });
        const outer = c.compute((cx) => {
            const kv = cx.val(k);
            const sv = cx.val(s);
            if (kv > 0 && resolveT !== null) {
                const resolve = resolveT;
                resolveT = null;
                resolve();
            }
            return sv + (kv > 0 ? cx.val(w) : 0);
        });
        root((r) => {
            r.effect((cx) => {
                cx.val(outer);
            });
        });
        k.set(1);
        expect(depsOf(outer)).toEqual([k, s, w]);
        s.set(2);
        expect(outer.get()).toBe(9);
    });

    /** Same in an effect, as when a transport's send() answers at once. */
    test("an effect keeps a dep it read before resolving a task", () => {
        const s = signal(1);
        const u = signal(100);
        const k = signal(0);
        const w = signal(7);
        let resolveT = null;
        c.task((cx) => {
            const v = cx.val(s) + cx.val(u);
            cx.suspend((resolve) => {
                resolveT = () => resolve(v * 10);
            });
        });
        const transport = {
            send() {
                if (resolveT !== null) {
                    const resolve = resolveT;
                    resolveT = null;
                    resolve();
                }
            }
        };
        const seen = [];
        root((r) => {
            r.effect((cx) => {
                const kv = cx.val(k);
                const sv = cx.val(s);
                if (kv > 0) {
                    transport.send();
                }
                seen.push(sv + (kv > 0 ? cx.val(w) : 0));
            });
        });
        k.set(1);
        s.set(2);
        expect(seen).toEqual([1, 8, 9]);
    });

    /**
     * The task has a waiter, so its settle runs settleNotify, whose
     * first pass stamps the task's sync subscribers. `C` is one of them
     * and a dep of `outer`, which read it before resolving the task.
     *
     * Expected: `outer` keeps `C`.
     * Actual: patchDeps drops `C`.
     */
    test("a compute keeps a subscriber of the task it resolves", async () => {
        const k = signal(0);
        const w = signal(7);
        let resolveT = null;
        const t = c.task((cx) => {
            cx.suspend((resolve) => {
                resolveT = resolve;
            });
        });
        const C = c.compute((cx) => (cx.pending(t) ? -1 : cx.val(t)));
        let outer;
        root((r) => {
            r.spawn(async (cx) => {
                await cx.suspend(t);
            });
            outer = r.compute((cx) => {
                const kv = cx.val(k);
                const cv = cx.val(C);
                if (kv > 0 && resolveT !== null) {
                    const resolve = resolveT;
                    resolveT = null;
                    resolve(5);
                }
                return cv + (kv > 0 ? cx.val(w) : 0);
            });
            r.effect((cx) => {
                cx.val(outer);
            });
        });
        k.set(1);
        await settle();
        expect(depsOf(outer)).toEqual([k, C, w]);
    });

    /**
     * Guard, passes on master: a task that defers `s` and settles in its
     * own run, pulled from inside `outer`'s run. settleDefers stamps to
     * skip the deps the task already has, and must put back the stamp
     * `outer` left on `s`.
     */
    test("settleDefers inside another node's run keeps that node's deps", () => {
        const s = signal(1);
        const k = signal(0);
        const w = signal(7);
        const q = signal(0);
        const t = c.task((cx) => {
            const kv = cx.val(k);
            const sv = cx.defer(s);
            const qv = cx.defer(q);
            cx.suspend((resolve) => resolve(kv + sv + qv));
        });
        const outer = c.compute((cx) => {
            const kv = cx.val(k);
            const sv = cx.val(s);
            const tv = cx.pending(t) ? -1 : cx.val(t);
            return sv + tv + (kv > 0 ? cx.val(w) : 0);
        });
        root((r) => {
            r.effect((cx) => {
                cx.val(outer);
            });
        });
        k.set(1);
        expect(depsOf(outer)).toEqual([k, s, t, w]);
        expect(depsOf(t)).toEqual([k, s, q]);
        expect(subCount(s, t)).toBe(1);
        s.set(2);
        expect(outer.get()).toBe(2 + (1 + 2 + 0) + 7);
    });
});

describe("40: a settle inside another node's run is lost on its readers", () => {
    /**
     * `outer` reads the task while it loads, then resolves it. The
     * settle notified `outer` while it ran, and the end of its run
     * cleared the mark, so `outer` kept the loading value.
     *
     * Expected: the settle is queued like a write. The task still loads
     * for the rest of the run, and `outer` re-runs with 50.
     * Actual: `outer` stays at -1.
     */
    test("a task resolved in another node's run settles after it, like a write", () => {
        const k = signal(0);
        let resolveT = null;
        const t = c.task((cx) => {
            cx.suspend((resolve) => {
                resolveT = resolve;
            });
        });
        const loading = [];
        const outer = c.compute((cx) => {
            const kv = cx.val(k);
            const v = cx.pending(t) ? -1 : cx.val(t);
            if (kv > 0 && resolveT !== null) {
                const resolve = resolveT;
                resolveT = null;
                resolve(50);
                loading.push(t.is(LOADING));
            }
            return v;
        });
        root((r) => {
            r.effect((cx) => {
                cx.val(outer);
            });
        });
        k.set(1);
        expect(loading).toEqual([true]);
        expect(t.get()).toBe(50);
        expect(outer.get()).toBe(50);
    });

    /** Same for a reject. */
    test("a task rejected in another node's run errors after it", () => {
        const k = signal(0);
        let rejectT = null;
        const t = c.task((cx) => {
            cx.suspend((resolve, reject) => {
                rejectT = reject;
            });
        });
        const seen = [];
        root((r) => {
            r.effect((cx) => {
                const kv = cx.val(k);
                seen.push(cx.pending(t) ? "loading" : t.is(ERROR) ? "error" : "value");
                if (kv > 0 && rejectT !== null) {
                    const reject = rejectT;
                    rejectT = null;
                    reject(new Error("boom"));
                    seen.push(t.is(LOADING));
                }
            });
        });
        k.set(1);
        expect(seen).toEqual(["loading", "loading", true, "error"]);
    });

    /**
     * `C` subscribes to the task and is a dep of `outer`. The settle
     * marked `C` stale and `C` notified the running `outer`, whose run
     * then cleared the mark. Nothing pulled `C`, so it stayed stale,
     * and every later notification skipped it.
     *
     * Expected: `outer` gets 5 + 7, and the next settle reaches it.
     * Actual: `outer` stays at -1 + 7 for good.
     */
    test("a subscriber of the task is not left stale", async () => {
        const k = signal(0);
        const w = signal(7);
        const base = signal(1);
        let resolveT = null;
        const t = c.task((cx) => {
            cx.val(base);
            cx.suspend((resolve) => {
                resolveT = resolve;
            });
        });
        const C = c.compute((cx) => (cx.pending(t) ? -1 : cx.val(t)));
        let outer;
        root((r) => {
            r.spawn(async (cx) => {
                await cx.suspend(t);
            });
            outer = r.compute((cx) => {
                const kv = cx.val(k);
                const cv = cx.val(C);
                if (kv > 0 && resolveT !== null) {
                    const resolve = resolveT;
                    resolveT = null;
                    resolve(5);
                }
                return cv + (kv > 0 ? cx.val(w) : 0);
            });
            r.effect((cx) => {
                cx.val(outer);
            });
        });
        k.set(1);
        await settle();
        expect(outer.get()).toBe(12);
        k.set(0);
        base.set(2);
        resolveT(9);
        await settle();
        expect(outer.get()).toBe(9);
    });

    /**
     * Guard, passes on master, which settled these right away: a queued
     * settle runs in the drain. It stamped the task's change time
     * TIME + 1, but the drain's pass is at TIME, so `C` re-ran at TIME
     * and still saw the task as newer. When the task reloaded, `C`
     * re-ran, read it as pending, and a settle to the same value did not
     * notify it again.
     *
     * Expected: `C` keeps 5 through the reload.
     * Actual, with the queue but without the fix: `C` is stuck at -1.
     */
    test("a settle in a drain does not leave its readers a tick behind", async () => {
        const base = signal(1);
        let resolveT = null;
        const t = c.task((cx) => {
            cx.val(base);
            cx.suspend((resolve) => {
                resolveT = resolve;
            });
        });
        const C = c.compute((cx) => (cx.pending(t) ? -1 : cx.val(t)));
        root((r) => {
            r.effect((cx) => {
                cx.val(C);
            });
        });
        batch(() => resolveT(5));
        expect(C.get()).toBe(5);
        base.set(2);
        resolveT(5);
        await settle();
        expect(C.get()).toBe(5);
    });

    /** Guard, same, with the resolve made in an effect's run. */
    test("a settle from an effect's run does not leave its readers a tick behind", async () => {
        const base = signal(1);
        const go = signal(0);
        let resolveT = null;
        const t = c.task((cx) => {
            cx.val(base);
            cx.suspend((resolve) => {
                resolveT = resolve;
            });
        });
        const C = c.compute((cx) => (cx.pending(t) ? -1 : cx.val(t)));
        root((r) => {
            r.effect((cx) => {
                cx.val(C);
            });
            r.effect((cx) => {
                if (cx.val(go) > 0 && resolveT !== null) {
                    const resolve = resolveT;
                    resolveT = null;
                    resolve(5);
                }
            });
        });
        go.set(1);
        expect(C.get()).toBe(5);
        base.set(2);
        resolveT(5);
        await settle();
        expect(C.get()).toBe(5);
    });
});
