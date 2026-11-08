import { describe, test, expect } from "#test-runner";
import { signal, root, batch, c, STABLE, SETUP, DEFER, DISPOSED, LOADING } from "#anod";
import { Action, Effect } from "#anod-internal";

describe("action", () => {
  test("a bound action runs with the dep's value and its args", () => {
    const s = signal(1);
    const seen = [];
    const args = { tag: "a" };
    c.action(s, (v, cx, a) => { seen.push([v, a]); }, void 0, args);
    s.set(2);
    expect(seen).toEqual([[1, args], [2, args]]);
  });

  test("an unbound action tracks its reads and drops the ones it stops making", () => {
    const flag = signal(true);
    const a = signal("a");
    const b = signal("b");
    const seen = [];
    c.action((cx) => { seen.push(cx.val(flag) ? cx.val(a) : cx.val(b)); });
    expect(seen).toEqual(["a"]);
    flag.set(false);
    expect(seen).toEqual(["a", "b"]);
    a.set("a2");
    expect(seen).toEqual(["a", "b"]);
    b.set("b2");
    expect(seen).toEqual(["a", "b", "b2"]);
  });

  test("an unbound action passes its args", () => {
    const s = signal(1);
    let got;
    c.action((cx, a) => { cx.val(s); got = a; }, void 0, 7);
    expect(got).toBe(7);
  });

  test("STABLE tracks the first run only", () => {
    const a = signal(1);
    const b = signal(10);
    let runs = 0;
    c.action((cx) => {
      runs++;
      cx.val(a);
      if (runs > 1) {
        cx.val(b);
      }
    }, STABLE);
    a.set(2);
    expect(runs).toBe(2);
    b.set(20);
    expect(runs).toBe(2);
  });

  test("SETUP on a bound action also tracks the first run's reads", () => {
    const s = signal(1);
    const other = signal("x");
    const seen = [];
    c.action(s, (v, cx) => { seen.push([v, cx.val(other)]); }, SETUP);
    other.set("y");
    expect(seen).toEqual([[1, "x"], [1, "y"]]);
  });

  test("DEFER skips a bound action's first run", () => {
    const s = signal(1);
    const seen = [];
    c.action(s, (v) => { seen.push(v); }, DEFER);
    expect(seen).toEqual([]);
    s.set(2);
    expect(seen).toEqual([2]);
  });

  test("it does not run when a compute it reads settles to the same value", () => {
    const s = signal(1);
    const parity = c.compute((cx) => cx.val(s) % 2);
    let runs = 0;
    c.action((cx) => { cx.val(parity); runs++; });
    s.set(3);
    expect(runs).toBe(1);
    s.set(4);
    expect(runs).toBe(2);
  });

  test("it runs once per batch", () => {
    const a = signal(1);
    const b = signal(2);
    let runs = 0;
    c.action((cx) => { cx.val(a); cx.val(b); runs++; });
    batch(() => {
      a.set(10);
      b.set(20);
    });
    expect(runs).toBe(2);
  });

  test("has 8 fields, about half an Effect's", () => {
    const s = signal(1);
    const a = c.action(s, () => { });
    const e = c.effect(s, () => { });
    expect(a instanceof Action).toBe(true);
    expect(Object.keys(a).length).toBe(8);
    expect(Object.keys(e).length).toBe(14);
  });

  test("has no ownership, cleanup or async methods", () => {
    let ctx;
    const a = c.action((cx) => { ctx = cx; });
    expect(ctx).toBe(a);
    for (const name of [
      "cleanup", "recover", "finalize", "panic", "pause", "resume", "shield",
      "suspend", "controller", "defer", "version",
      "compute", "task", "effect", "spawn", "action"
    ]) {
      expect(typeof a[name]).toBe("undefined");
    }
    for (const name of ["val", "pending", "rejected", "set", "post", "is", "dispose"]) {
      expect(typeof a[name]).toBe("function");
    }
  });

  test("dispose() stops it", () => {
    const s = signal(1);
    let runs = 0;
    const a = c.action(s, () => { runs++; });
    a.dispose();
    expect(a.is(DISPOSED)).toBe(true);
    s.set(2);
    expect(runs).toBe(1);
  });

  test("an action can dispose itself", () => {
    const s = signal(1);
    const seen = [];
    c.action(s, (v, cx) => {
      seen.push(v);
      if (v === 2) {
        cx.dispose();
      }
    });
    s.set(2);
    s.set(3);
    expect(seen).toEqual([1, 2]);
  });
});

