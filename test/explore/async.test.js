import { describe, test, expect } from "#test-runner";
import {
    signal,
    resource,
    root,
    batch,
    flush,
    c,
    REFUSE,
    PANIC,
    FATAL,
    OPT_DEFER,
    OPT_STABLE,
    OPT_SETUP,
    OPT_WEAK,
    OPT_EAGER,
    refuse,
    panic,
    fatal,
} from "#anod";

const tick = () => Promise.resolve();
const settle = async (n = 10) => {
    for (let i = 0; i < n; i++) {
        await tick();
    }
};
const delay = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));

function deferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

describe("stale activations", () => {
    test("task: activations resolved in reverse start order keep only the latest", async () => {
        const s = signal(0);
        const ds = [];
        let t;
        const r = root((r) => {
            t = r.task(s, async (v, c) => {
                const d = deferred();
                ds[v] = d;
                return await c.suspend(d.promise);
            });
        });
        for (let i = 1; i <= 3; i++) {
            s.set(i);
            t.get();
        }
        expect(ds.length).toBe(4);
        ds[3].resolve("v3");
        await settle();
        expect(t.get()).toBe("v3");
        expect(t.loading).toBe(false);
        ds[2].resolve("v2");
        ds[1].resolve("v1");
        ds[0].resolve("v0");
        await settle();
        expect(t.get()).toBe("v3");
        expect(t.loading).toBe(false);
        r.dispose();
    });

    test("spawn: 20 rapid re-runs resolved in reverse order run only the last continuation", async () => {
        const s = signal(0);
        const ds = [];
        const done = [];
        let sp;
        const r = root((r) => {
            sp = r.spawn(async (c) => {
                const v = c.val(s);
                const d = deferred();
                ds[v] = d;
                await c.suspend(d.promise);
                done.push(v);
            });
        });
        for (let i = 1; i < 20; i++) {
            s.set(i);
        }
        for (let i = 19; i >= 0; i--) {
            ds[i].resolve();
        }
        await settle();
        expect(done).toEqual([19]);
        expect(sp.loading).toBe(false);
        r.dispose();
    });

    test("c.version(): a raw-await continuation can detect that it went stale", async () => {
        const url = signal("a");
        const ds = {};
        const processed = [];
        const stale = [];
        const r = root((r) => {
            r.spawn(async (c) => {
                const version = c.version();
                const u = c.val(url);
                const d = deferred();
                ds[u] = d;
                await d.promise;
                if (c.version() !== version) {
                    stale.push(u);
                    return;
                }
                processed.push(u);
            });
        });
        url.set("b");
        ds.b.resolve();
        ds.a.resolve();
        await settle();
        expect(processed).toEqual(["b"]);
        expect(stale).toEqual(["a"]);
        r.dispose();
    });
});

describe("absorbed upstream change while awaiting", () => {
    /**
     * BUG. Expected: the spawn neither re-runs nor loses its await when an
     * upstream compute re-evaluates to the same value; it resumes with "ok".
     * Actual: got stays [] forever. EffectProto._receive (src/internal.js:2766-2770)
     * eagerly clears FLAG_LOADING and calls resetChannel on a mere PENDING
     * notification, which removes the spawn's waiter from the task. flushEffects
     * then finds needsUpdate() false, so the spawn never re-runs and never resumes.
     */
    test("spawn awaiting a loading task survives an upstream change a compute absorbs", async () => {
        const s = signal(1);
        const d = deferred();
        const got = [];
        let sp;
        const r = root((r) => {
            const sign = r.compute(s, (v) => v > 0);
            const t = r.task(async (c) => await c.suspend(d.promise));
            sp = r.spawn(async (c) => {
                c.val(sign);
                got.push(await c.suspend(t));
            });
        });
        s.set(2);
        /** Secondary symptom: the spawn already reports loading=false here. */
        const loadingAfterChange = sp.loading;
        d.resolve("ok");
        await settle();
        expect(got).toEqual(["ok"]);
        expect(loadingAfterChange).toBe(true);
        r.dispose();
    });

    /**
     * BUG. Expected: c.controller() is aborted only "when the node re-runs or is
     * disposed" (README). Here the task does neither, so its fetch-like work
     * should finish and the task should settle to 5.
     * Actual: the controller is aborted and the task settles with a FATAL
     * AbortError. ComputeProto._receive (src/internal.js:2483-2485) calls
     * resetChannel (aborting the controller) on a PENDING notification, before
     * anyone knows whether the dep actually changed; resolvePromise then accepts
     * the rejection because needsUpdate() is false (src/internal.js:3689-3698).
     */
    test("task controller is not aborted when an upstream compute absorbs the change", async () => {
        const s = signal(1);
        const d = deferred();
        let aborted = false;
        let t;
        const r = root((r) => {
            const sign = r.compute(s, (v) => v > 0);
            t = r.task(async (c) => {
                c.val(sign);
                const ctrl = c.controller();
                ctrl.signal.addEventListener("abort", () => {
                    aborted = true;
                    d.reject(new Error("AbortError"));
                });
                return await c.suspend(d.promise);
            });
        });
        s.set(2);
        expect(aborted).toBe(false);
        d.resolve(5);
        await settle();
        expect(t.error).toBe(false);
        expect(t.get()).toBe(5);
        r.dispose();
    });

    /**
     * BUG. Expected: the task settles to "done" once its promise resolves.
     * Actual: it stays loading forever. The effect's needsUpdate() walks into
     * the loading task through checkSingle, which finds the dep unchanged and
     * does `node._time = time` (src/internal.js:3471; checkRun does the same at
     * :3578 and :3626). That bumps the in-flight activation's time token, so the
     * c.suspend wrapper (src/internal.js:1326) and resolvePromise
     * (src/internal.js:3666) treat the live activation as stale and drop it.
     */
    test("loading task can still settle after a subscriber pulls it through an absorbed change", async () => {
        const s = signal(1);
        const d = deferred();
        let t;
        const r = root((r) => {
            const sign = r.compute(s, (v) => v > 0);
            t = r.task(sign, async (v, c) => await c.suspend(d.promise));
            r.effect((c) => {
                c.val(t);
            });
        });
        s.set(2);
        d.resolve("done");
        await settle();
        expect(t.loading).toBe(false);
        expect(t.get()).toBe("done");
        r.dispose();
    });
});

