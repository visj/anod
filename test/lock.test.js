import { describe, test, expect } from "#test-runner";
import { signal, root, c } from "#anod";

const tick = () => Promise.resolve();
const settle = () => tick().then(tick).then(tick);

describe("lock", () => {
  describe("task", () => {
    test("locked task does not re-run when dependency changes", async () => {
      const s1 = signal(1);
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
      const s1 = signal(1);
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
      const s1 = signal(1);
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
      const s1 = signal([1, 2, 3]);
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
      const s1 = signal(1);
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
      const s1 = signal(1);
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
      const s1 = signal(1);
      const s2 = signal("a");
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
  describe("dispose while locked", () => {
    test("locked task defers dispose until settlement", async () => {
      let resolve;
      let cleanupRan = false;
      let t1;
      const r1 = root((r) => {
        t1 = r.task(async (cx) => {
          cx.cleanup(() => { cleanupRan = true; });
          cx.lock();
          await cx.suspend(new Promise((r) => { resolve = r; }));
          return 42;
        });
      });
      await settle();
      expect(t1.loading).toBe(true);
      expect(cleanupRan).toBe(false);

      /** Dispose the owner while the task is locked and loading.
       *  FLAG_DISPOSED is set eagerly so the system treats it as
       *  dead, but cleanup is deferred until settlement. */
      r1.dispose();
      expect(cleanupRan).toBe(false);
      expect(t1.disposed).toBe(true);

      /** Now settle the locked task — dispose should happen. */
      resolve(undefined);
      await settle();
      expect(cleanupRan).toBe(true);
      expect(t1.disposed).toBe(true);
    });

    test("locked spawn defers dispose until settlement", async () => {
      let resolve;
      let cleanupRan = false;
      let steps = [];
      const r1 = root((r) => {
        r.spawn(async (cx) => {
          cx.cleanup(() => { cleanupRan = true; });
          cx.lock();
          steps.push("start");
          await cx.suspend(new Promise((r) => { resolve = r; }));
          steps.push("end");
        });
      });
      await settle();
      expect(steps).toEqual(["start"]);
      expect(cleanupRan).toBe(false);

      /** Dispose owner while spawn is locked. */
      r1.dispose();
      expect(cleanupRan).toBe(false);

      /** Settle — now dispose should fire. */
      resolve(undefined);
      await settle();
      expect(steps).toEqual(["start", "end"]);
      expect(cleanupRan).toBe(true);
    });

    test("locked task is immediately disposed but defers cleanup", async () => {
      let resolve;
      let cleanupRan = false;
      let t1;
      const r1 = root((r) => {
        t1 = r.task(async (cx) => {
          cx.cleanup(() => { cleanupRan = true; });
          cx.lock();
          await cx.suspend(new Promise((r) => { resolve = r; }));
          return 99;
        });
      });
      await settle();

      /** Dispose owner while locked. Node should be flagged disposed
       *  immediately, but cleanup is deferred until settlement. */
      r1.dispose();
      expect(t1.disposed).toBe(true);
      expect(cleanupRan).toBe(false);

      /** Settle — cleanup runs now. */
      resolve(undefined);
      await settle();
      expect(t1.disposed).toBe(true);
      expect(cleanupRan).toBe(true);
    });

    test("reading a locked+disposed task throws ASSERT_DISPOSED", async () => {
      let resolve;
      let t1;
      const r1 = root((r) => {
        t1 = r.task(async (cx) => {
          cx.lock();
          await cx.suspend(new Promise((r) => { resolve = r; }));
          return 42;
        });
      });
      await settle();

      /** Dispose owner while locked. */
      r1.dispose();
      expect(t1.disposed).toBe(true);

      /** A compute reading a disposed sender absorbs the error.
       *  Pulling its value rethrows. */
      const c1 = c.compute((cx) => cx.val(t1));
      expect(c1.error).toBe(true);

      /** Settle to clean up. */
      resolve(undefined);
      await settle();
    });
  });

  describe("locked node re-run on settle", () => {
    test("locked task re-runs when dep changed during lock (FLAG_STALE)", async () => {
      const s1 = signal(1);
      let runs = 0;
      let resolve;
      const t1 = c.task(async (cx) => {
        runs++;
        let val = cx.val(s1);
        cx.lock();
        await cx.suspend(new Promise((r) => { resolve = r; }));
        return val * 10;
      });
      await settle();
      expect(runs).toBe(1);

      /** Direct dep change → FLAG_STALE on the task. */
      s1.set(2);
      await settle();
      expect(runs).toBe(1);

      /** Settle the first activation. Task should see it's stale and re-run. */
      resolve(undefined);
      await settle();
      expect(t1.get()).toBe(10);

      /** Second activation settles. */
      resolve(undefined);
      await settle();
      expect(t1.get()).toBe(20);
      expect(runs).toBe(2);
    });

    test("locked task re-runs when transitive dep changed (FLAG_PENDING)", async () => {
      const s1 = signal(1);
      const c1 = c.compute(s1, (val) => val * 2);
      let runs = 0;
      let resolve;
      const t1 = c.task(async (cx) => {
        runs++;
        let val = cx.val(c1);
        cx.lock();
        await cx.suspend(new Promise((r) => { resolve = r; }));
        return val + 100;
      });
      await settle();
      expect(runs).toBe(1);
      expect(t1.get()).toBeUndefined();

      /** Transitive dep change → task gets FLAG_PENDING (not STALE). */
      s1.set(2);
      await settle();
      expect(runs).toBe(1);

      /** Settle — task should detect pending dep changed and re-run. */
      resolve(undefined);
      await settle();
      expect(t1.get()).toBe(102);

      resolve(undefined);
      await settle();
      expect(t1.get()).toBe(104);
      expect(runs).toBe(2);
    });

    test("locked task notifies downstream effects on settle + re-run", async () => {
      const s1 = signal(1);
      let resolve;
      let observed = [];
      const t1 = c.task(async (cx) => {
        let val = cx.val(s1);
        cx.lock();
        await cx.suspend(new Promise((r) => { resolve = r; }));
        return val;
      });
      await settle();

      c.effect((cx) => {
        if (!cx.pending(t1)) {
          observed.push(cx.val(t1));
        }
      });
      resolve(undefined);
      await settle();
      expect(observed).toEqual([1]);

      /** Change dep while locked. */
      s1.set(2);
      await settle();

      /** Settle — task re-runs, downstream effect should see new value. */
      resolve(undefined);
      await settle();
      resolve(undefined);
      await settle();
      expect(observed).toEqual([1, 2]);
    });

    test("locked spawn re-runs when dep changed during lock", async () => {
      const s1 = signal(1);
      let runs = 0;
      let resolve;
      let values = [];

      c.spawn(async (cx) => {
        runs++;
        let val = cx.val(s1);
        cx.lock();
        await cx.suspend(new Promise((r) => { resolve = r; }));
        values.push(val);
      });
      await settle();
      expect(runs).toBe(1);

      /** Change dep while locked. */
      s1.set(2);
      await settle();
      expect(runs).toBe(1);

      /** Settle — spawn should re-run with new value. */
      resolve(undefined);
      await settle();
      expect(values).toEqual([1]);
      expect(runs).toBe(2);

      resolve(undefined);
      await settle();
      expect(values).toEqual([1, 2]);
    });
  });

  describe("unlocked stale guard", () => {
    test("unlocked PENDING+needsUpdate marks FLAG_STALE so pull re-runs", async () => {
      const s1 = signal(1);
      const c1 = c.compute(s1, (val) => val * 2);
      let runs = 0;
      let resolve;

      /** Task depends on c1 (transitive dep of s1). */
      const t1 = c.task(async (cx) => {
        runs++;
        let val = cx.val(c1);
        await cx.suspend(new Promise((r) => { resolve = r; }));
        return val;
      });
      await settle();
      expect(runs).toBe(1);

      /** Change s1 while task is loading. Task gets FLAG_PENDING.
       *  The old promise resolves — should be discarded (stale).
       *  After discarding, FLAG_STALE is set so the next pull re-runs. */
      s1.set(2);
      resolve(undefined);
      await settle();

      /** Task is still loading (old activation discarded, FLAG_STALE set).
       *  Pulling triggers re-run → new activation with new promise. */
      expect(t1.loading).toBe(true);
      t1.get();
      expect(runs).toBe(2);

      /** Resolve the new activation. */
      resolve(undefined);
      await settle();
      expect(t1.get()).toBe(4);
    });

    test("unlocked PENDING+needsUpdate with effect subscriber triggers re-run", async () => {
      const s1 = signal(1);
      const c1 = c.compute(s1, (val) => val * 2);
      let runs = 0;
      let resolve;
      let observed = [];

      /** Task depends on c1 (transitive dep of s1). */
      const t1 = c.task(async (cx) => {
        runs++;
        let val = cx.val(c1);
        await cx.suspend(new Promise((r) => { resolve = r; }));
        return val;
      });
      await settle();

      /** Effect subscribes to the task — will trigger re-run. */
      c.effect((cx) => {
        if (!cx.pending(t1)) {
          observed.push(cx.val(t1));
        }
      });
      resolve(undefined);
      await settle();
      expect(observed).toEqual([2]);
      expect(runs).toBe(1);

      /** Change dep while loading. Effect ensures task re-runs. */
      s1.set(2);
      resolve(undefined);
      await settle();
      resolve(undefined);
      await settle();
      expect(observed).toEqual([2, 4]);
      expect(runs).toBe(2);
    });
  });
});
