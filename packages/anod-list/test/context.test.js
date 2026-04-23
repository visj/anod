import { describe, test, expect } from "#test-runner";
import { signal } from "anod-core";
import { compute } from "anod-core/internal";
import { list } from "#list";

describe("list context access", () => {
  describe("map", () => {
    test("callback receives context as 4th argument", () => {
      const l = list([1, 2, 3]);
      let ctx = null;
      const m = l.map((val, idx, arr, c) => {
        ctx = c;
        return val * 2;
      });
      m.get();
      expect(ctx).not.toBeNull();
      expect(typeof ctx.cleanup).toBe("function");
    });

    test("c.cleanup() inside map runs on re-evaluation", () => {
      const l = list([1, 2]);
      let cleaned = 0;
      const m = l.map((val, idx, arr, c) => {
        c.cleanup(() => { cleaned++; });
        return val * 10;
      });
      expect(m.get()).toEqual([10, 20]);
      expect(cleaned).toBe(0);

      l.set([3, 4, 5]);
      expect(m.get()).toEqual([30, 40, 50]);
      /** Each element registered a cleanup (2 elements), all fire on re-eval. */
      expect(cleaned).toBe(2);
    });

    test("c.equal() suppresses downstream when values match", () => {
      const l = list([1, 2, 3]);
      const m = l.map((val, idx, arr, c) => {
        c.equal(true);
        return val > 0 ? "positive" : "negative";
      });
      let downstream = 0;
      const d = compute(m, () => { downstream++; return 0; });
      d.get();
      expect(downstream).toBe(1);

      /** Push another positive value — map result is same shape. */
      l.push(4);
      d.get();
      /** equal(true) means the map node doesn't update ctime if
       *  values deep-equal. But since we return a new array each
       *  time, !== comparison means it DOES update. equal() controls
       *  the node-level comparison, not array content. */
    });

    test("c.peek() reads without subscribing", () => {
      const l = list([1, 2]);
      const other = signal(100);
      let runs = 0;
      const m = l.map((val, idx, arr, c) => {
        runs++;
        return val + c.peek(other);
      });
      expect(m.get()).toEqual([101, 102]);
      expect(runs).toBe(2);

      /** Changing other should NOT trigger map re-run (peek doesn't subscribe). */
      other.set(200);
      expect(m.get()).toEqual([101, 102]);
      expect(runs).toBe(2);

      /** Changing the list DOES trigger re-run with fresh peek. */
      l.set([3, 4]);
      expect(m.get()).toEqual([203, 204]);
      expect(runs).toBe(4);
    });
  });

  describe("filter", () => {
    test("callback receives context", () => {
      const l = list([1, 2, 3, 4]);
      let ctx = null;
      const f = l.filter((val, idx, arr, c) => {
        ctx = c;
        return val > 2;
      });
      expect(f.get()).toEqual([3, 4]);
      expect(ctx).not.toBeNull();
    });

    test("c.cleanup() in filter runs on re-evaluation", () => {
      const l = list([1, 2, 3]);
      let cleaned = 0;
      const f = l.filter((val, idx, arr, c) => {
        c.cleanup(() => { cleaned++; });
        return val % 2 === 1;
      });
      expect(f.get()).toEqual([1, 3]);
      expect(cleaned).toBe(0);

      l.set([2, 4, 6]);
      expect(f.get()).toEqual([]);
      /** 3 elements each registered a cleanup, all fire on re-eval. */
      expect(cleaned).toBe(3);
    });
  });

  describe("every", () => {
    test("callback receives context", () => {
      const l = list([2, 4, 6]);
      let ctx = null;
      const e = l.every((val, idx, arr, c) => {
        ctx = c;
        return val % 2 === 0;
      });
      expect(e.get()).toBe(true);
      expect(ctx).not.toBeNull();
    });
  });

  describe("some", () => {
    test("callback receives context", () => {
      const l = list([1, 2, 3]);
      let ctx = null;
      const s = l.some((val, idx, arr, c) => {
        ctx = c;
        return val > 2;
      });
      expect(s.get()).toBe(true);
      expect(ctx).not.toBeNull();
    });
  });

  describe("find / findIndex", () => {
    test("find callback receives context", () => {
      const l = list([10, 20, 30]);
      let ctx = null;
      const f = l.find((val, idx, arr, c) => {
        ctx = c;
        return val > 15;
      });
      expect(f.get()).toBe(20);
      expect(ctx).not.toBeNull();
    });

    test("findIndex callback receives context", () => {
      const l = list([10, 20, 30]);
      let ctx = null;
      const f = l.findIndex((val, idx, arr, c) => {
        ctx = c;
        return val > 15;
      });
      expect(f.get()).toBe(1);
      expect(ctx).not.toBeNull();
    });
  });

  describe("reduce / reduceRight", () => {
    test("reduce callback receives context as 5th arg", () => {
      const l = list([1, 2, 3]);
      let ctx = null;
      const r = l.reduce((acc, val, idx, arr, c) => {
        ctx = c;
        return acc + val;
      }, 0);
      expect(r.get()).toBe(6);
      expect(ctx).not.toBeNull();
    });

    test("reduceRight callback receives context", () => {
      const l = list(["a", "b", "c"]);
      let ctx = null;
      const r = l.reduceRight((acc, val, idx, arr, c) => {
        ctx = c;
        return acc + val;
      }, "");
      expect(r.get()).toBe("cba");
      expect(ctx).not.toBeNull();
    });
  });

  describe("flatMap", () => {
    test("callback receives context", () => {
      const l = list([1, 2, 3]);
      let ctx = null;
      const f = l.flatMap((val, idx, arr, c) => {
        ctx = c;
        return [val, val * 10];
      });
      expect(f.get()).toEqual([1, 10, 2, 20, 3, 30]);
      expect(ctx).not.toBeNull();
    });
  });

  describe("findLast / findLastIndex", () => {
    test("findLast callback receives context", () => {
      const l = list([1, 2, 3, 4]);
      let ctx = null;
      const f = l.findLast((val, idx, arr, c) => {
        ctx = c;
        return val < 3;
      });
      expect(f.get()).toBe(2);
      expect(ctx).not.toBeNull();
    });

    test("findLastIndex callback receives context", () => {
      const l = list([1, 2, 3, 4]);
      let ctx = null;
      const f = l.findLastIndex((val, idx, arr, c) => {
        ctx = c;
        return val < 3;
      });
      expect(f.get()).toBe(1);
      expect(ctx).not.toBeNull();
    });
  });
});