describe("settling to an unchanged value", () => {
    /**
     * BUG. Expected: a spawn awaiting a re-running task resumes when the task
     * settles, even if the new value equals the old one ("Returns when ...
     * settled"). Actual: got stays ["0:same"]; the spawn hangs forever.
     * ComputeProto._settle (src/internal.js:2159) skips the whole block, including
     * settleNotify for _waiters, when value === this._value and FLAG_INIT/ERROR
     * are clear. The waiters are never resolved and FLAG_WAITER stays set.
     */
    test("spawn awaiting a re-running task resumes when it settles to its previous value", async () => {
        const s = signal(0);
        const x = signal(0);
        const ds = [];
        const got = [];
        let t;
        const r = root((r) => {
            t = r.task(s, async (v, c) => {
                const d = deferred();
                ds.push(d);
                await c.suspend(d.promise);
                return "same";
            });
            r.spawn(async (c) => {
                const tag = c.val(x);
                const v = await c.suspend(t);
                got.push(tag + ":" + v);
            });
        });
        ds[0].resolve();
        await settle();
        expect(got).toEqual(["0:same"]);
        /** Re-run the task (pulled through the spawn's subscription). */
        s.set(1);
        await settle();
        expect(t.loading).toBe(true);
        /** Re-run the spawn so it awaits the loading task. */
        x.set(1);
        await settle();
        ds[1].resolve();
        await settle();
        expect(t.loading).toBe(false);
        expect(got).toEqual(["0:same", "1:same"]);
        r.dispose();
    });

    /**
     * BUG. Expected: resolving a callback-suspend task with a value equal to its
     * seed still settles it, notifies, and resolves waiters (the promise path
     * does, because FLAG_INIT is kept until settle). Actual: the awaiting spawn
     * hangs. The callback branch of ComputeProto._update clears FLAG_INIT early
     * (src/internal.js:2420), so _settle's `value !== this._value || flag & FLAG_INIT`
     * check (src/internal.js:2159) is false and nothing is delivered.
     */
    test("callback-suspend task resolving to its seed value still resolves waiters", async () => {
        let resolveCb;
        let t;
        const got = [];
        const r = root((r) => {
            t = r.task((c) => {
                c.suspend((res) => {
                    resolveCb = res;
                });
            }, 0);
            r.spawn(async (c) => {
                got.push(await c.suspend(t));
            });
        });
        expect(t.loading).toBe(true);
        resolveCb(0);
        await settle();
        expect(t.loading).toBe(false);
        expect(got).toEqual([0]);
        r.dispose();
    });

    /**
     * BUG. Expected (README "c.defer"): at settle time the deferred dep is
     * subscribed, and if it changed during the fetch the task re-runs, so runs
     * reaches 3. Actual: runs stays 2, and the task is left with no subscription
     * to `token` at all, so later token changes are ignored too.
     * ComputeProto._settle only calls settleDeps inside the "value changed"
     * branch (src/internal.js:2159-2172); returning the same value as the
     * previous activation skips it. Returning a fresh value each run gives 3.
     */
    test("c.defer: a deferred dep that changed during the await re-runs the task even if the result is unchanged", async () => {
        const token = signal("t1");
        const ds = [];
        let runs = 0;
        const r = root((r) => {
            const t = r.task(async (c) => {
                runs++;
                c.defer(token);
                const d = deferred();
                ds.push(d);
                await c.suspend(d.promise);
                return "ok";
            });
            r.effect((c) => {
                c.val(t);
            });
        });
        ds[0].resolve();
        await settle();
        /** Deferred dep subscribed after the first settle: this re-runs the task. */
        token.set("t2");
        await settle();
        expect(runs).toBe(2);
        /** Change it again while activation 2 is in flight. */
        token.set("t3");
        ds[1].resolve();
        await settle();
        expect(runs).toBe(3);
        r.dispose();
    });

    /**
     * BUG (medium). Expected: a task body that returns synchronously still
     * "settles", so its c.defer() dep gets registered and a later change
     * recomputes it. Actual: t.get() stays 2. The ASYNC_SYNC tail of
     * ComputeProto._update (src/internal.js:2439-2450) writes the value
     * directly and never calls settleDeps, so the deferred sender is never
     * subscribed. defer() itself only falls back to val() when FLAG_ASYNC is
     * absent (src/internal.js:1581), which is never true for a task.
     */
    test("c.defer in a task that returns synchronously still subscribes the deferred dep", () => {
        const s = signal(1);
        let t;
        const r = root((r) => {
            t = r.task((c) => c.defer(s) * 2);
        });
        expect(t.get()).toBe(2);
        s.set(5);
        expect(t.get()).toBe(10);
        r.dispose();
    });
});

