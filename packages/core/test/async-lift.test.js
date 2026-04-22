import { describe, test, expect } from "#test-runner";
import { c, OPT_STABLE } from "#fyren";

const tick = () => Promise.resolve();
const settle = () => tick().then(tick).then(tick);

describe("c.async()", () => {
  describe("unbound compute", () => {
    test("lifts sync compute to async with immediate c.async()", async () => {
      const s1 = c.signal(1);
      const c1 = c.compute((c) => {
        c.async();
        let val = c.val(s1);
        return c.suspend(Promise.resolve(val * 10));
      });

      expect(c1.loading).toBe(true);
      await settle();
      expect(c1.get()).toBe(10);

      /** Pull to trigger re-run, then await settle for promise. */
      s1.set(2);
      c1.get();
      await settle();
      expect(c1.get()).toBe(20);
    });

    test("conditional async: runs sync first, lifts to async later", async () => {
      const toggle = c.signal(false);
      const s1 = c.signal(1);
      const c1 = c.compute((c) => {
        let isAsync = c.val(toggle);
        let val = c.val(s1);
        if (isAsync) {
          c.async();
          return c.suspend(Promise.resolve(val * 100));
        }
        return val * 10;
      });

      /** First run: sync path. */
      expect(c1.get()).toBe(10);
      expect(c1.loading).toBe(false);

      /** Lift to async. */
      toggle.set(true);
      c1.get();
      expect(c1.loading).toBe(true);
      await settle();
      expect(c1.get()).toBe(100);

      /** Stays async on subsequent updates. */
      s1.set(2);
      c1.get();
      await settle();
      expect(c1.get()).toBe(200);
    });
  });

  describe("bound compute", () => {
    test("lifts bound compute to async", async () => {
      const s1 = c.signal(1);
      const c1 = c.compute(s1, (val, c) => {
        c.async();
        return c.suspend(Promise.resolve(val * 10));
      });

      expect(c1.loading).toBe(true);
      await settle();
      expect(c1.get()).toBe(10);

      s1.set(3);
      c1.get();
      await settle();
      expect(c1.get()).toBe(30);
    });
  });

  describe("stable node", () => {
    test("lifts stable compute to async", async () => {
      const s1 = c.signal(1);
      const c1 = c.compute(s1, (val, c) => {
        c.async();
        return c.suspend(Promise.resolve(val * 10));
      }, undefined, OPT_STABLE);

      expect(c1.loading).toBe(true);
      await settle();
      expect(c1.get()).toBe(10);

      s1.set(5);
      c1.get();
      await settle();
      expect(c1.get()).toBe(50);
    });
  });

  describe("with lock", () => {
    test("c.async() + c.lock() prevents mid-flight cancellation", async () => {
      const s1 = c.signal([1, 2, 3]);
      let results = [];
      let runs = 0;

      c.effect((c) => {
        runs++;
        let arr = c.val(s1);
        c.async();
        c.lock();
        return (async () => {
          for (let i = 0; i < arr.length; i++) {
            await c.suspend(tick());
            results.push(arr[i]);
          }
        })();
      });

      await settle();
      expect(runs).toBe(1);
      expect(results).toEqual([1, 2, 3]);

      results = [];
      s1.set([4, 5]);
      await settle();
      expect(runs).toBe(2);
      expect(results).toEqual([4, 5]);
    });
  });

  describe("downstream reactivity", () => {
    test("downstream compute reacts to async-lifted node", async () => {
      const s1 = c.signal(1);
      const c1 = c.compute((c) => {
        c.async();
        return c.suspend(Promise.resolve(c.val(s1) * 10));
      }, 0);

      const c2 = c.compute(c1, (val) => val + 1);

      expect(c2.get()).toBe(1);
      await settle();
      expect(c2.get()).toBe(11);

      s1.set(2);
      c2.get();
      await settle();
      expect(c2.get()).toBe(21);
    });
  });

  describe("effect", () => {
    test("lifts sync effect to async with c.async()", async () => {
      const s1 = c.signal(1);
      let observed = [];

      c.effect((c) => {
        let val = c.val(s1);
        c.async();
        return (async () => {
          await c.suspend(tick());
          observed.push(val);
        })();
      });

      await settle();
      expect(observed).toEqual([1]);

      s1.set(2);
      await settle();
      expect(observed).toEqual([1, 2]);
    });
  });
});
