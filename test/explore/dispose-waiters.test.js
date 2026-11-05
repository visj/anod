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
 *   - The task is disposed (rejectWaiters, from ComputeProto._dispose).
 *     The list is detached and every link back to the task cleared.
 *     Then every waiter's `reject` gets
 *     `new Error("Awaited task was disposed")`. If the disposal is part
 *     of a teardown (inside a flush, or inside teardown()), the
 *     rejections are not called yet: they go into a queue (REJECTS),
 *     which is delivered once the teardown has finished.
 *
 * Whoever calls a stored function first checks the waiter: a disposed
 * waiter is skipped, unless it is locked (c.lock() promises to run to
 * the end). An await on a task also re-checks when it resumes, a
 * microtask later, as an await on a promise always did.
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
 * ─── The rules these tests check ────────────────────────────────────
 *
 *   A. A disposed node never resumes, for every waiter kind. A locked
 *      node counts as not disposed until its activation finishes.
 *   B. Nothing a waiter's callback does can corrupt the walk over the
 *      waiter list: links are cleared before anything is called.
 *   C. A task disposed in a teardown rejects its waiters after the
 *      teardown, so the outcome does not depend on creation order, and
 *      only waiters that survive the teardown are told.
 *
 * Tests marked PENDING wait on a design decision. They print a line
 *
 *     [PENDING X] anod today: ...
 *
 * with what anod does today, and fail until the decision is made:
 *
 *   D. What the "Awaited task was disposed" error is: a Defect, and of
 *      which type (FATAL or PANIC).
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
     * Rule C. Creation order does not change what a waiter sees when
     * its owner is torn down.
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
     *     → seen = []
     *
     * Round 2, task created second (_owned = [spawn, task]):
     *
     *     r.dispose()                 (drains inside a flush)
     *       └─ dispose task           ← last created, goes first
     *            rejectWaiters: the spawn's reject goes into REJECTS
     *       └─ dispose spawn
     *       teardown finished → deliver REJECTS:
     *            the spawn is disposed → skipped
     *     → seen = []
     *
     * Before rule C, round 2 called the spawn's reject inside the task's
     * disposal, while the spawn was still alive. A microtask later its
     * catch block ran on a disposed spawn:
     *     seen = ["catch ran (spawn disposed: true)"]
     */
    test("a waiter sees the same thing whatever the creation order", async () => {
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
        expect(observed).toEqual({ "task created first": [], "task created second": [] });
    });

    /**
     * Rule A. A task await does not resume on a node its owner's
     * teardown disposed.
     *
     * This is round 2 of the previous test, checked on its own. Two
     * things now stop the continuation:
     *
     *     r.dispose()
     *       └─ dispose task → reject queued in REJECTS
     *       └─ dispose spawn
     *       deliver REJECTS → the spawn is disposed → skipped (rule A)
     *
     * Even if the reject had been called, the await would not resume:
     * `c.suspend(task)` now returns `promise.then(guard)`, like
     * `c.suspend(promise)` always did. The guard runs when the await
     * would resume. If the node was disposed or re-run by then, it
     * returns REGRET, a thenable whose `then` never calls back.
     *
     * Before, the reject ran during the teardown, and a microtask later
     * the spawn's catch block ran on a dead node:
     *     { catchRan: true, spawnDisposed: true }
     */
    test("a task-path await does not resume on a disposed node", async () => {
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
        expect(seen).toEqual([]);
    });

    /**
     * Rule C. onReject does not run in the middle of its owner's
     * teardown.
     *
     * This is the callback form of the previous test. A callback waiter
     * has no microtask in between: its functions run synchronously when
     * they are delivered, so only the timing of the delivery protects it.
     *
     *     r.dispose()
     *       └─ dispose task → the spawn's onReject queued in REJECTS
     *       └─ dispose spawn
     *       deliver REJECTS → the spawn is disposed → skipped
     *     → seen = []
     *
     * Before, the task's disposal called the relay at once: onReject
     * ran inside r.dispose(), while the spawn was still alive, halfway
     * through tearing down its own owner:
     *     { onRejectRan: true, spawnDisposed: false }
     */
    test("onReject does not run in the middle of its owner's teardown", async () => {
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
        expect(seen).toEqual([]);
    });

    /**
     * Rule C. A root's recover is not asked about an error its own
     * teardown created.
     *
     * A callback waiter without onReject fails its node, as a throwing
     * await would, and the error travels up the owner chain. During a
     * teardown that chain is being torn down: r's handlers stay live
     * until all its children are gone.
     *
     *     r.dispose()
     *       └─ dispose task → the spawn's (missing) onReject queued
     *       └─ dispose spawn
     *       deliver REJECTS → the spawn is disposed → skipped
     *     → no handler runs, nothing is thrown
     *
     * Before, the rejection ran during the task's disposal:
     *     relay → no onReject → spawn._error(...) → r's recover asked
     *       → "root recover: Awaited task was disposed"
     *     the owner handled it, so the spawn was disposed on the spot,
     *     inside the waiter loop, which then read its cleared channel
     *       → "root.dispose() threw: TypeError: ..."
     */
    test("a root's recover is not asked about its own teardown", async () => {
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
        expect(seen).toEqual([]);
    });

    /**
     * Fixed (rule B). root.dispose() threw a TypeError when a callback
     * waiter's error disposed it inside the waiter loop.
     *
     * The spawn's own recover declines (returns false), so the error
     * goes to the root, which handles it. Either way the spawn does not
     * keep the error, so it is disposed. The old loop did, per waiter:
     *
     *       1. deliver → relay → spawn._error(...)
     *            spawn recover: false → root recover: true
     *            → spawn disposed on the spot, spawn._chan = null
     *       2. clear the spawn's link back to the task
     *            reads spawn._chan._res1 → TypeError
     *
     * The loop called the waiter first and cleaned up its link second.
     * Now every link is cleared before anything is called (rule B). In
     * this test rule C also applies: the rejection waits for the end of
     * the teardown, where the disposed spawn is skipped.
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

    /**
     * Rule A, locked nodes. A locked waiter is still rejected, and its
     * activation runs to the end.
     *
     * c.lock() promises that the activation completes. A dispose that
     * arrives while locked only marks the node (FLAG_DISPOSED, with
     * FLAG_LOCKED still set) and is replayed when the activation ends.
     * Until then the node counts as alive.
     *
     *     r.dispose()
     *       └─ dispose task → reject queued in REJECTS
     *       └─ dispose spawn → locked: only marked disposed
     *       deliver REJECTS → disposed but locked → delivered
     *     r.dispose() returns
     *     ── microtask ──
     *     the guard lets a locked node through: the await throws, the
     *     catch runs, the body finishes
     *     the activation settles → the deferred dispose runs now, and
     *     the cleanup with it
     *
     * Expected order: catch, body finished, cleanup.
     */
    test("a locked waiter is rejected, finishes its activation, then is disposed", async () => {
        const seen = [];
        let spawn;
        const r = root((r) => {
            ({ spawn } = waitOnTask(r, false, async (cx, task) => {
                cx.lock();
                cx.cleanup(() => seen.push("cleanup"));
                try {
                    await cx.suspend(task);
                } catch (err) {
                    seen.push("catch: " + err.message);
                }
                seen.push("body finished");
            }));
        });
        await wait();
        r.dispose();
        await wait();
        expect(seen).toEqual(["catch: Awaited task was disposed", "body finished", "cleanup"]);
        expect(spawn.disposed).toBe(true);
    });

    /**
     * Rule C, waiters outside the teardown. A waiter that survives the
     * teardown is told, once the teardown has finished.
     *
     * The task lives in its own root, next to a sentinel compute created
     * before it. Owners dispose in reverse order, so the sentinel is the
     * last node the teardown disposes: once it is disposed, the teardown
     * is complete. Two spawns in another root wait on the task.
     *
     *     taskRoot.dispose()
     *       └─ dispose task → both rejections queued
     *       └─ dispose sentinel        ← teardown complete
     *       deliver REJECTS:
     *         callback spawn → onReject runs now (sentinel disposed)
     *         promise spawn  → reject called, the catch runs later
     *     taskRoot.dispose() returns
     *     ── microtask ──
     *     promise spawn's catch runs (sentinel disposed)
     */
    test("a waiter outside the teardown is rejected once the teardown has finished", async () => {
        const seen = [];
        let taskRoot;
        let sentinel;
        let task;
        const r = root((r) => {
            taskRoot = root((rt) => {
                sentinel = rt.compute(() => 1);
                task = rt.task((cx) => cx.suspend(never()));
            });
            r.spawn((cx) => cx.suspend(task, () => { }, () => {
                seen.push("onReject, teardown finished: " + sentinel.disposed);
            }));
            r.spawn(async (cx) => {
                try {
                    await cx.suspend(task);
                } catch (err) {
                    seen.push("catch, teardown finished: " + sentinel.disposed);
                }
            });
        });
        taskRoot.dispose();
        seen.push("dispose returned");
        await wait();
        expect(seen).toEqual([
            "onReject, teardown finished: true",
            "dispose returned",
            "catch, teardown finished: true",
        ]);
        r.dispose();
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
     * Fixed (rule A). A callback waiter disposed by an earlier waiter
     * had its onResolve called anyway.
     *
     *     resolve(1)
     *       task settles; its waiter list is detached:
     *         [ waiter1, waiter2 ]
     *       pass 4, waiter 1 (FLAG_RELAY) → relay → onResolve:
     *         other().dispose()   ← anod is idle, so this runs now
     *           waiter 2 is disposed. Disposal resets its flags to
     *           FLAG_DISPOSED alone, so FLAG_RELAY is gone.
     *       pass 4, waiter 2: disposed → skipped
     *     → seen = []
     *
     * Before, the loop did not check: with FLAG_RELAY gone, waiter 2
     * looked like a plain function waiter, and its onResolve(1) was
     * called on a disposed spawn (seen = [1]).
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
     * Fixed (rule A). As above, but the task fails and waiter 2 has no
     * onReject.
     *
     *     rejectTask("bad")
     *       task fails; pass 4 walks [ waiter1, waiter2 ] with the error
     *       waiter 1 → relay → its onReject disposes `other` (now)
     *       waiter 2 → disposed → skipped
     *
     * Before, waiter 2 was treated as a plain function waiter and its
     * stored reject was called. It never gave an onReject, so the stored
     * value was null: "TypeError: fn is not a function", thrown out of
     * the task's settle, out of rejectTask(), into this test.
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
     * Rule A. A promise waiter disposed by an earlier waiter does not
     * resume.
     *
     *     resolveTask(1)
     *       pass 4 walks [ waiter1, spawn2 ]
     *       waiter 1 → relay → onResolve disposes `other` (now),
     *         spawn2 included
     *       spawn2 → disposed → skipped: its resolve is never called
     *     → seen = []
     *
     * Before, spawn2's resolve(1) was called, and a microtask later its
     * await returned 1 on a disposed spawn:
     *     { resumed: 1, spawnDisposed: true }
     */
    test("a promise waiter disposed by an earlier waiter does not resume", async () => {
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
        expect(seen).toEqual([]);
        r.dispose();
    });

    /**
     * Rule A. An array waiter disposed by an earlier waiter does not
     * resume, and is not subscribed to the task again.
     *
     * spawn2 awaits [task]. While the task loads, its waiter entry holds
     * the internal re-scan:
     *
     *     task._waiters = [ waiter1, onResolve, null,  spawn2, step, step ]
     *
     *     resolveTask(1)
     *       pass 4, waiter 1 → onResolve disposes `other` (now)
     *       pass 4, spawn2 → disposed → skipped: the re-scan never runs
     *     → seen = []
     *
     * Before, step(1) ran the re-scan for the disposed node: it found
     * every member settled, subscribed spawn2 to the task again (a dead
     * node in the task's subscriber list), and resolved the Promise, so
     * the await returned [1] on a disposed spawn.
     */
    test("an array waiter disposed by an earlier waiter does not resume", async () => {
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
        expect(seen).toEqual([]);
        r.dispose();
    });

    /**
     * Rule A, the guard at resume. A waiter disposed after its result
     * was delivered, but before its await resumed, does not resume.
     *
     * The order of the waiters is swapped compared to the tests above:
     * spawn2 is created first, so it is delivered to first, and only
     * then disposed by the callback waiter after it.
     *
     *     task._waiters = [ spawn2, waiter1 ]
     *
     *     resolveTask(1)
     *       pass 4, spawn2 → alive → its resolve(1) is called, which
     *         only queues the continuation
     *       pass 4, waiter 1 → onResolve disposes `other` (now),
     *         spawn2 included
     *     ── microtask ──
     *     the guard on spawn2's await runs: spawn2 is disposed → REGRET,
     *     so the await never resumes
     *     → seen = []
     *
     * The skip at delivery cannot catch this, since spawn2 was alive
     * then. Both the task form and the array form are checked.
     */
    test("a waiter disposed after its result was delivered does not resume", async () => {
        const observed = {};
        for (const form of ["task", "array"]) {
            const seen = [];
            let resolveTask;
            let other;
            let spawn2;
            const r = root((r) => {
                const task = r.task((cx) => cx.suspend((resolve) => {
                    resolveTask = resolve;
                }));
                other = root((r2) => {
                    spawn2 = r2.spawn(async (cx) => {
                        const v = form === "task"
                            ? await cx.suspend(task)
                            : (await cx.suspend([task]))[0];
                        seen.push({ resumed: v, spawnDisposed: spawn2.disposed });
                    });
                });
                r.spawn((cx) => cx.suspend(task, () => other.dispose()));
            });
            resolveTask(1);
            await wait();
            observed[form] = seen;
            r.dispose();
        }
        expect(observed).toEqual({ task: [], array: [] });
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
     *       pass 4, w2 → disposed → skipped (rule A)
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
     * Fixed (rule B). When one waiter was disposed by its own error
     * during a task's disposal, the waiters after it were never told.
     *
     * Three spawns in root r wait on a task that lives in another root:
     *
     *     task._waiters = [ w1, w2, w3 ]
     *
     *     w1: callback waiter, no onReject, its recover declines
     *     w2, w3: callback waiters with onReject
     *     r's recover handles everything
     *
     * Now (rules B and C):
     *
     *     taskRoot.dispose()
     *       └─ dispose task → rejectWaiters: list detached, every link
     *          cleared, all three rejections queued
     *       teardown finished → deliver REJECTS:
     *            w1 → relay → no onReject → w1._error(...)
     *                 w1 declines, r handles → w1 is disposed (its own
     *                 teardown; nothing is left pointing at it)
     *            w2 → onReject
     *            w3 → onReject
     *     → dispose returns, calls = ["w2", "w3"]
     *
     * Before, the loop delivered to w1 first and cleared its link
     * second. w1's disposal had set w1._chan = null, so clearing the
     * link threw a TypeError, the loop stopped, and w2 and w3 were never
     * told: they stayed loading forever, and taskRoot.dispose() threw.
     *
     * (A dispose() called from inside a callback would not show this:
     * while anod drains a dispose, a dispose() is queued and runs after
     * the loop. Only the internal, on-the-spot disposal of a failing
     * node happened mid-loop.)
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