describe("c.pending / c.rejected", () => {
    /**
     * BUG. Expected (README "Async state checks"): the documented
     * `if (c.pending(t)) ...; const err = c.rejected(t); ...` pattern reaches
     * the error branch. Actual: c.pending() throws the task's error, so the
     * effect crashes (here into the root's recover) and "error:boom" is never
     * logged. pending() reads through this.val(task) (src/internal.js:1626 and
     * :1633), and val() rethrows FLAG_ERROR senders.
     */
    test("c.pending() on a rejected task returns false instead of throwing", async () => {
        const log = [];
        const errors = [];
        const r = root((r) => {
            r.recover((e) => {
                errors.push(e);
                return true;
            });
            const t = r.task(async (c) => {
                await c.suspend(tick());
                throw new Error("boom");
            });
            r.effect((c) => {
                if (c.pending(t)) {
                    log.push("loading");
                    return;
                }
                const err = c.rejected(t);
                if (err) {
                    log.push("error:" + err.error.message);
                    return;
                }
                log.push("data");
            });
        });
        await settle();
        expect(errors.length).toBe(0);
        expect(log).toEqual(["loading", "error:boom"]);
        r.dispose();
    });

});

describe("resource", () => {
    /**
     * BUG (medium). Expected: a plain set() is a newer write than the in-flight
     * async write, so last-write-wins keeps "plain" and the resource stops
     * loading (README: when a new set() fires, the old callback "doesn't yield
     * back" and only the latest activation settles). Actual: loading stays true
     * and the stale server result "server" later overwrites "plain". The plain
     * path of set() (src/internal.js:520-551) neither bumps node._time nor
     * clears FLAG_LOADING, so the old activation still passes the time guards in
     * CellProto.suspend (src/internal.js:1752) and resolvePromise (src/internal.js:3666).
     */
    test("plain set() during an in-flight async write is not overwritten by the stale result", async () => {
        const r = resource("a");
        const d = deferred();
        r.set("b", async (c) => await c.suspend(d.promise));
        expect(r.loading).toBe(true);
        r.set("plain");
        const loadingAfterPlainSet = r.loading;
        d.resolve("server");
        await settle();
        expect(r.get()).toBe("plain");
        expect(loadingAfterPlainSet).toBe(false);
        expect(r.loading).toBe(false);
    });

    /**
     * BUG. Expected: a spawn awaiting a loading resource resumes once the
     * resource settles, however it settles. Actual: got stays [] forever.
     * A sync-returning asyncFn takes the ASYNC_SYNC branch of _runAsync
     * (src/internal.js:603-612), which bumps _time (orphaning the in-flight
     * activation), clears FLAG_LOADING and writes the value, but never resolves
     * the Cell's _waiters the way CellProto._settle does (src/internal.js:1780-1787).
     */
    test("sync asyncFn superseding an in-flight write resolves the resource's waiters", async () => {
        const r = resource(0);
        const d = deferred();
        const got = [];
        r.set(async (c) => await c.suspend(d.promise));
        const rt = root((rt) => {
            rt.spawn(async (c) => {
                got.push(await c.suspend(r));
            });
        });
        r.set(() => 7);
        await settle();
        expect(r.loading).toBe(false);
        expect(r.get()).toBe(7);
        expect(got).toEqual([7]);
        rt.dispose();
    });

    /**
     * BUG (medium). Expected: effects that check c.pending(r) see the optimistic
     * value as loading: ["a:false", "b:true", "c:false"]. Actual:
     * ["a:false", "b:false", "c:false"]: the effect never observes the loading
     * state, although r.loading is true right after set() returns. set() notifies
     * and flushes the optimistic write (src/internal.js:545-546) before
     * _runAsync sets FLAG_LOADING (src/internal.js:596), and setting
     * FLAG_LOADING notifies nobody. An effect like the README's resource
     * example (`console.log(val, name.loading ? "(loading)" : "")`), if created
     * before the optimistic write, prints "charlie" without "(loading)".
     */
    test("effect checking c.pending(resource) sees the optimistic value as loading", async () => {
        const r = resource("a");
        const d = deferred();
        const log = [];
        const rt = root((rt) => {
            rt.effect((c) => {
                log.push(c.val(r) + ":" + c.pending(r));
            });
        });
        r.set("b", async (c) => await c.suspend(d.promise));
        expect(r.loading).toBe(true);
        d.resolve("c");
        await settle();
        expect(log).toEqual(["a:false", "b:true", "c:false"]);
        rt.dispose();
    });

    test("LWW without c.suspend: out-of-order raw promises keep the latest write", async () => {
        const r = resource(0);
        const d1 = deferred();
        const d2 = deferred();
        r.set(1, async () => {
            await d1.promise;
            return "old";
        });
        r.set(2, async () => {
            await d2.promise;
            return "new";
        });
        d2.resolve();
        await settle();
        expect(r.get()).toBe("new");
        d1.resolve();
        await settle();
        expect(r.get()).toBe("new");
        expect(r.loading).toBe(false);
    });

    test("set() supersedes a queued post(value, asyncFn): asyncFn never runs", async () => {
        const r = resource("a");
        let ran = false;
        r.post("x", async (c, v) => {
            ran = true;
            return v;
        });
        r.set("y");
        await settle();
        expect(ran).toBe(false);
        expect(r.get()).toBe("y");
        expect(r.loading).toBe(false);
    });

    test("disposing a resource rejects a task awaiting it with a FATAL error", async () => {
        const r = resource(0);
        r.set(async (c) => await c.suspend(new Promise(() => {})));
        let t;
        const rt = root((rt) => {
            t = rt.task(async (c) => await c.suspend(r));
        });
        expect(t.loading).toBe(true);
        r.dispose();
        await settle();
        expect(t.loading).toBe(false);
        expect(t.error).toBe(true);
        expect(t.get().type).toBe(FATAL);
        expect(t.get().error.message).toBe("Awaited resource was disposed");
        rt.dispose();
    });
});

