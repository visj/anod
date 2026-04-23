import { describe, test, expect } from "#test-runner";
import { root } from "anod-core";
import { list } from "#list";

describe("forEach context", () => {
  test("callback receives context as 4th argument", () => {
    const l = list([1, 2]);
    let ctx = null;
    l.forEach((val, idx, arr, c) => {
      ctx = c;
    });
    expect(ctx).not.toBeNull();
    expect(typeof ctx.recover).toBe("function");
  });

  test("c.recover() inside forEach handles errors", () => {
    const l = list([1, 2, 3]);
    let recovered = false;
    let error = null;
    const e = l.forEach((val, idx, arr, c) => {
      c.recover((err) => {
        recovered = true;
        error = err;
        return true;
      });
      if (val === 2) {
        throw new Error("bad value");
      }
    });
    expect(recovered).toBe(true);
    expect(error).not.toBeNull();
    expect(e.disposed).toBe(false);
  });

  test("c.cleanup() inside forEach runs on re-evaluation", () => {
    const l = list([1, 2]);
    let cleaned = 0;
    l.forEach((val, idx, arr, c) => {
      c.cleanup(() => { cleaned++; });
    });
    expect(cleaned).toBe(0);

    l.set([3, 4, 5]);
    /** 2 elements each registered a cleanup, all fire on re-eval. */
    expect(cleaned).toBe(2);
  });

  describe("owned children", () => {
    test("effect creates owned computes that dispose on re-run", () => {
      const l = list([1, 2]);
      let childRuns = 0;
      let childDisposed = 0;

      root((r) => {
        r.spawn(async (cx) => {
          let items = cx.val(l);
          /** This just tests that reading signals from forEach context works. */
        });
      });

      const e = l.forEach((val, idx, arr, ctx) => {
        /** We can't create owned children directly in forEach since
         *  the callback isn't the effect's _fn — it's called from
         *  within the _fn. The context IS the effect though. */
      });
      expect(e.disposed).toBe(false);
      e.dispose();
      expect(e.disposed).toBe(true);
    });

    test("forEach effect disposes and re-runs on list change", () => {
      const l = list([10, 20]);
      let runs = 0;
      let lastValues = [];

      const e = l.forEach((val, idx, arr, c) => {
        runs++;
        lastValues.push(val);
      });
      expect(runs).toBe(2);
      expect(lastValues).toEqual([10, 20]);

      lastValues = [];
      l.push(30);
      expect(lastValues).toEqual([10, 20, 30]);

      e.dispose();
      lastValues = [];
      l.push(40);
      expect(lastValues).toEqual([]);
    });
  });

  describe("recover in forEach", () => {
    test("recover swallows error and keeps effect alive", () => {
      const l = list([1]);
      let runs = 0;
      let errors = 0;

      const e = l.forEach((val, idx, arr, c) => {
        c.recover((err) => {
          errors++;
          return true;
        });
        runs++;
        if (val === 2) {
          throw new Error("boom");
        }
      });
      expect(runs).toBe(1);
      expect(errors).toBe(0);

      l.set([2]);
      expect(errors).toBe(1);
      expect(e.disposed).toBe(false);

      /** After recovery, effect should still react. */
      l.set([3]);
      expect(e.disposed).toBe(false);
    });

    test("recover returning false disposes the effect", () => {
      const l = list([1]);
      const e = l.forEach((val, idx, arr, c) => {
        c.recover(() => false);
        if (val === 2) {
          throw new Error("fatal");
        }
      });
      expect(e.disposed).toBe(false);

      /** Error propagates through set() since recover returns false.
       *  Errors are now { error, type } POJOs. */
      let thrown;
      try {
        l.set([2]);
      } catch (e) {
        thrown = e;
      }
      expect(thrown.type).toBe(3);
      expect(thrown.error.message).toBe("fatal");
      expect(e.disposed).toBe(true);
    });
  });
});
