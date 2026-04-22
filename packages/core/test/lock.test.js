import { describe, test, expect } from "#test-runner";
import { c } from "#fyren";

const tick = () => Promise.resolve();
const settle = () => tick().then(tick).then(tick);

describe("lock", () => {
  describe("task", () => {
    test("locked task does not re-run when dependency changes", async () => {
      const s1 = c.signal(1);
      let runs = 0;
      const t1 = c.task(async (c) => {
        runs++;
        let val = c.val(s1);
        c.lock();
        await c.suspend(tick());
        return val * 10;
      });
      await settle();
      expect(t1.get()).toBe(10);
      expect(runs).toBe(1);

      /** Update dep while task is loading — should not re-run yet. */
      s1.set(2);
      await settle();
      expect(runs).toBe(1);
    });

    test("locked task re-runs after settling when dep changed during lock", async () => {
      const s1 = c.signal(1);
      let runs = 0;
      let resolve;
      const t1 = c.task(async (c) => {
        runs++;
        let val = c.val(s1);
        c.lock();
        await c.suspend(new Promise((r) => { resolve = r; }));
        return val * 10;
      });
      await settle();
      expect(runs).toBe(1);

      /** Change dep while locked. */
      s1.set(2);
      await settle();
      expect(runs).toBe(1);

      /** Resolve the promise — task settles, sees stale, re-runs. */
      resolve(undefined);
      await settle();
      expect(t1.get()).toBe(10);

      /** Second activation resolves. */
      resolve(undefined);
      await settle();
      expect(t1.get()).toBe(20);
      expect(runs).toBe(2);
    });

    test("locked task returns stale value to downstream computes", async () => {
      const s1 = c.signal(1);
      let resolve;
      const t1 = c.task(async (c) => {
        let val = c.val(s1);
        c.lock();
        await c.suspend(new Promise((r) => { resolve = r; }));
        return val;
      });
      await settle();
      resolve(undefined);
      await settle();
      expect(t1.get()).toBe(1);

      /** Downstream compute reads the task. */
      const c1 = c.compute(t1, (val) => val + 100);
      expect(c1.get()).toBe(101);

      /** Change dep while task is locked. Downstream should see old value. */
      s1.set(2);
      expect(c1.get()).toBe(101);

      /** Unlock by settling. */
      resolve(undefined);
      await settle();
      expect(t1.get()).toBe(2);

      resolve(undefined);
      await settle();
      expect(c1.get()).toBe(102);
    });
  });

  describe("spawn", () => {
    test("locked spawn completes body before re-running", async () => {
      const s1 = c.signal([1, 2, 3]);
      let saved = [];
      let runs = 0;

      c.spawn(async (c) => {
        runs++;
        let arr = c.val(s1);
        c.lock();
        for (let i = 0; i < arr.length; i++) {
          await c.suspend(tick());
          saved.push(arr[i]);
        }
      });
      await settle();
      expect(runs).toBe(1);
      expect(saved).toEqual([1, 2, 3]);

      /** Update signal while spawn would be processing. */
      saved = [];
      s1.set([4, 5]);
      await settle();

      /** Spawn should not have re-run during the lock — but it already
       *  completed. The re-run happens after settle. */
      expect(runs).toBe(2);
      expect(saved).toEqual([4, 5]);
    });

    test("locked spawn ignores mid-flight dep changes", async () => {
      const s1 = c.signal(1);
      let steps = [];
      let resolve;

      c.spawn(async (c) => {
        let val = c.val(s1);
        c.lock();
        steps.push("start:" + val);
        await c.suspend(new Promise((r) => { resolve = r; }));
        steps.push("end:" + val);
      });
      await settle();
      expect(steps).toEqual(["start:1"]);

      /** Change dep while locked. */
      s1.set(2);
      await settle();
      /** Should not have restarted. */
      expect(steps).toEqual(["start:1"]);

      /** Complete the locked body. */
      resolve(undefined);
      await settle();
      expect(steps).toEqual(["start:1", "end:1", "start:2"]);

      /** Complete the second run. */
      resolve(undefined);
      await settle();
      expect(steps).toEqual(["start:1", "end:1", "start:2", "end:2"]);
    });
  });

  describe("spawn awaiting locked task", () => {
    test("spawn waits for locked task, then gets value after settle", async () => {
      const s1 = c.signal(1);
      let taskResolve;
      const t1 = c.task(async (c) => {
        let val = c.val(s1);
        c.lock();
        await c.suspend(new Promise((r) => { taskResolve = r; }));
        return val * 10;
      });
      await settle();

      let observed = null;
      c.spawn(async (c) => {
        observed = await c.suspend(t1);
      });

      /** Task settles. */
      taskResolve(undefined);
      await settle();
      expect(t1.get()).toBe(10);
      expect(observed).toBe(10);
    });

    test("spawn invalidated by another signal while awaiting locked task", async () => {
      const s1 = c.signal(1);
      const s2 = c.signal("a");
      let taskResolve;
      let observed = [];

      const t1 = c.task(async (c) => {
        let val = c.val(s1);
        c.lock();
        await c.suspend(new Promise((r) => { taskResolve = r; }));
        return val * 10;
      });
      await settle();

      c.spawn(async (c) => {
        let tag = c.val(s2);
        let val = await c.suspend(t1);
        observed.push(tag + ":" + val);
      });

      /** Task settles first run. Spawn completes its await. */
      taskResolve(undefined);
      await settle();
      expect(observed).toEqual(["a:10"]);

      /** Change s2 — invalidates the spawn but NOT the task.
       *  The spawn re-runs and awaits t1 again (already settled). */
      s2.set("b");
      await settle();
      expect(observed).toEqual(["a:10", "b:10"]);

      /** Now change s1 — task re-runs but is locked.
       *  Also change s2 — spawn re-runs, tries to await locked task.
       *  The task is loading, so the spawn blocks on suspend(t1). */
      s1.set(2);
      s2.set("c");
      await settle();

      /** Spawn is blocked waiting for the locked task. */
      expect(observed).toEqual(["a:10", "b:10"]);

      /** Settle the task — spawn's await resolves with the new value. */
      taskResolve(undefined);
      await settle();
      expect(t1.get()).toBe(20);
      expect(observed).toEqual(["a:10", "b:10", "c:20"]);
    });
  });
});