describe("callback suspend", () => {
    /**
     * BUG. Expected: calling resolve(42) synchronously inside the setup function
     * settles the task to 42. Actual: t.get() is undefined. _settle(42) runs
     * while _update is still on the stack; when the body returns, FLAG_LOADING
     * is already clear so the callback early-return (src/internal.js:2419) is
     * skipped and the ASYNC_SYNC tail writes the body's return value
     * (undefined) over the settled value (src/internal.js:2443-2444).
     */
    test("task: resolve() called synchronously in the setup fn keeps the resolved value", () => {
        let t;
        const r = root((r) => {
            t = r.task((c) => {
                c.suspend((res) => res(42));
            });
        });
        expect(t.loading).toBe(false);
        expect(t.get()).toBe(42);
        r.dispose();
    });

    /**
     * BUG. Same root cause as above, error flavour: error=true but the error POJO
     * is replaced by undefined (src/internal.js:2440-2441 writes `value` while
     * FLAG_ERROR is still set).
     */
    test("task: reject() called synchronously in the setup fn keeps the error object", () => {
        let t;
        const r = root((r) => {
            t = r.task((c) => {
                c.suspend((res, rej) => rej("bad"));
            });
        });
        expect(t.error).toBe(true);
        expect(t.get()).toEqual(fatal("bad"));
        r.dispose();
    });

    /**
     * BUG. Expected: inside batch(), writes stay deferred until the batch ends.
     * Actual: after creating a task whose callback resolves synchronously,
     * s.set(1) applies immediately. ComputeProto._settle calls flush()
     * unconditionally (src/internal.js:2189), even when not IDLE, and flush's
     * finally sets IDLE = true (src/internal.js:4360), ending the enclosing
     * batch early.
     */
    test("a task resolving synchronously inside batch() does not end the batch early", () => {
        const s = signal(0);
        let inside;
        const r = root((r) => {
            batch(() => {
                r.task((c) => {
                    c.suspend((res) => res(1));
                });
                s.set(1);
                inside = s.get();
            });
        });
        expect(inside).toBe(0);
        expect(s.get()).toBe(1);
        r.dispose();
    });

    /**
     * BUG. Expected: creating such a task from an effect re-run works and the
     * task settles to 1. Actual: the task's value is a FATAL TypeError
     * "null is not an object (evaluating 'node._flag')" from the engine's own
     * flushEffects. The re-entrant flush() from ComputeProto._settle
     * (src/internal.js:2189) re-drains RECEIVERS from index 0 while the outer
     * flushEffects has already nulled those slots (src/internal.js:4235-4238).
     */
    test("a task resolving synchronously while created inside an effect re-run settles cleanly", () => {
        const s = signal(0);
        let t;
        const r = root((r) => {
            r.effect((c) => {
                c.val(s);
            });
            r.effect((c) => {
                if (c.val(s) === 1) {
                    t = c.task((tc) => {
                        tc.suspend((res) => res(1));
                    });
                }
            });
        });
        s.set(1);
        expect(t.error).toBe(false);
        expect(t.get()).toBe(1);
        r.dispose();
    });
});

