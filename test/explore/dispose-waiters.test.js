import { describe, test, expect } from "#test-runner";
import { signal, resource, root, Defect } from "#anod";

/**
 * Disposal and the nodes waiting on a task: what happens to a waiter
 * when the task it waits on is disposed, or when the waiter itself is
 * disposed while a settle or a disposal is delivering to it.
 *
 * Tests marked PENDING wait on a design decision. They print what anod
 * does today and fail until the decision is made:
 *
 *   A. A disposed node never resumes, for every waiter kind.
 *   C. Waiters are rejected after the owner's teardown, not during it,
 *      so the outcome does not depend on creation order.
 *   D. What the "Awaited task was disposed" error is (Defect? FATAL or
 *      PANIC?).
 *
 * The others are bugs whose expected behavior is settled.
 */

const wait = (ms = 5) => new Promise((r) => setTimeout(r, ms));
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
 * Builds, in root r, a spawn that waits on a task through body, and
 * the task. With taskFirst false the spawn is created first, so the
 * owner disposes the task first (owners dispose in reverse order).
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
    /** PENDING C. Owners dispose children in reverse creation order, so
     *  a task created after its waiter is disposed first and rejects a
     *  waiter that the same teardown is about to dispose. */
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
            await wait();
            r.dispose();
            await wait();
            observed[taskFirst ? "task created first" : "task created second"] = seen;
        }
        pending("C", observed);
    });

    /** PENDING A. A task-path await has no staleness guard, unlike
     *  c.suspend(promise): its rejection resumes the async function one
     *  microtask later, after the spawn is already disposed. */
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

    /** PENDING C. A callback waiter's onReject runs synchronously in the
     *  middle of its owner's teardown, while the waiter is still alive. */
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

    /** PENDING C. Without onReject, the teardown's error goes through
     *  recover, including the handler of the root being disposed. */
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

    /** BUG. A spawn whose recover declines the teardown's error is
     *  disposed inside resolveWaiters' loop, which then reads the
     *  disposed node's channel: TypeError out of root.dispose(). */
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
    /** Builds task t (resolved through the returned function), waiter 1
     *  in r, which runs first, and waiter 2 in its own root. */
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

    /** BUG. Disposing a node clears all its flags, FLAG_RELAY included,
     *  so the waiter loop calls its onResolve as a plain function on the
     *  disposed node. The README says a dispose drops the callbacks. */
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

    /** BUG. As above, with an error and no onReject: the plain call path
     *  calls the missing onReject. */
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

    /** PENDING A. A promise waiter disposed during the settle still has
     *  its resolve called, and its async function resumes. */
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

    /** PENDING A. Same for an array await: the internal re-scan runs for
     *  the disposed waiter, which then resumes. */
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

    /** Fixed by resuming waiters from a detached list. Before, a waiter
     *  disposed mid-settle was removed from the array being walked, and
     *  an earlier waiter resumed twice. */
    test("disposing a waiter during a settle resumes every other waiter once", async () => {
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
                await cx.suspend([task, dep]);
                seen.push("w1");
            });
            other = root((r2) => {
                r2.spawn(async (cx) => {
                    await cx.suspend(task);
                });
            });
            r.spawn(async (cx) => {
                await cx.suspend(task);
                seen.push("w3");
            });
        });
        resolveTask(1);
        await wait();
        expect(seen.filter((s) => s === "w1").length).toBe(1);
        expect(seen.filter((s) => s === "w3").length).toBe(1);
        r.dispose();
    });
});

describe("a waiter disposed while a task's disposal delivers to it", () => {
    /** BUG. resolveWaiters walks the task's waiter list while it is still
     *  attached. A callback that disposes a later waiter removes it from
     *  that list mid-walk (swap with last), so a waiter is skipped, run
     *  twice, or read past the end. */
    test("an onReject that disposes another waiter leaves the rest intact", async () => {
        const calls = [];
        let thrown = null;
        let taskRoot;
        let task;
        let other;
        const r = root((r) => {
            taskRoot = root((rt) => {
                task = rt.task((cx) => cx.suspend(never()));
            });
            r.spawn((cx) => cx.suspend(task, () => { }, () => {
                calls.push("w1");
                other.dispose();
            }));
            other = root((r2) => {
                r2.spawn((cx) => cx.suspend(task, () => { }, () => calls.push("w2")));
            });
            r.spawn((cx) => cx.suspend(task, () => { }, () => calls.push("w3")));
            r.spawn((cx) => cx.suspend(task, () => { }, () => calls.push("w4")));
        });
        try {
            taskRoot.dispose();
        } catch (err) {
            thrown = err;
        }
        await wait();
        expect(thrown).toBe(null);
        expect(calls.sort()).toEqual(["w1", "w3", "w4"]);
        r.dispose();
    });
});

describe("the error a disposed task hands its waiters", () => {
    /** PENDING D. Await-ers catch a plain Error, created outside the
     *  Defect model; onReject gets it wrapped as FATAL. */
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
    /** Intended: a resource marks itself disposed before it rejects its
     *  waiters, and a live waiter gets the error. */
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
