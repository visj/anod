import { describe, test, expect } from "#test-runner";
import { signal, relay, root } from "#anod";

let c; root((_c) => { c = _c; });

describe("relay", () => {
  test("always notifies on set even when value is the same", () => {
    const r = relay(1);
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

  test("relay notifies with mutable object", () => {
    const items = relay([]);
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

  test("relay works with updater function", () => {
    const r = relay(0);
    let runs = 0;
    c.effect(r, () => { runs++; });
    expect(runs).toBe(1);

    r.set((prev) => prev);
    expect(runs).toBe(2);
  });

  test("relay works with post()", async () => {
    const r = relay(1);
    let runs = 0;
    c.effect(r, () => { runs++; });
    expect(runs).toBe(1);

    r.post(1);
    await Promise.resolve();
    expect(runs).toBe(2);
  });

  test("relay inside batch always schedules", () => {
    const r = relay(5);
    let observed = [];
    c.effect(r, (v) => { observed.push(v); });
    expect(observed).toEqual([5]);

    /** Normal signal would not schedule when value is the same.
     *  Relay should still schedule and notify. */
    const s = signal(0);
    c.effect(s, () => {
      r.set(5);
    });

    s.set(1);
    /** Relay effect re-ran with same value. */
    expect(observed.length).toBeGreaterThan(1);
    expect(observed[observed.length - 1]).toBe(5);
  });

  test("relay propagates through compute chain", () => {
    const r = relay(1);
    const c1 = c.compute(r, (val) => val * 10);
    expect(c1.get()).toBe(10);

    /** Same value but relay always notifies — compute re-runs. */
    r.set(1);
    expect(c1.get()).toBe(10);
  });

  test("relay get() returns the value", () => {
    const r = relay({ x: 1 });
    expect(r.get().x).toBe(1);
  });

  test("relay dispose works", () => {
    const r = relay(1);
    r.dispose();
    expect(r.disposed).toBe(true);
    expect(() => r.set(2)).toThrow();
  });
});