describe("lock / unlock", () => {
    /**
     * BUG. Expected (README: lock defers the re-run "until the current
     * activation completes (or c.unlock() is called)"): after unlocking, the
     * dep change made during the lock re-runs the spawn, and so do later
     * changes. Actual: runs stays [1] forever. While locked, notify() sets
     * FLAG_STALE but skips _receive (src/internal.js:3380); unlock() only
     * clears FLAG_LOCKED (src/internal.js:1534); at completion resolvePromise
     * sees STALE and silently returns (src/internal.js:3672-3673). The spawn is
     * never enqueued, and every later notify skips it because it is still STALE.
     */
    test("spawn that unlocks mid-flight still re-runs for a dep change made during the lock", async () => {
        const s = signal(1);
        const runs = [];
        const ds = [];
        const r = root((r) => {
            r.spawn(async (c) => {
                const v = c.val(s);
                runs.push(v);
                c.lock();
                const d = deferred();
                ds.push(d);
                await c.suspend(d.promise);
                c.unlock();
                await c.suspend(tick());
            });
        });
        s.set(2);
        ds[0].resolve();
        await settle();
        s.set(3);
        await settle();
        /** The re-run locked again, so the change to 3 waits for its unlock. */
        ds[ds.length - 1].resolve();
        await settle();
        expect(runs.length > 1).toBe(true);
        expect(runs[runs.length - 1]).toBe(3);
        r.dispose();
    });

    /**
     * BUG. Expected (README: "if the node was marked stale during the lock, it
     * automatically re-runs with the fresh values"): runs is ["a", "b"].
     * Actual: ["a"]; the "b" update is lost. contextSet on the IDLE path clears
     * FLAG_STALE | FLAG_PENDING on the calling node (src/internal.js:2070), wiping
     * the stale mark that the lock had deferred, so EffectProto._settle sees no
     * staleness. guardedAssign does the same at src/internal.js:2016.
     */
    test("locked spawn: c.set() to an unrelated signal does not erase the deferred re-run", async () => {
        const list = signal("a");
        const status = signal("idle");
        const runs = [];
        const ds = [];
        const r = root((r) => {
            r.spawn(async (c) => {
                const v = c.val(list);
                runs.push(v);
                c.lock();
                const d = deferred();
                ds.push(d);
                await c.suspend(d.promise);
                c.set(status, "saved:" + v);
            });
        });
        list.set("b");
        ds[0].resolve();
        await settle();
        expect(status.get()).toBe("saved:a");
        expect(runs).toEqual(["a", "b"]);
        r.dispose();
    });
});

