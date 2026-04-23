import { describe, test, expect } from "#test-runner";
import { signal, root } from "#anod";

let c; root((_c) => { c = _c; });

const tick = () => Promise.resolve();
const settle = () => tick().then(tick).then(tick);

describe("channel cleanup", () => {
  test("resetChannel clears responds when res1 was already resolved", async () => {
    /**
     * Scenario: a spawn awaits two tasks via the array path.
     * taskA goes to _res1, taskB goes to _responds.
     * taskA settles first → _res1 is cleared by resolveWaiters.
     * Then the spawn is invalidated and re-runs.
     * resetChannel must clear _responds (taskB) even though
     * _res1 is null, otherwise taskB still references the
     * stale activation.
     */
    let resolveA, resolveB;
    const taskA = c.task((cx) => cx.suspend(new Promise((r) => { resolveA = r; })));
    const taskB = c.task((cx) => cx.suspend(new Promise((r) => { resolveB = r; })));
    await settle();

    const s1 = signal(1);
    let runs = 0;

    c.spawn(async (cx) => {
      runs++;
      cx.val(s1);
      /** Array suspend: taskA → _res1, taskB → _responds. */
      let results = await cx.suspend([taskA, taskB]);
    });
    await settle();
    expect(runs).toBe(1);

    /** Settle taskA first. The spawn's _res1 is cleared by
     *  resolveWaiters, but _responds still has taskB. */
    resolveA(10);
    await settle();

    /** Invalidate the spawn. resetChannel must detect that
     *  _responds is non-null and call clearChannel, removing
     *  the spawn from taskB's waiter list. */
    s1.set(2);
    await settle();
    expect(runs).toBe(2);

    /** Now settle taskB for the OLD activation. Since the spawn
     *  was properly removed from taskB's waiters, this should
     *  NOT crash or deliver to the stale activation. */
    resolveB(20);
    await settle();

    /** Settle both for the new activation. */
    resolveA(100);
    await settle();
    resolveB(200);
    await settle();
  });

  test("chained suspend(task): invalidation before settlement cleans up correctly", async () => {
    /**
     * A spawn awaits taskA, then taskB sequentially. A dep changes
     * while the spawn is waiting for taskA, causing a re-run.
     * resetChannel removes the old waiter. When the tasks settle,
     * they deliver to the current (new) activation. Only one
     * result should be produced.
     */
    const s1 = signal(1);
    let resolveA, resolveB;

    const taskA = c.task((cx) => cx.suspend(new Promise((r) => { resolveA = r; })));
    const taskB = c.task((cx) => cx.suspend(new Promise((r) => { resolveB = r; })));
    await settle();

    let observed = [];
    let runs = 0;
    c.spawn(async (cx) => {
      runs++;
      cx.val(s1);
      let a = await cx.suspend(taskA);
      let b = await cx.suspend(taskB);
      observed.push(a + ":" + b);
    });
    await settle();
    expect(runs).toBe(1);

    /** Invalidate the spawn while it's waiting for taskA.
     *  resetChannel removes the old waiter. Spawn re-runs. */
    s1.set(2);
    await settle();
    expect(runs).toBe(2);

    /** Settle both tasks. The current activation receives them. */
    resolveA(10);
    await settle();
    resolveB(20);
    await settle();

    /** One result from the current activation. */
    expect(observed).toEqual(["10:20"]);
    expect(runs).toBe(2);
  });

  test("array suspend: invalidation during stepArray walk cleans up correctly", async () => {
    /**
     * A spawn awaits [taskA, taskB] via array suspend. A dep changes
     * while waiting. resetChannel removes old waiters. When the
     * tasks settle, the current activation's stepArray walk proceeds.
     */
    const s1 = signal(1);
    let resolveA, resolveB;
    const taskA = c.task((cx) => cx.suspend(new Promise((r) => { resolveA = r; })));
    const taskB = c.task((cx) => cx.suspend(new Promise((r) => { resolveB = r; })));
    await settle();

    let observed = [];
    let runs = 0;
    c.spawn(async (cx) => {
      runs++;
      cx.val(s1);
      let results = await cx.suspend([taskA, taskB]);
      observed.push(results[0] + ":" + results[1]);
    });
    await settle();
    expect(runs).toBe(1);

    /** Invalidate spawn while waiting. */
    s1.set(2);
    await settle();
    expect(runs).toBe(2);

    /** Settle both tasks. Current activation receives them. */
    resolveA(10);
    await settle();
    resolveB(20);
    await settle();

    /** One result from the current activation. */
    expect(observed).toEqual(["10:20"]);
  });
});
