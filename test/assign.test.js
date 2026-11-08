import { describe, test, expect } from "#test-runner";
import { signal, resource, batch, root, c } from "#anod";

describe("Signal.set and Signal.post", () => {
  describe("updater callback deferral", () => {
    test("set with updater defers callback to drain time", () => {
      const s1 = signal(0);
      const s2 = signal(0);

      /** Two effects that both increment s2 when s1 changes.
       *  With deferred callbacks, first drain resolves fn(0)=1,
       *  second resolves fn(1)=2. With eager callbacks, both
       *  resolve fn(0)=1 at call time, so final value is 1. */
      c.effect(s1, (v) => {
        if (v > 0) {
          s2.set((prev) => prev + 1);
        }
      });
      c.effect(s1, (v) => {
        if (v > 0) {
          s2.set((prev) => prev + 1);
        }
      });

      s1.set(1);
      expect(s2.get()).toBe(2);
    });

    test("set with updater resolves against drain-time value", () => {
      const s1 = signal(0);
      const s2 = signal(10);

      /** Effect sets s2 to a plain value, then an updater. The
       *  updater must see the scheduled value (20), not the
       *  original (10). */
      c.effect(s1, (v) => {
        if (v > 0) {
          s2.set(20);
          s2.set((prev) => prev + 5);
        }
      });

      s1.set(1);
      expect(s2.get()).toBe(25);
    });
  });

  describe("post defers all writes", () => {
    test("post never writes value immediately", async () => {
      const s1 = signal(1);
      s1.post(2);
      /** Value is NOT written yet — post only schedules. */
      expect(s1.get()).toBe(1);

      /** After microtask flush, value is applied. */
      await Promise.resolve();
      expect(s1.get()).toBe(2);
    });

    test("post batches multiple writes into one flush", async () => {
      const s1 = signal(0);
      let runs = 0;
      c.effect(s1, () => { runs++; });
      runs = 0;

      s1.post(1);
      s1.post(2);
      s1.post(3);
      /** Nothing has flushed yet. */
      expect(s1.get()).toBe(0);
      expect(runs).toBe(0);

      await Promise.resolve();
      expect(s1.get()).toBe(3);
      /** Effect runs once — all writes coalesced. */
      expect(runs).toBe(1);
    });

    test("post with updater defers callback to flush time", async () => {
      const s1 = signal(0);
      s1.post((prev) => prev + 1);
      s1.post((prev) => prev + 1);
      /** Callbacks have not been called yet. */
      expect(s1.get()).toBe(0);

      await Promise.resolve();
      /** Both updaters resolved sequentially at drain time. */
      expect(s1.get()).toBe(2);
    });

    test("post from inside effect schedules to drain queue", () => {
      const s1 = signal(0);
      const s2 = signal(100);
      let observed = [];

      /** This effect reads both signals. It must see a consistent
       *  snapshot within each run — s2 should not change mid-cycle. */
      c.effect((cx) => {
        observed.push(cx.val(s1) + ":" + cx.val(s2));
      });

      /** This effect posts to s2 when s1 changes. */
      c.effect(s1, (v) => {
        if (v > 0) {
          s2.post(200);
        }
      });

      s1.set(1);
      /** First run: both effects see s1=1, s2=100.
       *  Post schedules s2=200 for next drain cycle.
       *  Second run: first effect re-runs with s2=200. */
      expect(observed).toEqual(["0:100", "1:100", "1:200"]);
    });

    test("post skips when value unchanged and nothing is queued", async () => {
      const s1 = signal(5);
      let runs = 0;
      c.effect(s1, () => { runs++; });
      runs = 0;

      s1.post(5);
      await Promise.resolve();
      /** No change — effect should not have run. */
      expect(runs).toBe(0);
    });

    test("post schedules even if value matches current when a write is queued", async () => {
      const s1 = signal(0);
      s1.post(5);
      /** A write is queued — a second post back to 0 must still
       *  schedule, otherwise the reset is lost. */
      s1.post(0);
      await Promise.resolve();
      expect(s1.get()).toBe(0);
    });
  });
  describe("immediate writes supersede queued writes", () => {
    test("set after post reads the set value, before and after the microtask", async () => {
      const s1 = signal(0);
      s1.post(1);
      s1.set(2);
      expect(s1.get()).toBe(2);
      await Promise.resolve();
      expect(s1.get()).toBe(2);
    });

    test("set to the current value cancels a pending post", async () => {
      const s1 = signal(0);
      let runs = 0;
      c.effect(s1, () => { runs++; });
      runs = 0;

      s1.post(1);
      expect(s1.set(0)).toBe(false);
      await Promise.resolve();
      expect(s1.get()).toBe(0);
      expect(runs).toBe(0);
    });

    test("superseded updaters never run", async () => {
      const s1 = signal(0);
      let calls = 0;
      s1.post((v) => (calls++, v + 1));
      s1.post((v) => (calls++, v + 1));
      s1.set(10);
      await Promise.resolve();
      expect(calls).toBe(0);
      expect(s1.get()).toBe(10);
    });

    test("posts to other signals survive and flush with the set", async () => {
      const s1 = signal(0);
      const s2 = signal(0);
      let observed = [];
      c.effect((cx) => { observed.push(cx.val(s1) + ":" + cx.val(s2)); });

      s2.post(5);
      s1.post(1);
      s1.set(2);
      expect(observed).toEqual(["0:0", "2:5"]);
      await Promise.resolve();
      expect(observed).toEqual(["0:0", "2:5"]);
    });

    test("a post after set takes effect on the next microtask", async () => {
      const s1 = signal(0);
      s1.post(1);
      s1.set(2);
      s1.post(3);
      expect(s1.get()).toBe(2);
      await Promise.resolve();
      expect(s1.get()).toBe(3);
    });

    test("set with updater sees the committed value, not the superseded post", async () => {
      const s1 = signal(1);
      s1.post(5);
      s1.set((v) => v * 10);
      await Promise.resolve();
      expect(s1.get()).toBe(10);
    });

    test("a throwing updater leaves the queued writes in place", async () => {
      const s1 = signal(0);
      s1.post(1);
      expect(() => s1.set(() => { throw new Error("boom"); })).toThrow();
      expect(s1.get()).toBe(0);
      await Promise.resolve();
      expect(s1.get()).toBe(1);
    });

    test("set cancels a queued resource activation before it starts", async () => {
      const r = resource(0);
      let calls = 0;
      r.post(async () => { calls++; return 1; });
      r.set(2);
      await Promise.resolve();
      await Promise.resolve();
      expect(calls).toBe(0);
      expect(r.get()).toBe(2);
    });

    test("contextual set after an await supersedes a pending post", async () => {
      const s1 = signal(0);
      let done;
      c.spawn(async (cx) => {
        await cx.suspend(Promise.resolve());
        s1.post(1);
        cx.set(s1, 2);
        done = s1.get();
      });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(done).toBe(2);
      expect(s1.get()).toBe(2);
    });
  });

  describe("queued writes", () => {
    test("inside batch, set queues behind an earlier post", () => {
      const s1 = signal(0);
      s1.post((v) => v + 1);
      batch(() => {
        s1.set((v) => v * 10);
      });
      expect(s1.get()).toBe(10);
    });

    test("inside batch, the last write wins even when it matches the current value", () => {
      const s1 = signal(0);
      batch(() => {
        s1.set(1);
        s1.set(0);
      });
      expect(s1.get()).toBe(0);

      batch(() => {
        s1.set(1);
        s1.post(0);
      });
      expect(s1.get()).toBe(0);
    });

    test("inside batch, a set to the current value still overrides an earlier post", async () => {
      const s1 = signal(0);
      s1.post(1);
      batch(() => {
        s1.set(0);
      });
      expect(s1.get()).toBe(0);
      await Promise.resolve();
      expect(s1.get()).toBe(0);
    });

    test("an unchanged write does not hide a later change from subscribers", async () => {
      const s1 = signal(0);
      let runs = 0;
      c.effect(s1, () => { runs++; });
      runs = 0;

      s1.post((v) => v);
      s1.post((v) => v + 1);
      await Promise.resolve();
      expect(s1.get()).toBe(1);
      expect(runs).toBe(1);
    });
  });
});