describe("c.controller()", () => {
    /**
     * BUG. Expected: every controller handed out by c.controller() "is
     * automatically aborted when the node re-runs or is disposed". Actual: only
     * the last one is aborted; the first is silently dropped and never aborted.
     * controller() overwrites channel._controller (src/internal.js:1565), which
     * holds a single controller.
     */
    test("every controller created in one activation is aborted on re-run", async () => {
        const s = signal(0);
        const ctrls = [];
        const r = root((r) => {
            r.spawn(async (c) => {
                c.val(s);
                ctrls.push(c.controller(), c.controller());
                await c.suspend(new Promise(() => {}));
            });
        });
        s.set(1);
        expect(ctrls[1].signal.aborted).toBe(true);
        expect(ctrls[0].signal.aborted).toBe(true);
        r.dispose();
    });
});

describe("c.suspend([...])", () => {
    test("mixed array of a loading resource and a loading task resolves once both settle", async () => {
        const res = resource("r0");
        const dr = deferred();
        let out = null;
        res.set(async (c) => await c.suspend(dr.promise));
        const r = root((r) => {
            const t = r.task(async (c) => {
                await c.suspend(delay(5));
                return "T";
            });
            r.spawn(async (c) => {
                out = await c.suspend([res, t]);
            });
        });
        await delay(15);
        expect(out).toBeNull();
        dr.resolve("R");
        await settle();
        expect(out).toEqual(["R", "T"]);
        r.dispose();
    });

    test("control: a spawn that catches a single-task rejection re-runs when the task recovers", async () => {
        const ok = signal(false);
        const log = [];
        const r = root((r) => {
            const b = r.task(async (c) => {
                const v = c.val(ok);
                await c.suspend(delay(5));
                if (!v) {
                    throw new Error("nope");
                }
                return "B";
            });
            r.spawn(async (c) => {
                try {
                    log.push(await c.suspend(b));
                } catch (e) {
                    log.push("err");
                }
            });
        });
        await delay(20);
        expect(log).toEqual(["err"]);
        ok.set(true);
        await delay(20);
        expect(log).toEqual(["err", "B"]);
        r.dispose();
    });

    /**
     * BUG. Expected: same as the single-task control above. The spawn caught the
     * rejection, so it should be subscribed to the tasks and re-run when b
     * recovers: ["err", "AB"]. Actual: ["err"]. _stepArray's error branch
     * (src/internal.js:1486-1488) rejects without subscribing, and
     * settleNotify skipped subscribing because the awaiter had FLAG_BLOCKED
     * (src/internal.js:3817-3821). FLAG_BLOCKED is also left set, since only the
     * success path clears it (src/internal.js:1495).
     */
    test("spawn that catches an array rejection re-runs when the rejected task recovers", async () => {
        const ok = signal(false);
        const log = [];
        const r = root((r) => {
            const a = r.task(async (c) => {
                await c.suspend(tick());
                return "A";
            });
            const b = r.task(async (c) => {
                const v = c.val(ok);
                await c.suspend(delay(5));
                if (!v) {
                    throw new Error("nope");
                }
                return "B";
            });
            r.spawn(async (c) => {
                try {
                    const [x, y] = await c.suspend([a, b]);
                    log.push(x + y);
                } catch (e) {
                    log.push("err");
                }
            });
        });
        await delay(20);
        expect(log).toEqual(["err"]);
        ok.set(true);
        await delay(20);
        expect(log).toEqual(["err", "AB"]);
        r.dispose();
    });

    /**
     * BUG. Expected: as with a single task (whose fast path subscribes before
     * throwing), catching an already-rejected array member still leaves the
     * spawn subscribed, so it re-runs on recovery: ["err", "AB"]. Actual:
     * ["err"]. The synchronous scan in _suspendArray throws on the first errored
     * task (src/internal.js:1440-1441) before the subscribe loop
     * (src/internal.js:1446-1450) runs.
     */
    test("fast path: catching an already-rejected array member keeps the spawn subscribed", async () => {
        const ok = signal(false);
        const log = [];
        const r = root((r) => {
            const a = r.task(async (c) => {
                await c.suspend(tick());
                return "A";
            });
            const b = r.task(async (c) => {
                const v = c.val(ok);
                await c.suspend(tick());
                if (!v) {
                    throw new Error("nope");
                }
                return "B";
            });
            r.spawn(async (c) => {
                await c.suspend(delay(5));
                try {
                    const [x, y] = await c.suspend([a, b]);
                    log.push(x + y);
                } catch (e) {
                    log.push("err");
                }
            });
        });
        await delay(20);
        expect(log).toEqual(["err"]);
        ok.set(true);
        await delay(20);
        expect(log).toEqual(["err", "AB"]);
        r.dispose();
    });

    /**
     * BUG. Expected: after an abandoned array await, the next activation's
     * single-task await subscribes as usual, so a later change to the task
     * re-runs the spawn: [2, 3]. Replacing `[slow]` with `slow` gives [2, 3].
     * Actual: [2]. _suspendArray sets FLAG_BLOCKED (src/internal.js:1452); when
     * the spawn re-runs, resetChannel drops the walk, but FLAG_BLOCKED survives
     * (EffectProto._receive/_update never clear it). settleNotify then skips
     * subscribe() for the blocked awaiter (src/internal.js:3817-3821) and also
     * skips _receive for blocked subs (src/internal.js:3830, :3842).
     */
    test("FLAG_BLOCKED from an abandoned array await does not break later task subscriptions", async () => {
        const mode = signal(0);
        const tv = signal(1);
        const log = [];
        const r = root((r) => {
            const slow = r.task(async (c) => await c.suspend(new Promise(() => {})));
            const t = r.task(async (c) => {
                const v = c.val(tv);
                await c.suspend(tick());
                return v;
            });
            r.spawn(async (c) => {
                if (c.val(mode) === 0) {
                    await c.suspend([slow]);
                    return;
                }
                log.push(await c.suspend(t));
            });
        });
        await settle();
        batch(() => {
            mode.set(1);
            tv.set(2);
        });
        await settle();
        expect(log).toEqual([2]);
        tv.set(3);
        await settle();
        expect(log).toEqual([2, 3]);
        r.dispose();
    });

    /**
     * BUG. Expected: a disposed task in the array makes the await reject, as it
     * does when awaiting that task alone ("Awaited task was disposed" /
     * ILLEGAL_READ). Actual: the await resolves with ["A", null]. The disposed
     * task was not the one holding the waiter, and _stepArray never checks
     * FLAG_DISPOSED; it reads the nulled _value (src/internal.js:1476-1490).
     */
    test("a task disposed while an array await is pending does not resolve as null", async () => {
        const da = deferred();
        let out = "none";
        const errors = [];
        let b;
        const r = root((r) => {
            const a = r.task(async (c) => await c.suspend(da.promise));
            b = r.task(async (c) => {
                await c.suspend(tick());
                return "B";
            });
            r.spawn(async (c) => {
                c.recover((e) => {
                    errors.push(e);
                    return true;
                });
                out = await c.suspend([a, b]);
            });
        });
        await settle();
        b.dispose();
        da.resolve("A");
        await settle();
        expect(out).toBe("none");
        expect(errors.length).toBe(1);
        r.dispose();
    });
});