describe("action ownership", () => {
  test("disposing the root disposes its actions", () => {
    const s = signal(1);
    let runs = 0;
    let a;
    const r = root((cx) => { a = cx.action(s, () => { runs++; }); });
    r.dispose();
    expect(a.is(DISPOSED)).toBe(true);
    s.set(2);
    expect(runs).toBe(1);
  });

  test("an effect's re-run disposes the actions its last run created", () => {
    const outer = signal(0);
    const inner = signal("x");
    const actions = [];
    const seen = [];
    c.effect(outer, (o, cx) => {
      actions.push(cx.action(inner, (v) => { seen.push([o, v]); }));
    });
    outer.set(1);
    expect(actions[0].is(DISPOSED)).toBe(true);
    expect(actions[1].is(DISPOSED)).toBe(false);
    inner.set("y");
    expect(seen).toEqual([[0, "x"], [1, "x"], [1, "y"]]);
  });

  test("pausing the root pauses its actions, and resume runs the missed change", () => {
    const s = signal(1);
    const seen = [];
    const r = root((cx) => { cx.action(s, (v) => { seen.push(v); }); });
    r.pause();
    s.set(2);
    s.set(3);
    expect(seen).toEqual([1]);
    r.resume();
    expect(seen).toEqual([1, 3]);
  });

  test("pausing an effect pauses the actions under it", () => {
    const s = signal(1);
    const seen = [];
    let e;
    root((cx) => {
      e = cx.effect((cx) => { cx.action(s, (v) => { seen.push(v); }); });
    });
    e.pause();
    s.set(2);
    expect(seen).toEqual([1]);
    e.resume();
    expect(seen).toEqual([1, 2]);
  });

  test("a disposal waiting on a shield freezes the actions under it", () => {
    const s = signal(1);
    const seen = [];
    let release;
    const r = root((cx) => {
      cx.spawn(async (cx) => {
        cx.shield();
        await cx.suspend(new Promise((res) => { release = res; }));
      });
      cx.action(s, (v) => { seen.push(v); });
    });
    r.dispose();
    s.set(2);
    expect(seen).toEqual([1]);
    release();
  });
});

