import { describe, test, expect } from "#test-runner";
import { signal, root } from "#anod";

let c; root((_c) => { c = _c; });

describe("signal.notify()", () => {
  test("notifies subscribers without changing the value", () => {
    const obj = { x: 1 };
    const s = signal(obj);
    let runs = 0;
    c.effect(s, () => { runs++; });
    expect(runs).toBe(1);

    /** Mutate in place, then notify. */
    obj.x = 2;
    s.notify();
    expect(runs).toBe(2);
    expect(s.get().x).toBe(2);
  });

  test("notify from inside effect schedules to drain queue", () => {
    const s1 = signal(0);
    const s2 = signal({ count: 0 });
    let observed = [];

    c.effect((cx) => {
      observed.push(cx.val(s2).count);
    });

    /** Another effect mutates s2 when s1 changes. */
    c.effect(s1, (val) => {
      if (val > 0) {
        s2.get().count++;
        s2.notify();
      }
    });

    expect(observed).toEqual([0]);
    s1.set(1);
    expect(observed).toEqual([0, 1]);
    s1.set(2);
    expect(observed).toEqual([0, 1, 2]);
  });

  test("notify on compute triggers downstream", () => {
    const s1 = signal(1);
    const c1 = c.compute((cx) => {
      return { value: cx.val(s1) };
    });
    let runs = 0;
    c.effect(c1, () => { runs++; });
    expect(runs).toBe(1);

    /** Notify manually — downstream re-evaluates. */
    c1.notify();
    expect(runs).toBe(2);
  });

  test("notify on disposed signal throws", () => {
    const s = signal(1);
    s.dispose();
    expect(() => s.notify()).toThrow();
  });
});