describe("async iterators", () => {
    /**
     * BUG. Expected: an async generator that finishes without yielding settles
     * the task (loading false; arguably with its return value). Actual: loading
     * stays true forever, so anything awaiting it hangs. resolveIterator's
     * onNext returns on `result.done` without settling (src/internal.js:3744-3746).
     */
    test("task whose async generator returns without yielding is not stuck loading", async () => {
        let t;
        const r = root((r) => {
            t = r.task(async function* (c) {
                await c.suspend(tick());
                return 5;
            });
        });
        await settle();
        expect(t.loading).toBe(false);
        r.dispose();
    });

    test("async generator that throws after a yield keeps the yield, then errors", async () => {
        const d = deferred();
        let t;
        const r = root((r) => {
            t = r.task(async function* () {
                yield 1;
                await d.promise;
                throw new Error("late");
            });
        });
        await settle();
        expect(t.get()).toBe(1);
        expect(t.loading).toBe(false);
        d.resolve();
        await settle();
        expect(t.error).toBe(true);
        expect(t.loading).toBe(false);
        expect(t.get().type).toBe(FATAL);
        expect(t.get().error.message).toBe("late");
        r.dispose();
    });
});

describe("c.suspend() inputs", () => {
    /**
     * BUG (medium). Expected: `await c.suspend(thenable)` yields what
     * `await thenable` yields (5). Actual: undefined. suspend returns
     * `promiseOrTask.then(guardResolve, guardReject)` directly
     * (src/internal.js:1322); a minimal thenable's then() returns undefined, so
     * the caller awaits undefined and the guarded value is thrown away.
     */
    test("c.suspend(thenable) resolves to the thenable's value", async () => {
        let got = "none";
        const r = root((r) => {
            r.spawn(async (c) => {
                got = await c.suspend({
                    then(res) {
                        res(5);
                    }
                });
            });
        });
        await settle();
        expect(got).toBe(5);
        r.dispose();
    });

    /**
     * BUG (medium; types vs implementation). types/internal.d.ts:359-362 (and
     * the SpawnContext copy at :386-389), re-exported publicly by
     * types/index.d.ts, declare `suspend(sender, onResolve, onReject?): void`.
     * The implementation (src/internal.js:1262) takes one argument and ignores
     * the callbacks, so onResolve is never called.
     */
    test("c.suspend(task, onResolve) calls onResolve as the public types declare", async () => {
        const got = [];
        const r = root((r) => {
            const t = r.task(async (c) => {
                await c.suspend(tick());
                return 9;
            });
            r.spawn((c) => {
                c.suspend(t, (v) => {
                    got.push(v);
                });
            });
        });
        await settle();
        expect(got).toEqual([9]);
        r.dispose();
    });

    /**
     * BUG (medium). Expected: awaiting yourself is rejected like
     * c.val(self) ("Cannot read a disposed node or yourself"). Actual: the task
     * registers itself as its own waiter and deadlocks, loading forever with no
     * error. _suspendTask (src/internal.js:1368-1372) only checks FLAG_DISPOSED,
     * not `taskNode === node`.
     */
    test("a task awaiting itself fails instead of deadlocking", async () => {
        let t;
        let caught = null;
        const r = root((r) => {
            t = r.task(async (c) => {
                try {
                    await c.suspend(tick());
                    return await c.suspend(t);
                } catch (e) {
                    caught = e;
                    return "caught";
                }
            }, "seed");
        });
        await settle();
        expect(t.loading).toBe(false);
        expect(caught).not.toBeNull();
        r.dispose();
    });
});

