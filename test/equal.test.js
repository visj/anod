import { describe, test, expect } from "#test-runner";
import { signal, root, c } from "#anod";

describe("c.equal()", () => {
  describe("c.equal() / c.equal(true) — suppress notification", () => {
    test("clamped value suppresses when result unchanged", () => {
      const s1 = signal(5);
      let runs = 0;
      const c1 = c.compute((cx, prev) => {
        let val = cx.val(s1);
        let clamped = Math.min(val, 10);
        /** Tell anod: treat as equal if clamped didn't change. */
        cx.equal(clamped === prev);
        return clamped;
      }, 5);
      c.effect(c1, () => { runs++; });
      expect(runs).toBe(1);
      expect(c1.get()).toBe(5);

      /** 5 → 8: clamped changes → effect runs. */
      s1.set(8);
      expect(c1.get()).toBe(8);
      expect(runs).toBe(2);

      /** 8 → 15: clamped becomes 10, different from 8 → runs. */
      s1.set(15);
      expect(c1.get()).toBe(10);
      expect(runs).toBe(3);

      /** 15 → 20: clamped stays 10, equal(true) → suppressed. */
      s1.set(20);
      expect(c1.get()).toBe(10);
      expect(runs).toBe(3);

      /** 20 → 3: clamped becomes 3, different → runs. */
      s1.set(3);
      expect(c1.get()).toBe(3);
      expect(runs).toBe(4);
    });

    test("c.equal() with no argument defaults to true (always suppress)", () => {
      const s1 = signal(1);
      let runs = 0;
      const c1 = c.compute((cx) => {
        let val = cx.val(s1);
        /** Always declare equal — downstream never re-runs. */
        cx.equal();
        return val;
      });
      c.effect(c1, () => { runs++; });
      expect(runs).toBe(1);

      s1.set(2);
      expect(c1.get()).toBe(2);
      /** Effect did NOT re-run: equal() suppressed notification. */
      expect(runs).toBe(1);

      s1.set(3);
      expect(c1.get()).toBe(3);
      expect(runs).toBe(1);
    });

    test("deep equality via user comparison", () => {
      const s1 = signal({ x: 1, y: 2 });
      let runs = 0;
      const c1 = c.compute((cx, prev) => {
        let obj = cx.val(s1);
        if (prev !== undefined) {
          cx.equal(prev.x === obj.x && prev.y === obj.y);
        }
        return obj;
      });
      c.effect(c1, () => { runs++; });
      expect(runs).toBe(1);

      /** Same shape, different reference → equal(true) suppresses. */
      s1.set({ x: 1, y: 2 });
      c1.get();
      expect(runs).toBe(1);

      /** Different shape → equal(false) → effect runs. */
      s1.set({ x: 1, y: 3 });
      c1.get();
      expect(runs).toBe(2);
    });

    test("bound compute with equal suppression", () => {
      const s1 = signal(5);
      let runs = 0;
      const c1 = c.compute(s1, (val, cx, prev) => {
        let clamped = Math.min(val, 10);
        cx.equal(clamped === prev);
        return clamped;
      }, 5);
      c.effect(c1, () => { runs++; });
      expect(runs).toBe(1);

      s1.set(15);
      expect(c1.get()).toBe(10);
      expect(runs).toBe(2);

      /** Stays clamped at 10 → suppressed. */
      s1.set(20);
      expect(c1.get()).toBe(10);
      expect(runs).toBe(2);
    });
  });

  describe("c.equal(false) — force notification", () => {
    test("forces downstream update even when value is the same", () => {
      const s1 = signal(1);
      let runs = 0;
      const c1 = c.compute((cx) => {
        cx.val(s1);
        /** Always force — downstream re-runs on every evaluation. */
        cx.equal(false);
        return 42;
      });
      c.effect(c1, () => { runs++; });
      expect(runs).toBe(1);

      /** Value stays 42 but equal(false) forces notification. */
      s1.set(2);
      expect(c1.get()).toBe(42);
      expect(runs).toBe(2);

      s1.set(3);
      expect(c1.get()).toBe(42);
      expect(runs).toBe(3);
    });
  });

  describe("equal is per-run", () => {
    test("equal flag is cleared between runs", () => {
      const s1 = signal(1);
      let runs = 0;
      const c1 = c.compute((cx, prev) => {
        let val = cx.val(s1);
        /** Only suppress when value is even. */
        if (val % 2 === 0) {
          cx.equal();
        }
        return val;
      });
      c.effect(c1, () => { runs++; });
      expect(runs).toBe(1);

      /** 1 → 2: even, equal() called → suppressed. */
      s1.set(2);
      expect(c1.get()).toBe(2);
      expect(runs).toBe(1);

      /** 2 → 3: odd, no equal() → notifies. */
      s1.set(3);
      expect(c1.get()).toBe(3);
      expect(runs).toBe(2);

      /** 3 → 4: even, equal() called → suppressed. */
      s1.set(4);
      expect(c1.get()).toBe(4);
      expect(runs).toBe(2);
    });
  });
});
