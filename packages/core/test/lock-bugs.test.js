import { describe, test, expect } from "#test-runner";
import { signal, root } from "#fyren";

let c; root((_c) => { c = _c; });

const tick = () => Promise.resolve();
const settle = () => tick().then(tick).then(tick);

describe("lock bugs", () => {
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
      expect(c1.error).not.toBeNull();

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