describe("errors across await", () => {
    /**
     * BUG. Expected: c.panic(val) yields `{ error: val, type: PANIC }`, as it does
     * in a sync task. Actual: after an await the task holds
     * `{ error: { error: "bad", type: PANIC }, type: FATAL }`: the PANIC is
     * reclassified as FATAL. resolvePromise's reject path calls node._error(err)
     * (src/internal.js:3698), and ComputeProto._error always wraps as FATAL
     * (src/internal.js:2225-2228) without checking FLAG_PANIC.
     */
    test("task: c.panic() after an await keeps the PANIC type", async () => {
        let t;
        const r = root((r) => {
            t = r.task(async (c) => {
                await c.suspend(tick());
                c.panic("bad");
            });
        });
        await settle();
        expect(t.error).toBe(true);
        expect(t.get()).toEqual(panic("bad"));
        r.dispose();
    });

    /**
     * BUG. Same root cause for spawns: the recover handler receives a FATAL
     * wrapping the PANIC POJO, so `err.type === PANIC` branches never fire
     * (EffectProto._error, src/internal.js:2710-2713).
     */
    test("spawn: c.panic() after an await reaches recover as PANIC", async () => {
        const errors = [];
        const r = root((r) => {
            r.spawn(async (c) => {
                c.recover((e) => {
                    errors.push(e);
                    return true;
                });
                await c.suspend(tick());
                c.panic("bad");
            });
        });
        await settle();
        expect(errors).toEqual([panic("bad")]);
        r.dispose();
    });

    test("task: c.refuse() after an await settles as a REFUSE error", async () => {
        let t;
        const r = root((r) => {
            t = r.task(async (c) => {
                await c.suspend(tick());
                return c.refuse("nope");
            });
        });
        await settle();
        expect(t.error).toBe(true);
        expect(t.get()).toEqual(refuse("nope"));
        r.dispose();
    });

    test("disposing an awaited task delivers a FATAL error to the awaiting spawn", async () => {
        const errors = [];
        let after = false;
        let t;
        const r = root((r) => {
            t = r.task(async (c) => await c.suspend(new Promise(() => {})));
            r.spawn(async (c) => {
                c.recover((e) => {
                    errors.push(e);
                    return true;
                });
                await c.suspend(t);
                after = true;
            });
        });
        t.dispose();
        await settle();
        expect(errors.length).toBe(1);
        expect(errors[0].type).toBe(FATAL);
        expect(errors[0].error.message).toBe("Awaited task was disposed");
        expect(after).toBe(false);
        r.dispose();
    });

    test("a rejection arriving after root dispose reaches no recover handler", async () => {
        const errors = [];
        const d = deferred();
        const r = root((r) => {
            r.recover((e) => {
                errors.push(e);
                return true;
            });
            r.spawn(async (c) => {
                c.recover((e) => {
                    errors.push(e);
                    return true;
                });
                await c.suspend(d.promise);
            });
        });
        r.dispose();
        d.reject(new Error("late"));
        await settle();
        expect(errors.length).toBe(0);
    });
});

/** Kept last: these blow the stack inside flush(). */
describe("resource sync asyncFn inside a drain", () => {
});
