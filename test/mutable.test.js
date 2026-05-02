import { describe, test, expect } from "#test-runner";
import { signal, mutable, root, c } from "#anod";

describe("mutable", () => {
  test("always notifies on set even when value is the same", () => {
    const r = mutable(1);
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

  test("mutable notifies with mutable object", () => {
    const items = mutable([]);
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

  test("mutable works with updater function", () => {
    const r = mutable(0);
    let runs = 0;
    c.effect(r, () => { runs++; });
    expect(runs).toBe(1);

    r.set((prev) => prev);
    expect(runs).toBe(2);
  });

  test("mutable updater returning void keeps value and still notifies", () => {
    const obj = { x: 1, y: 2 };
    const m = mutable(obj);
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

  test("mutable void updater works inside batch (scheduled path)", () => {
    const obj = { a: 1 };
    const m = mutable(obj);
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

  test("mutable works with post()", async () => {
    const r = mutable(1);
    let runs = 0;
    c.effect(r, () => { runs++; });
    expect(runs).toBe(1);

    r.post(1);
    await Promise.resolve();
    expect(runs).toBe(2);
  });

  test("mutable inside batch always schedules", () => {
    const r = mutable(5);
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

  test("mutable propagates through compute chain", () => {
    const r = mutable(1);
    const c1 = c.compute(r, (val) => val * 10);
    expect(c1.get()).toBe(10);

    r.set(1);
    expect(c1.get()).toBe(10);
  });

  test("mutable get() returns the value", () => {
    const r = mutable({ x: 1 });
    expect(r.get().x).toBe(1);
  });

  test("mutable dispose works", () => {
    const r = mutable(1);
    r.dispose();
    expect(r.disposed).toBe(true);
    expect(() => r.set(2)).toThrow();
  });
});
