import { describe, test, expect } from "#test-runner";
import { signal, resource, root, Defect } from "#anod";

/**
 * Disposal and the nodes waiting on a task.
 *
 * These tests pin down what happens to a node that waits on a task
 * when the task is disposed, and what happens when the waiting node
 * is itself disposed while anod is delivering a result to it.
 *
 * ─── Background: how a node waits on a task ─────────────────────────
 *
 * A task that is still loading keeps a waiter list, three entries per
 * waiter:
 *
 *     task._chan._waiters = [ node, resolve, reject,  node, resolve, reject, ... ]
 *
 * There are three kinds of waiter, which differ in what `resolve` and
 * `reject` are:
 *
 *   1. Promise waiter: `await c.suspend(task)`. anod creates a Promise
 *      and stores its resolve/reject functions. Calling them only
 *      queues the async function's continuation as a microtask, so
 *      the code after the `await` runs later, once the current
 *      synchronous work has finished.
 *
 *   2. Array waiter: `await c.suspend([a, b])`. One Promise for the
 *      whole array. The stored function is an internal re-scan
 *      ("step") that runs synchronously, walks the array again, and
 *      resolves the Promise once every member has settled. While the
 *      walk is in progress the node carries FLAG_BLOCKED.
 *
 *   3. Callback waiter: `c.suspend(task, onResolve, onReject)`. The
 *      user's own functions are stored, and the node carries
 *      FLAG_RELAY. They run synchronously, and the node then settles
 *      with what they return ("relay").
 *
 * ─── Background: what delivers to the waiters ───────────────────────
 *
 * Two things walk a task's waiter list and call the stored functions:
 *
 *   - The task settles (settleNotify). The list is detached from the
 *     task first, then:
 *       pass 1-2  every waiter is subscribed to the task, and its link
 *                 back to the task is cleared,
 *       pass 3    the task's other subscribers are marked stale,
 *       pass 4    the stored functions are called, one waiter at a time.
 *
 *   - The task is disposed (resolveWaiters, from ComputeProto._dispose).
 *     Every waiter's `reject` is called with
 *     `new Error("Awaited task was disposed")`, one at a time, while
 *     the list is still attached to the task.
 *
 * ─── Background: how disposal is scheduled ──────────────────────────
 *
 *   - `x.dispose()` queues x. If anod is idle, the queue drains at
 *     once, inside the call. If anod is already flushing or draining
 *     (inside another dispose, for example), x waits for that drain.
 *   - An owner disposes its children in reverse creation order: the
 *     last node created is disposed first (clearOwned pops `_owned`).
 *   - An owner's recover handlers stay live until all its children
 *     are disposed (clearOwned clears `_recover` at the end).
 *   - A node whose error no handler of its own keeps is disposed on
 *     the spot by internal code, not queued.
 *
 * ─── How to read the results ────────────────────────────────────────
 *
 * Tests marked PENDING wait on a design decision. They print a line
 *
 *     [PENDING X] anod today: ...
 *
 * with what anod does today, and fail until the decision is made:
 *
 *   A. A disposed node never resumes, for every waiter kind.
 *   C. Waiters are rejected after the owner's teardown, not during it,
 *      so the outcome does not depend on creation order.
 *   D. What the "Awaited task was disposed" error is: a Defect, and of
 *      which type (FATAL or PANIC).
 *
 * The other tests are bugs whose expected behavior is settled, or
 * behavior that is already correct.
 */

/** Resolves after `ms` milliseconds: long enough for every pending
 *  microtask (every queued `await` continuation) to have run. */
const wait = (ms = 5) => new Promise((r) => setTimeout(r, ms));

/** A promise that never settles. A task suspended on it loads forever. */
const never = () => new Promise(() => { });

/**
 * Prints what anod does today and fails the test.
 * @param {string} decision
 * @param {*} observed
 */
function pending(decision, observed) {
    const today = JSON.stringify(observed);
    console.log(`[PENDING ${decision}] anod today: ${today}`);
    throw new Error(`Waiting on design decision ${decision}. anod today: ${today}`);
}

