import { describe, test, expect } from "#test-runner";
import { signal, root, batch } from "#anod";

let c; root((_c) => { c = _c; });

describe("pause / resume", () => {
  test("paused effect does not re-run", () => {
    const s = signal(1);
    let runs = 0;
    const e = c.effect(s, () => { runs++; });
    expect(runs).toBe(1);

    e.pause();
    s.set(2);
    s.set(3);
    expect(runs).toBe(1);

    e.resume();
    expect(runs).toBe(2);
  });

  test("paused root pauses all owned children", () => {
    let runs = 0;
    const s = signal(1);
    const r = root((c) => {
      c.effect(s, () => { runs++; });
    });
    expect(runs).toBe(1);

    r.pause();
    s.set(2);
    s.set(3);
    expect(runs).toBe(1);

    r.resume();
    expect(runs).toBe(2);
  });

  test("effect with owned child effects: pause propagates", () => {
    const s1 = signal(1);
    const s2 = signal("a");
    let outerRuns = 0;
    let innerRuns = 0;

    const outer = c.effect(s1, (_, c) => {
      outerRuns++;
      c.effect(s2, () => { innerRuns++; });
    });
    expect(outerRuns).toBe(1);
    expect(innerRuns).toBe(1);

    outer.pause();
    s2.set("b");
    /** Inner effect is also paused, doesn't re-run. */
    expect(innerRuns).toBe(1);

    outer.resume();
    /** Outer doesn't need update (s1 unchanged), walks children.
     *  Inner needs update (s2 changed), gets enqueued. */
    expect(innerRuns).toBe(2);
  });

  test("effect that needs update on resume: re-runs and rebuilds subtree", () => {
    const s1 = signal(1);
    const s2 = signal("a");
    let outerRuns = 0;
    let innerRuns = 0;
    let disposed = 0;

    const outer = c.effect(s1, (_, c) => {
      outerRuns++;
      c.cleanup(() => { disposed++; });
      c.effect(s2, () => { innerRuns++; });
    });
    expect(outerRuns).toBe(1);
    expect(innerRuns).toBe(1);

    outer.pause();
    s1.set(2);
    s2.set("b");
    expect(outerRuns).toBe(1);
    expect(innerRuns).toBe(1);

    outer.resume();
    /** Outer needs update (s1 changed), so it re-runs.
     *  This disposes old children and creates new ones. */
    expect(outerRuns).toBe(2);
    expect(disposed).toBe(1);
    expect(innerRuns).toBe(2);
  });

  test("effect that does not need update: walks children", () => {
    const s1 = signal(1);
    const s2 = signal("a");
    let outerRuns = 0;
    let innerRuns = 0;

    const outer = c.effect(s1, (_, c) => {
      outerRuns++;
      c.effect(s2, () => { innerRuns++; });
    });
    expect(outerRuns).toBe(1);
    expect(innerRuns).toBe(1);

    outer.pause();
    /** Only s2 changes, so outer doesn't need update. */
    s2.set("b");

    outer.resume();
    expect(outerRuns).toBe(1);
    expect(innerRuns).toBe(2);
  });

  test("multiple resume() inside batch: single flush", () => {
    const s1 = signal(0);
    const s2 = signal(0);
    let runs1 = 0;
    let runs2 = 0;

    const r1 = root((c) => {
      c.effect(s1, () => { runs1++; });
    });
    const r2 = root((c) => {
      c.effect(s2, () => { runs2++; });
    });
    expect(runs1).toBe(1);
    expect(runs2).toBe(1);

    r1.pause();
    r2.pause();
    s1.set(1);
    s2.set(1);
    expect(runs1).toBe(1);
    expect(runs2).toBe(1);

    batch(() => {
      r1.resume();
      r2.resume();
    });
    expect(runs1).toBe(2);
    expect(runs2).toBe(2);
  });

  test("resume() on non-paused node is a no-op", () => {
    const s = signal(1);
    let runs = 0;
    const e = c.effect(s, () => { runs++; });
    expect(runs).toBe(1);

    /** Should not throw or double-run. */
    e.resume();
    expect(runs).toBe(1);
  });

  test("pause then dispose: disposed takes priority", () => {
    const s = signal(1);
    let runs = 0;
    const e = c.effect(s, () => { runs++; });
    expect(runs).toBe(1);

    e.pause();
    e.dispose();
    s.set(2);
    /** resume on a disposed node is a no-op. */
    e.resume();
    expect(runs).toBe(1);
  });

  test("deeply nested owner tree: pause/resume propagates", () => {
    const s = signal(0);
    let deepRuns = 0;

    const r = root((c) => {
      c.effect((c) => {
        c.effect((c) => {
          c.effect(s, () => { deepRuns++; });
        });
      });
    });
    expect(deepRuns).toBe(1);

    r.pause();
    s.set(1);
    expect(deepRuns).toBe(1);

    r.resume();
    expect(deepRuns).toBe(2);
  });

  test("pause is idempotent", () => {
    const s = signal(1);
    let runs = 0;
    const e = c.effect(s, () => { runs++; });
    expect(runs).toBe(1);

    e.pause();
    e.pause();
    s.set(2);
    expect(runs).toBe(1);

    e.resume();
    expect(runs).toBe(2);
  });

  test("owned computes are not paused, still recompute on read", () => {
    const s = signal(1);
    let computeRuns = 0;
    const r = root((c) => {
      const doubled = c.compute(s, (val) => {
        computeRuns++;
        return val * 2;
      });
      c.effect(doubled, () => {});
    });
    expect(computeRuns).toBe(1);

    r.pause();
    s.set(5);
    /** Compute is pull-based, not paused — it can still be read. */
    expect(computeRuns).toBe(1);

    r.resume();
    /** The effect resumes and pulls the compute, which recomputes. */
    expect(computeRuns).toBe(2);
  });
});
