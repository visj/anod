import { describe, test, expect } from "#test-runner";
import { signal, batch, c } from "#anod";

describe("Signal.set", () => {
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

  describe("writes inside a run", () => {
    test("set from inside effect schedules to drain queue", () => {
      const s1 = signal(0);
      const s2 = signal(100);
      let observed = [];

      /** This effect reads both signals. It must see a consistent
       *  snapshot within each run — s2 should not change mid-cycle. */
      c.effect((cx) => {
        observed.push(cx.val(s1) + ":" + cx.val(s2));
      });

      /** This effect writes to s2 when s1 changes. */
      c.effect(s1, (v) => {
        if (v > 0) {
          s2.set(200);
        }
      });

      s1.set(1);
      /** First run: both effects see s1=1, s2=100.
       *  The set schedules s2=200 for the next drain cycle.
       *  Second run: first effect re-runs with s2=200. */
      expect(observed).toEqual(["0:100", "1:100", "1:200"]);
    });
  });

  describe("queued writes", () => {
    test("inside batch, updaters run in queue order", () => {
      const s1 = signal(0);
      batch(() => {
        s1.set((v) => v + 1);
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
    });

    test("an unchanged write does not hide a later change from subscribers", () => {
      const s1 = signal(0);
      let runs = 0;
      c.effect(s1, () => { runs++; });
      runs = 0;

      batch(() => {
        s1.set((v) => v);
        s1.set((v) => v + 1);
      });
      expect(s1.get()).toBe(1);
      expect(runs).toBe(1);
    });
  });
});