/**
 * Builds, in root r, a spawn that waits on a task that loads forever.
 * `body(cx, task, me)` is the spawn's waiting code; `me()` returns the
 * spawn itself, so the body can check whether it has been disposed.
 *
 * The point of the helper is to control creation order, which decides
 * which of the two the owner disposes first:
 *
 *   taskFirst = true:   _owned = [task, spawn]
 *                       teardown disposes the spawn first, then the task
 *
 *   taskFirst = false:  _owned = [spawn, task]
 *                       teardown disposes the task first, then the spawn
 *
 * With taskFirst false the spawn must exist before the task, yet still
 * wait on it. So its first run only reads `go` (the task does not
 * exist yet) and returns. Creating the task and writing `go` re-runs
 * the spawn, and that run calls `body`.
 */
function waitOnTask(r, taskFirst, body) {
    let task = null;
    let spawn = null;
    const go = signal(0);
    if (taskFirst) {
        task = r.task((cx) => cx.suspend(never()));
    }
    spawn = r.spawn((cx) => {
        cx.val(go);
        if (task !== null) {
            return body(cx, task, () => spawn);
        }
    });
    if (!taskFirst) {
        task = r.task((cx) => cx.suspend(never()));
        go.set(1);
    }
    return { task, spawn };
}

describe("an owner's teardown and the waiters inside it", () => {
    /**
     * PENDING C. Does creation order change what a waiter sees when its
     * owner is torn down?
     *
     * The setup is the same in both rounds: one root owns a task that
     * loads forever and a spawn that awaits it inside try/catch. Only
     * the creation order differs.
     *
     * Round 1, task created first (_owned = [task, spawn]):
     *
     *     r.dispose()
     *       └─ dispose spawn          ← last created, goes first
     *            removes its waiter entry from the task's list
     *       └─ dispose task
     *            waiter list is empty: nothing to reject
     *     → the spawn never hears about anything. seen = []
     *
     * Round 2, task created second (_owned = [spawn, task]):
     *
     *     r.dispose()
     *       └─ dispose task           ← last created, goes first
     *            resolveWaiters: calls the spawn's Promise reject with
     *            Error("Awaited task was disposed")
     *            → only queues the continuation (a microtask)
     *       └─ dispose spawn
     *     r.dispose() returns
     *     ── microtask ──
     *     the spawn's `await` throws, and its catch block runs,
     *     on a spawn that is already disposed
     *     → seen = ["catch ran (spawn disposed: true)"]
     *
     * Both rounds tear down the same graph, yet user code runs in one
     * and not the other. Decision C (reject after the teardown) would
     * make the rounds agree. The test prints both rounds.
     */
    test("PENDING C: a waiter sees the same thing whatever the creation order", async () => {
        const observed = {};
        for (const taskFirst of [true, false]) {
            const seen = [];
            const r = root((r) => {
                waitOnTask(r, taskFirst, async (cx, task, me) => {
                    try {
                        await cx.suspend(task);
                        seen.push("resumed");
                    } catch (err) {
                        seen.push("catch ran (spawn disposed: " + me().disposed + ")");
                    }
                });
            });
            /** Let the spawn reach its await. */
            await wait();
            r.dispose();
            /** Let any queued continuation run. */
            await wait();
            observed[taskFirst ? "task created first" : "task created second"] = seen;
        }
        pending("C", observed);
    });

    /**
     * PENDING A. Does a task-path await resume on a disposed node?
     *
     * Awaiting a promise is guarded: `c.suspend(promise)` returns
     * `promise.then(guard)`, and the guard checks whether the node was
     * re-run or disposed. If it was, it returns REGRET, a thenable whose
     * `then` never calls back, so the `await` never resumes.
     *
     * Awaiting a task has no guard: `c.suspend(task)` returns the raw
     * Promise whose resolve/reject sit in the task's waiter list.
     *
     * Timeline (task created second, so it is disposed first):
     *
     *     r.dispose()
     *       └─ dispose task → reject the spawn's Promise (queued)
     *       └─ dispose spawn
     *     ── microtask ──
     *     the spawn's await throws inside a disposed spawn
     *     → its catch block runs: { catchRan: true, spawnDisposed: true }
     *
     * Any code in that catch (or in a finally) runs on a dead node: it
     * can write signals or create nodes after its owner tore it down.
     * Decision A: a disposed node never resumes, for every waiter kind.
     */
    test("PENDING A: a task-path await does not resume on a disposed node", async () => {
        const seen = [];
        const r = root((r) => {
            waitOnTask(r, false, async (cx, task, me) => {
                try {
                    await cx.suspend(task);
                } catch (err) {
                    seen.push({ catchRan: true, spawnDisposed: me().disposed });
                }
            });
        });
        await wait();
        r.dispose();
        await wait();
        pending("A", seen.length === 0 ? "the continuation did not run" : seen);
    });

    /**
     * PENDING C. Does onReject run in the middle of its owner's teardown?
     *
     * This is the callback form of the previous test. A callback waiter
     * has no microtask in between: its functions run synchronously when
     * the waiter list is walked.
     *
     *     r.dispose()
     *       └─ dispose task
     *            resolveWaiters → the spawn has FLAG_RELAY → relay:
     *              onReject(Defect) runs NOW, inside r.dispose(),
     *              while the spawn is still alive
     *              → { onRejectRan: true, spawnDisposed: false }
     *              then the spawn settles (onReject returned)
     *       └─ dispose spawn            ← a moment later
     *
     * The user's onReject runs halfway through tearing down its own
     * owner. Some siblings are already gone, some are not, and a write
     * from it would flush against a half-disposed tree. Decision C
     * would move it after the teardown, where decision A skips it
     * because the spawn is disposed by then.
     */
    test("PENDING C: onReject does not run in the middle of its owner's teardown", async () => {
        const seen = [];
        const r = root((r) => {
            waitOnTask(r, false, (cx, task, me) => {
                cx.suspend(task, () => { }, (err) => {
                    seen.push({ onRejectRan: true, spawnDisposed: me().disposed, error: err.error.message });
                });
            });
        });
        await wait();
        r.dispose();
        await wait();
        pending("C", seen.length === 0 ? "onReject did not run" : seen);
    });

    /**
     * PENDING C. Is a root's recover asked about an error its own
     * teardown created?
     *
     * Same as above, but without onReject. A callback waiter without
     * onReject fails its node, as a throwing await would, so the error
     * travels up the owner chain:
     *
     *     r.dispose()
     *       └─ dispose task
     *            resolveWaiters → relay → no onReject:
     *              spawn._error(Error("Awaited task was disposed"))
     *                tryRecover: the spawn has no handler of its own,
     *                so r's recover is asked. r is being disposed, but
     *                its handlers stay live until all its children are
     *                gone. It returns true.
     *                → "root recover: Awaited task was disposed"
     *              The owner handled it, so the spawn is disposed on
     *              the spot (internal _dispose, not queued). That sets
     *              spawn._chan = null.
     *            resolveWaiters continues with this waiter: it clears
     *            the spawn's link back to the task, which reads
     *            spawn._chan → TypeError
     *       → the TypeError leaves r.dispose(), wrapped as a FATAL
     *         Defect: "root.dispose() threw: TypeError: ..."
     *
     * Two things are printed: the root's handler was consulted about
     * its own teardown (decision C), and the crash (the next test).
     */
    test("PENDING C: a root's recover is not asked about its own teardown", async () => {
        const seen = [];
        const r = root((r) => {
            r.recover((err) => {
                seen.push("root recover: " + err.error.message);
                return true;
            });
            waitOnTask(r, false, (cx, task) => {
                cx.suspend(task, () => { });
            });
        });
        await wait();
        try {
            r.dispose();
        } catch (err) {
            seen.push("root.dispose() threw: " + (err instanceof Defect ? err.error : err));
        }
        await wait();
        pending("C", seen.length === 0 ? "no recover handler ran" : seen);
    });

    /**
     * BUG. root.dispose() throws a TypeError when a callback waiter's
     * error disposes it inside the waiter loop.
     *
     * The spawn's own recover declines (returns false), so the error
     * goes to the root, which handles it. Either way the spawn does not
     * keep the error, so it is disposed:
     *
     *     resolveWaiters, waiter = spawn
     *       1. deliver → relay → spawn._error(...)
     *            spawn recover: false → root recover: true
     *            → spawn disposed on the spot, spawn._chan = null
     *       2. clear the spawn's link back to the task
     *            reads spawn._chan._res1 → TypeError
     *
     * The loop calls the waiter first and cleans up its link second, so
     * any waiter that is disposed by its own callback breaks step 2.
     * The fix is to clear every link before calling anything, as the
     * settle path does now. Expected: dispose() returns normally.
     */
    test("root.dispose() does not throw when a callback waiter's recover declines", async () => {
        const r = root((r) => {
            r.recover(() => true);
            waitOnTask(r, false, (cx, task) => {
                cx.recover(() => false);
                cx.suspend(task, () => { });
            });
        });
        await wait();
        let thrown = null;
        try {
            r.dispose();
        } catch (err) {
            thrown = err;
        }
        expect(thrown).toBe(null);
    });
});