describe("action errors", () => {
  test("a throw on the first run reaches the creator's recover", () => {
    let caught = null;
    root((cx) => {
      cx.recover((err) => {
        caught = err;
        return true;
      });
      cx.effect((cx) => {
        cx.action(() => { throw new Error("boom"); });
      });
    });
    expect(caught.error.message).toBe("boom");
  });

  test("an unhandled throw on the first run is thrown to the creator", () => {
    let thrown = null;
    try {
      c.action(() => { throw new Error("boom"); });
    } catch (err) {
      thrown = err;
    }
    expect(thrown.error.message).toBe("boom");
  });

  test("a throw on a re-run goes to the owner's recover, and disposes it", () => {
    const s = signal(1);
    let caught = null;
    let a;
    root((cx) => {
      cx.recover((err) => {
        caught = err;
        return true;
      });
      a = cx.action(s, (v) => {
        if (v === 2) {
          throw new Error("boom");
        }
      });
    });
    s.set(2);
    expect(caught.error.message).toBe("boom");
    expect(a.is(DISPOSED)).toBe(true);
  });

  test("the error bubbles past owners that decline it", () => {
    const s = signal(1);
    const calls = [];
    root((cx) => {
      cx.recover(() => {
        calls.push("root");
        return true;
      });
      cx.effect((cx) => {
        cx.recover(() => {
          calls.push("effect");
          return false;
        });
        cx.action(s, (v) => {
          if (v === 2) {
            throw new Error("boom");
          }
        });
      });
    });
    s.set(2);
    expect(calls).toEqual(["effect", "root"]);
  });

  test("an unhandled throw on a re-run disposes it and escapes the write", () => {
    const s = signal(1);
    const a = c.action(s, (v) => {
      if (v === 2) {
        throw new Error("boom");
      }
    });
    let thrown = null;
    try {
      s.set(2);
    } catch (err) {
      thrown = err;
    }
    expect(thrown.error.message).toBe("boom");
    expect(a.is(DISPOSED)).toBe(true);
  });

  test("a compute that throws reaches the recover of the action reading it", () => {
    const s = signal(1);
    const k = c.compute((cx) => {
      if (cx.val(s) === 2) {
        throw new Error("bad");
      }
      return cx.val(s);
    });
    const seen = [];
    let caught = null;
    let bound, unbound;
    root((cx) => {
      cx.recover((err) => {
        caught = err;
        return true;
      });
      bound = cx.action(k, (v) => { seen.push(v); });
      unbound = cx.action((cx) => { seen.push(cx.val(k)); });
    });
    s.set(2);
    expect(caught.error.message).toBe("bad");
    expect(bound.is(DISPOSED)).toBe(true);
    expect(unbound.is(DISPOSED)).toBe(true);
    expect(seen).toEqual([1, 1]);
  });

  test("rejected() reads an error without throwing", () => {
    const s = signal(1);
    const k = c.compute((cx) => {
      if (cx.val(s) === 2) {
        throw new Error("bad");
      }
      return cx.val(s);
    });
    const seen = [];
    c.action((cx) => {
      const err = cx.rejected(k);
      seen.push(err === null ? cx.val(k) : err.error.message);
    });
    s.set(2);
    s.set(3);
    expect(seen).toEqual([1, "bad", 3]);
  });
});

describe("action reads and writes", () => {
  test("pending() follows a task", async () => {
    let resolve;
    const t = c.task(async (cx) => cx.suspend(new Promise((r) => { resolve = r; })));
    const seen = [];
    c.action((cx) => { seen.push(cx.pending(t)); });
    expect(seen).toEqual([true]);
    expect(t.is(LOADING)).toBe(true);
    resolve(1);
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual([true, false]);
  });

  test("a task with waiters settles it once and adds no fields to it", async () => {
    let resolve;
    const t = c.task(async (cx) => cx.suspend(new Promise((r) => { resolve = r; })), 0);
    const seen = [];
    const a = c.action(t, (v) => { seen.push(v); });
    let waited;
    c.spawn(async (cx) => { waited = await cx.suspend(t); });
    resolve(5);
    await new Promise((r) => setTimeout(r, 0));
    expect(waited).toBe(5);
    expect(seen).toEqual([0, 5]);
    expect(Object.keys(a).length).toBe(8);
  });

  test("set() inside it is guarded: its own write does not re-run it", () => {
    const s = signal(1);
    const out = signal(0);
    let runs = 0;
    c.action((cx) => {
      runs++;
      cx.set(out, cx.val(s) * 10);
      cx.val(out);
    });
    expect(out.get()).toBe(10);
    s.set(2);
    expect(out.get()).toBe(20);
    expect(runs).toBe(2);
  });

  test("an action and an effect see the same updates in order", () => {
    const s = signal(1);
    const log = [];
    c.effect(s, (v) => { log.push(["effect", v]); });
    c.action(s, (v) => { log.push(["action", v]); });
    s.set(2);
    expect(log).toEqual([["effect", 1], ["action", 1], ["effect", 2], ["action", 2]]);
  });

  test("an action created on c is not owned by the effect it is created in", () => {
    const outer = signal(0);
    const s = signal("a");
    let a;
    c.effect(outer, (o, cx) => {
      if (o === 0) {
        a = c.action(s, () => { });
      }
    });
    outer.set(1);
    /** Created on c, not cx: nothing owns it. */
    expect(a.is(DISPOSED)).toBe(false);
    expect(a instanceof Effect).toBe(false);
  });
});
