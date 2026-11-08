import { describe, test, expect } from "#test-runner";
import { signal, root, c } from "#anod";

describe("signal(value, false)", () => {
  test("always notifies on set even when value is the same", () => {
    const r = signal(1, false);
    let runs = 0;
    c.effect(r, () => { runs++; });
    expect(runs).toBe(1);

    r.set(1);
    expect(runs).toBe(2);

    r.set(1);
    expect(runs).toBe(3);
  });

  test("normal signal does not notify when value is the same", () => {
    const s = signal(1);
    let runs = 0;
    c.effect(s, () => { runs++; });
    expect(runs).toBe(1);

    s.set(1);
    expect(runs).toBe(1);
  });

  test("notifies when an object is mutated in place", () => {
    const items = signal([], false);
    let observed = [];
    c.effect(items, (val) => {
      observed.push(val.length);
    });
    expect(observed).toEqual([0]);

    let arr = items.get();
    arr.push("a");
    items.set(arr);
    expect(observed).toEqual([0, 1]);

    arr.push("b");
    items.set(arr);
    expect(observed).toEqual([0, 1, 2]);
  });

  test("notifies when an updater returns the same value", () => {
    const r = signal(0, false);
    let runs = 0;
    c.effect(r, () => { runs++; });
    expect(runs).toBe(1);

    r.set((prev) => prev);
    expect(runs).toBe(2);
  });

  test("updater returning void keeps value and still notifies", () => {
    const obj = { x: 1, y: 2 };
    const m = signal(obj, false);
    let runs = 0;
    let lastVal;
    c.effect(m, (val) => {
      runs++;
      lastVal = val;
    });
    expect(runs).toBe(1);
    expect(lastVal).toBe(obj);

    m.set((o) => {
      o.x = 42;
    });
    expect(runs).toBe(2);
    expect(lastVal).toBe(obj);
    expect(lastVal.x).toBe(42);
    expect(m.get()).toBe(obj);
  });

  test("void updater works inside batch (scheduled path)", () => {
    const obj = { a: 1 };
    const m = signal(obj, false);
    let runs = 0;
    c.effect(m, () => { runs++; });
    expect(runs).toBe(1);

    const s = signal(0);
    /** Effect creation runs the body once, triggering m.set → runs=2. */
    c.effect(s, () => {
      m.set((o) => {
        o.a = 99;
      });
    });
    expect(runs).toBe(2);

    /** s.set triggers the effect again → m.set → runs=3. */
    s.set(1);
    expect(runs).toBe(3);
    expect(m.get()).toBe(obj);
    expect(m.get().a).toBe(99);
  });

  test("regular signal updater returning undefined sets value to undefined", () => {
    const s = signal(1);
    s.set(() => undefined);
    expect(s.get()).toBe(undefined);
  });

  test("post() of the same value notifies", async () => {
    const r = signal(1, false);
    let runs = 0;
    c.effect(r, () => { runs++; });
    expect(runs).toBe(1);

    r.post(1);
    await Promise.resolve();
    expect(runs).toBe(2);
  });

  test("same value inside batch always schedules", () => {
    const r = signal(5, false);
    let observed = [];
    c.effect(r, (v) => { observed.push(v); });
    expect(observed).toEqual([5]);

    const s = signal(0);
    c.effect(s, () => {
      r.set(5);
    });

    s.set(1);
    expect(observed.length).toBeGreaterThan(1);
    expect(observed[observed.length - 1]).toBe(5);
  });

  test("propagates through compute chain", () => {
    const r = signal(1, false);
    const c1 = c.compute(r, (val) => val * 10);
    expect(c1.get()).toBe(10);

    r.set(1);
    expect(c1.get()).toBe(10);
  });

  test("get() returns the value", () => {
    const r = signal({ x: 1 }, false);
    expect(r.get().x).toBe(1);
  });
});