describe("a waiter disposed while a settle delivers to it", () => {
    /**
     * Builds the graph the next tests share:
     *
     *     root r
     *       task    loads until resolve() is called
     *       waiter 1  first(cx, task, other): waits on task
     *     root other
     *       waiter 2  second(cx, task): waits on task
     *
     * Both waiters register on the task, in creation order:
     *
     *     task._waiters = [ waiter1, ..., waiter2, ... ]
     *
     * So when the task settles, waiter 1's callback runs before
     * waiter 2's, and waiter 1 can dispose waiter 2 in between. The
     * test calls resolve() from plain test code, while anod is idle,
     * so a dispose() made from waiter 1's callback runs at once.
     */
    function twoWaiters(first, second) {
        let resolveTask;
        let task;
        let other;
        const r = root((r) => {
            task = r.task((cx) => cx.suspend((resolve) => {
                resolveTask = resolve;
            }));
            r.spawn((cx) => first(cx, task, () => other));
            other = root((r2) => {
                r2.spawn((cx) => second(cx, task));
            });
        });
        return { r, resolve: (v) => resolveTask(v) };
    }

    /**
     * BUG. A callback waiter disposed by an earlier waiter still has its
     * onResolve called.
     *
     *     resolve(1)
     *       task settles; its waiter list is detached:
     *         [ waiter1, waiter2 ]
     *       pass 4, waiter 1 (FLAG_RELAY) → relay → onResolve:
     *         other().dispose()   ← anod is idle, so this runs now
     *           waiter 2 is disposed. Disposal resets its flags to
     *           FLAG_DISPOSED alone, so FLAG_RELAY is gone.
     *       pass 4, waiter 2:
     *         no FLAG_RELAY → treated as a plain function waiter
     *         → its onResolve(1) is called on a disposed spawn
     *         → seen = [1]
     *
     * The README says a dispose before the task settles drops the
     * callbacks. From waiter 2's point of view this dispose did happen
     * before its result arrived. Expected: seen = [].
     */
    test("a callback waiter disposed by an earlier waiter's callback never runs", async () => {
        const seen = [];
        const { r, resolve } = twoWaiters(
            (cx, task, other) => cx.suspend(task, () => other().dispose()),
            (cx, task) => cx.suspend(task, (v) => seen.push(v))
        );
        resolve(1);
        await wait();
        expect(seen).toEqual([]);
        r.dispose();
    });

    /**
     * BUG. As above, but the task fails and waiter 2 has no onReject.
     *
     *     rejectTask("bad")
     *       task fails; pass 4 walks [ waiter1, waiter2 ] with the error
     *       waiter 1 → relay → its onReject disposes `other` (now)
     *       waiter 2 → FLAG_RELAY is gone, so it is treated as a plain
     *         function waiter and its stored reject is called. But
     *         waiter 2 never gave an onReject: the stored value is null.
     *         → TypeError: fn is not a function
     *       The TypeError escapes the task's settle and is thrown
     *       from rejectTask() into this test. The rest of the settle
     *       (the flush that follows it) never runs.
     *
     * The recover handlers keep the errors anod is supposed to deliver
     * from leaking out of the spawns, so that anything that escapes
     * rejectTask() is the bug. Expected: nothing is thrown.
     */
    test("a callback waiter without onReject, disposed during a failing settle, is skipped", async () => {
        let rejectTask;
        let other;
        let thrown = null;
        const r = root((r) => {
            const task = r.task((cx) => cx.suspend((resolve, reject) => {
                rejectTask = reject;
            }));
            r.spawn((cx) => {
                cx.recover(() => true);
                cx.suspend(task, () => { }, () => other.dispose());
            });
            other = root((r2) => {
                r2.spawn((cx) => {
                    cx.recover(() => true);
                    cx.suspend(task, () => { });
                });
            });
        });
        try {
            rejectTask("bad");
        } catch (err) {
            thrown = err;
        }
        await wait();
        expect(thrown).toBe(null);
        r.dispose();
    });

    /**
     * PENDING A. A promise waiter disposed by an earlier waiter still
     * resumes.
     *
     *     resolveTask(1)
     *       pass 4 walks [ waiter1, spawn2 ]
     *       waiter 1 → relay → onResolve disposes `other` (now),
     *         spawn2 included
     *       spawn2 → plain function waiter: its Promise resolve(1) is
     *         called, which queues the continuation
     *     ── microtask (inside `await wait()`) ──
     *     spawn2's `await` returns 1, on a disposed spawn
     *     → { resumed: 1, spawnDisposed: true }
     *
     * Same root cause as the teardown test above: the task-path Promise
     * has no guard. Decision A would skip a disposed waiter at delivery
     * time, for every waiter kind.
     */
    test("PENDING A: a promise waiter disposed by an earlier waiter does not resume", async () => {
        const seen = [];
        let spawn2;
        let resolveTask;
        let other;
        const r = root((r) => {
            const task = r.task((cx) => cx.suspend((resolve) => {
                resolveTask = resolve;
            }));
            r.spawn((cx) => cx.suspend(task, () => other.dispose()));
            other = root((r2) => {
                spawn2 = r2.spawn(async (cx) => {
                    const v = await cx.suspend(task);
                    seen.push({ resumed: v, spawnDisposed: spawn2.disposed });
                });
            });
        });
        resolveTask(1);
        await wait();
        r.dispose();
        pending("A", seen.length === 0 ? "the continuation did not run" : seen);
    });

    /**
     * PENDING A. An array waiter disposed by an earlier waiter still
     * resumes, and is subscribed to the task again.
     *
     * spawn2 awaits [task]. While the task loads, spawn2 carries
     * FLAG_BLOCKED and its waiter entry holds the internal re-scan:
     *
     *     task._waiters = [ waiter1, onResolve, null,  spawn2, step, step ]
     *
     *     resolveTask(1)
     *       pass 4, waiter 1 → onResolve disposes `other` (now): spawn2's
     *         flags reset to FLAG_DISPOSED, so FLAG_BLOCKED is gone
     *       pass 4, spawn2 → step(1) runs the re-scan for a disposed node:
     *         every member has settled, so it subscribes spawn2 to the
     *         task again (a dead node in the task's subscriber list) and
     *         resolves the Promise
     *     ── microtask ──
     *     spawn2's `await` returns [1] on a disposed spawn
     *     → { resumed: 1, spawnDisposed: true }
     *
     * Decision A covers this too: skipping a disposed waiter before its
     * function is called also skips the re-scan and its subscription.
     */
    test("PENDING A: an array waiter disposed by an earlier waiter does not resume", async () => {
        const seen = [];
        let spawn2;
        let resolveTask;
        let other;
        const r = root((r) => {
            const task = r.task((cx) => cx.suspend((resolve) => {
                resolveTask = resolve;
            }));
            r.spawn((cx) => cx.suspend(task, () => other.dispose()));
            other = root((r2) => {
                spawn2 = r2.spawn(async (cx) => {
                    const [v] = await cx.suspend([task]);
                    seen.push({ resumed: v, spawnDisposed: spawn2.disposed });
                });
            });
        });
        resolveTask(1);
        await wait();
        r.dispose();
        pending("A", seen.length === 0 ? "the continuation did not run" : seen);
    });

    /**
     * Fixed: an array waiter resumes once, with a consistent snapshot,
     * even when settling its members disposes another waiter.
     *
     * The graph:
     *
     *     task   loads until resolveTask(1)
     *     dep    = r.task(task, v => v), a bound task. It already ran
     *            once with undefined, while task had no value. When it
     *            runs with 1, it disposes `other`.
     *     w1     awaits [task, dep]   (array waiter, blocked on task)
     *     w2     in `other`, awaits task
     *     w3     awaits task
     *
     *     task._waiters = [ w1, w2, w3 ]
     *
     * Today (waiters resume in pass 4, after pass 3 marked dep stale):
     *
     *     resolveTask(1)
     *       pass 3: dep is marked stale
     *       pass 4, w1 → step re-scans [task, dep]:
     *         task = 1. dep is stale, so it is refreshed: dep runs with
     *         1, disposes `other` (w2), returns 1
     *         → snapshot [1, 1], w1's Promise resolves
     *       pass 4, w2 → resolved (it is disposed; see decision A above)
     *       pass 4, w3 → resolved
     *     ── microtasks ──
     *     w1 resumes once, with [1, 1]. w3 resumes once.
     *
     * Before the reorder, waiters resumed in pass 2, before dep was
     * marked stale:
     *
     *       pass 2, w1 → step re-scans: dep still looks settled, with
     *         its old value → snapshot [1, undefined], w1 resolves
     *       pass 3: dep stale → dep re-runs with 1 → w1, now subscribed
     *         to dep, re-runs → resolves again with [1, 1]
     *     → w1 ran twice, the first time with values that never
     *       existed together.
     */
    test("an array waiter resumes once with a consistent snapshot when a member's update disposes another waiter", async () => {
        const seen = [];
        let resolveTask;
        let other;
        const r = root((r) => {
            const task = r.task((cx) => cx.suspend((resolve) => {
                resolveTask = resolve;
            }));
            const dep = r.task(task, (v) => {
                if (v === 1) {
                    other.dispose();
                }
                return v;
            });
            r.spawn(async (cx) => {
                const values = await cx.suspend([task, dep]);
                seen.push(["w1", values]);
            });
            other = root((r2) => {
                r2.spawn(async (cx) => {
                    await cx.suspend(task);
                });
            });
            r.spawn(async (cx) => {
                await cx.suspend(task);
                seen.push(["w3"]);
            });
        });
        resolveTask(1);
        await wait();
        expect(seen.filter((s) => s[0] === "w1")).toEqual([["w1", [1, 1]]]);
        expect(seen.filter((s) => s[0] === "w3").length).toBe(1);
        r.dispose();
    });
});

