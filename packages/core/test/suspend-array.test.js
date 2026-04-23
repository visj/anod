import { describe, test, expect } from "#test-runner";
import { signal, root } from "#fyren";

let c; root((_c) => { c = _c; });

const tick = () => Promise.resolve();
const settle = () => tick().then(tick).then(tick).then(tick).then(tick);

describe("suspend([tasks]) consistency", () => {
  test("re-scans when a previously settled task goes back to loading", async () => {
    /**
     * taskA and taskB both depend on `url`. taskA settles quickly,
     * taskB is slower. While waiting for taskB, a trigger causes
     * taskA to re-run (goes back to loading). The suspend should
     * NOT resolve until both are settled again — the snapshot must
     * be consistent.
     */
    const url = signal("/api");
    const trigger = signal(0);
    let resolveA, resolveB;

    const taskA = c.task(async (cx) => {
      let u = cx.val(url);
      let t = cx.val(trigger);
      await cx.suspend(new Promise((r) => { resolveA = r; }));
      return "A:" + u + ":" + t;
    });

    const taskB = c.task(async (cx) => {
      let u = cx.val(url);
      await cx.suspend(new Promise((r) => { resolveB = r; }));
      return "B:" + u;
    });
    await settle();

    let observed = null;
    c.spawn(async (cx) => {
      let results = await cx.suspend([taskA, taskB]);
      observed = results;
    });
    await settle();

    /** Settle taskA first. */
    resolveA(undefined);
    await settle();
    /** taskA is settled, taskB is still loading. suspend waits. */
    expect(observed).toBeNull();

    /** Now trigger causes taskA to re-run (goes back to loading). */
    trigger.set(1);
    await settle();
    expect(observed).toBeNull();

    /** Settle taskB. But taskA is loading again! suspend must NOT
     *  resolve yet — it should re-scan and see taskA is loading. */
    resolveB(undefined);
    await settle();
    expect(observed).toBeNull();

    /** Finally settle taskA again. NOW both are settled. */
    resolveA(undefined);
    await settle();
    expect(observed).not.toBeNull();
    expect(observed[0]).toBe("A:/api:1");
    expect(observed[1]).toBe("B:/api");
  });

  test("visited array does not prevent re-checking settled tasks", async () => {
    /**
     * Three tasks. taskA and taskC settle quickly. taskB is slow.
     * While waiting for taskB, taskA goes back to loading.
     * suspend must wait for taskA to settle again.
     */
    let resolveA, resolveB, resolveC;
    const s = signal(0);

    const taskA = c.task(async (cx) => {
      let v = cx.val(s);
      await cx.suspend(new Promise((r) => { resolveA = r; }));
      return "A" + v;
    });
    const taskB = c.task(async (cx) => {
      await cx.suspend(new Promise((r) => { resolveB = r; }));
      return "B";
    });
    const taskC = c.task(async (cx) => {
      await cx.suspend(new Promise((r) => { resolveC = r; }));
      return "C";
    });
    await settle();

    let observed = null;
    c.spawn(async (cx) => {
      let results = await cx.suspend([taskA, taskB, taskC]);
      observed = results;
    });
    await settle();

    /** Settle A and C. B still loading. */
    resolveA(undefined);
    resolveC(undefined);
    await settle();
    expect(observed).toBeNull();

    /** Invalidate taskA — goes back to loading. */
    s.set(1);
    await settle();
    expect(observed).toBeNull();

    /** Settle B. A is still loading! Must not resolve yet. */
    resolveB(undefined);
    await settle();
    expect(observed).toBeNull();

    /** Settle A again. Now all three are settled. */
    resolveA(undefined);
    await settle();
    expect(observed).not.toBeNull();
    expect(observed[0]).toBe("A1");
    expect(observed[1]).toBe("B");
    expect(observed[2]).toBe("C");
  });
});
