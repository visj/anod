import { describe, test, expect } from "#test-runner";
import {
    signal,
    resource,
    root,
    batch,
    c,
    REFUSE,
    PANIC,
    OPT_WEAK,
    OPT_SETUP,
    OPT_DEFER,
    OPT_EAGER,
    Defect
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
     * Actual: r.error stays true and r.get() is 5.
     */
    test("plain set() after a failed async write clears the error", () => {
        const r = resource(1);
        r.set(() => {
            throw new Error("boom");
        });
        expect(r.error).toBe(true);
        r.set(5);
        expect(r.error).toBe(false);
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
        expect(r.error).toBe(true);
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
        expect(r.error).toBe(false);
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
        expect(r.error).toBe(false);
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
        expect(r.error).toBe(false);
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
        expect(t.loading).toBe(true);
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

/** Skipped until the lock rework, which goes in its own branch; see bugs/25-sync-lock. */
describe.skip("25: c.lock() is never released when an activation finishes synchronously", () => {
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
            cx.lock();
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
                cx.lock();
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
            cx.lock();
            runs++;
        });
        s.set(1);
        await settle();
        expect(runs).toBe(2);
    });

    /** Expected: 20. Actual: 10, and the task never runs again. */
    test("a task that locks and returns a plain value recomputes", async () => {
        const s = signal(1);
        const t = c.task((cx) => {
            const v = cx.val(s);
            cx.lock();
            return v * 10;
        });
        s.set(2);
        await settle();
        expect(t.get()).toBe(20);
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
        expect(r.loading).toBe(false);
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
        expect(r.loading).toBe(false);
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
        expect(r.loading).toBe(false);
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
        expect(r.loading).toBe(false);
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
        expect(r.loading).toBe(false);
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
        expect(sp.disposed).toBe(true);
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
            undefined,
            OPT_WEAK
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
            undefined,
            OPT_WEAK
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
        expect(e.disposed).toBe(false);
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
            undefined,
            OPT_WEAK
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
        expect(r.error).toBe(false);
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
        expect(likes.error).toBe(false);
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
            cx.equal(prev !== undefined && prev.name === data.name);
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
        if (t.error) {
            expect(t.get() instanceof Defect).toBe(true);
        }
        await settle();
        expect(t.error).toBe(true);
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
            }, OPT_SETUP);
        });
        other.dispose();
        k.set(1);
        expect(calls).toBe(1);
        expect(errors.length).toBe(1);
        expect(errors[0]).toMatch(/disposed/);
    });

    /** OPT_DEFER skips the first run, so deferEffect needs the check too. */
    test("a deferred bound effect over a disposed compute throws, and is not linked", () => {
        let s;
        const other = root((r) => {
            s = r.compute(() => 1);
        });
        s.get();
        other.dispose();
        let thrown = null;
        try {
            c.effect(s, () => {}, OPT_DEFER);
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
        expect(b.error).toBe(true);
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
        expect(parent.disposed).toBe(false);
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
            undefined,
            OPT_EAGER
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
     * ComputeProto._settle replays a change that arrived during a lock by
     * calling _update at idle. The write in the body then flushes at once,
     * in the middle of the run; the flush resets FENCE, the effect stamps
     * `s` over the task's stamp, and the task's patchDeps drops `s`.
     * Expected: the task still depends on `s`. Actual: `s` is gone.
     */
    test("a locked task replayed at settle keeps its deps when its body writes a signal", async () => {
        const s = signal(1);
        const mode = signal(false);
        const extra = signal(0);
        const busy = signal(0);
        const resolvers = [];
        let runs = 0;
        const t = c.task(async (cx) => {
            runs++;
            const v = cx.val(s);
            cx.lock();
            cx.set(busy, runs);
            if (cx.val(mode)) {
                cx.val(extra);
            }
            await cx.suspend(new Promise((r) => resolvers.push(r)));
            return v;
        });
        c.effect((cx) => {
            cx.val(busy);
            cx.val(s);
        });
        resolvers.shift()(1);
        await settle();
        s.set(2);
        t.get();
        mode.set(true);
        resolvers.shift()(2);
        await settle();
        expect(runs).toBe(3);
        expect(depsOf(t).includes(s)).toBe(true);
        resolvers.forEach((r) => r(3));
        await settle();
        const before = runs;
        s.set(10);
        t.get();
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
        expect(first.disposed).toBe(true);
        log.length = 0;
        other.set(1);
        expect(log.includes("child0")).toBe(false);
    });
});

describe("36: c.suspend(task) after c.stable() drops the task", () => {
    /**
     * c.stable() sets FLAG_FREEZE so that the rest of the run is still
     * tracked and the deps freeze as they are at its end. track(), which
     * c.suspend(task) uses, tests only FLAG_STABLE | FLAG_SETUP, so it
     * skips the stamp in a dynamic run, and patchDeps drops the task.
     * Expected: `outer` re-runs when `t` changes. Actual: `t` is no
     * longer one of its deps.
     */
    test("a task that calls c.stable() keeps the task it suspends on afterwards", async () => {
        const s = signal(1);
        const t = c.task((cx) => cx.val(s) * 10);
        const trig = signal(0);
        let runs = 0;
        const outer = c.task(async (cx) => {
            runs++;
            cx.val(trig);
            if (runs > 1) {
                cx.stable();
            }
            return await cx.suspend(t);
        });
        c.effect((cx) => {
            cx.val(outer);
        });
        await settle();
        trig.set(1);
        outer.get();
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
        expect(comp.error).toBe(true);
        expect(err.type).toBe(PANIC);
        expect(err.error).toBe("bye");
    });
});

describe("38: a bound effect with OPT_SETUP that reads its own dep is linked twice", () => {
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
        }, OPT_SETUP);
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
        expect(t.error).toBe(true);
        s.set(1);
        t.get();
        expect(t.loading).toBe(true);
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
        expect(r.loading).toBe(false);
    });

    /** The write supersedes the activation, so its end does not start loading. */
    test("a plain write inside a resource callback is not left loading", () => {
        const r = resource(0);
        r.set((rc) => {
            rc.suspend(() => {});
            r.set(5);
        });
        expect(r.get()).toBe(5);
        expect(r.loading).toBe(false);
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