describe("a waiter that fails while a task's disposal delivers to it", () => {
    /**
     * BUG. When one waiter is disposed by its own error during a task's
     * disposal, the waiters after it are never told.
     *
     * Three spawns in root r wait on a task that lives in another root:
     *
     *     task._waiters = [ w1, w2, w3 ]
     *
     *     w1: callback waiter, no onReject, its recover declines
     *     w2, w3: callback waiters with onReject
     *     r's recover handles everything
     *
     *     taskRoot.dispose()
     *       └─ dispose task → resolveWaiters walks [ w1, w2, w3 ]
     *            w1 → relay → no onReject → w1._error(...)
     *                 w1 declines, r handles → w1 is disposed on the
     *                 spot, w1._chan = null
     *            clearing w1's link back to the task reads w1._chan
     *            → TypeError. The loop stops here.
     *            w2 and w3 are never told, and stay loading forever.
     *     → taskRoot.dispose() throws
     *
     * (A dispose() called from inside a callback here would not show
     * this: while anod drains a dispose, a dispose() is queued and runs
     * after the loop. Only the internal, on-the-spot disposal of a
     * failing node happens mid-loop.)
     *
     * Expected: taskRoot.dispose() returns normally, and w2 and w3 each
     * get their onReject once.
     */
    test("one waiter failing does not stop the others from being told", async () => {
        const calls = [];
        let thrown = null;
        let taskRoot;
        let task;
        const r = root((r) => {
            r.recover(() => true);
            taskRoot = root((rt) => {
                task = rt.task((cx) => cx.suspend(never()));
            });
            r.spawn((cx) => {
                cx.recover(() => false);
                cx.suspend(task, () => { });
            });
            r.spawn((cx) => cx.suspend(task, () => { }, () => calls.push("w2")));
            r.spawn((cx) => cx.suspend(task, () => { }, () => calls.push("w3")));
        });
        try {
            taskRoot.dispose();
        } catch (err) {
            thrown = err;
        }
        await wait();
        expect(thrown).toBe(null);
        expect(calls.sort()).toEqual(["w2", "w3"]);
        r.dispose();
    });
});

describe("the error a disposed task hands its waiters", () => {
    /**
     * PENDING D. What error does a waiter get when the task it waits on
     * is disposed?
     *
     * This is the intended case: the task lives in its own root and is
     * disposed on purpose, while two live spawns in another root wait
     * on it.
     *
     *     taskRoot.dispose()
     *       └─ dispose task → resolveWaiters, with
     *          new Error("Awaited task was disposed")
     *            spawn 1 (promise waiter): reject(Error), queued
     *            spawn 2 (callback waiter): relay wraps the error, so
     *              onReject(Defect) runs now
     *     ── microtask ──
     *     spawn 1's catch receives the plain Error
     *
     * Today:
     *     await    → a plain Error, outside the Defect model
     *     onReject → a Defect with type FATAL (wrapped by the relay)
     *
     * Decision D: should the error be a Defect from the start, so both
     * paths see the same value? And is a task disposed under its waiter
     * a crash (FATAL), or an expected abort (PANIC)?
     */
    test("PENDING D: a disposed task rejects its waiters with a Defect of a decided type", async () => {
        const observed = {};
        let taskRoot;
        let task;
        const r = root((r) => {
            taskRoot = root((rt) => {
                task = rt.task((cx) => cx.suspend(never()));
            });
            r.spawn(async (cx) => {
                try {
                    await cx.suspend(task);
                } catch (err) {
                    observed.await = err instanceof Defect
                        ? { Defect: true, type: err.type }
                        : { Defect: false, value: String(err) };
                }
            });
            r.spawn((cx) => cx.suspend(task, () => { }, (err) => {
                observed.onReject = { Defect: err instanceof Defect, type: err.type };
            }));
        });
        taskRoot.dispose();
        await wait();
        r.dispose();
        pending("D", observed);
    });
});

describe("a disposed resource and its waiters", () => {
    /**
     * Already correct. A live waiter gets the error when the resource it
     * waits on is disposed.
     *
     *     res.set(0, () => never())   the resource loads forever
     *     spawn: await cx.suspend(res)  → promise waiter on res
     *
     *     res.dispose()
     *       └─ CellProto._dispose marks res disposed first, then rejects
     *          its waiters with Error("Awaited resource was disposed")
     *          (queued)
     *     ── microtask ──
     *     the spawn, which is alive (its root is untouched), catches it
     *
     * This is the case the disposal error exists for, and the outcome
     * other tests compare against: a live waiter must hear that what it
     * waits on is gone.
     */
    test("a live waiter gets the error when the resource it waits on is disposed", async () => {
        const seen = [];
        const res = resource(0);
        res.set(0, () => never());
        const r = root((r) => {
            r.spawn(async (cx) => {
                try {
                    await cx.suspend(res);
                } catch (err) {
                    seen.push(err.message);
                }
            });
        });
        res.dispose();
        await wait();
        expect(seen).toEqual(["Awaited resource was disposed"]);
        r.dispose();
    });
});
