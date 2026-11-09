import { describe, test, expect } from "#test-runner";
import { signal, root, c, FLAG_VISIT } from "../src/internal.js";

/**
 * FLAG_VISIT is a scratch mark: every pass that sets it clears it again
 * before it returns. A mark left behind would make a later pass skip
 * the node. These run against the source, where _flag is readable.
 */

/** @returns {Promise<void>} */
function tick() {
  return new Promise((r) => setTimeout(r, 0));
}

/** @returns {{ promise: Promise<*>, resolve: function(*): void }} */
function later() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

function marked(nodes) {
  return nodes.filter((node) => (node._flag & FLAG_VISIT) !== 0);
}

describe("FLAG_VISIT", () => {
  test("a task settling to subscribers and waiters leaves no mark", async () => {
    const gate = later();
    const s = signal(1);
    const t = c.task(async (cx) => cx.val(s) + (await cx.suspend(gate.promise)), 0);
    const nodes = [s, t];
    const seen = [];
    root((cx) => {
      nodes.push(cx.effect(t, (v) => { seen.push(v); }));
      nodes.push(cx.action(t, (v) => { seen.push(v); }));
      nodes.push(cx.compute((cx) => cx.val(t) * 2));
      /** A waiter only, and one that is a subscriber too. */
      nodes.push(cx.spawn(async (cx) => { seen.push(await cx.suspend(t)); }));
      nodes.push(cx.spawn(async (cx) => {
        cx.val(s);
        seen.push(await cx.suspend(t));
        cx.val(t);
      }));
      nodes.push(cx.task(async (cx) => (await cx.suspend(t)) + 1, 0));
    });
    gate.resolve(10);
    await tick();
    expect(seen.length).toBeGreaterThan(0);
    expect(marked(nodes)).toEqual([]);
  });

  test("a quiet settle leaves no mark", async () => {
    let gate = later();
    const s = signal(1);
    const t = c.task(async (cx) => {
      cx.val(s);
      return cx.suspend(gate.promise);
    }, 0);
    const nodes = [s, t];
    root((cx) => {
      nodes.push(cx.effect(t, () => { }));
      nodes.push(cx.spawn(async (cx) => { await cx.suspend(t); }));
    });
    gate.resolve(5);
    await tick();
    gate = later();
    s.set(2);
    root((cx) => {
      nodes.push(cx.spawn(async (cx) => { await cx.suspend(t); }));
    });
    /** The same value again: the waiters resolve, the subscribers are not marked stale. */
    gate.resolve(5);
    await tick();
    expect(marked(nodes)).toEqual([]);
  });

  test("an array await and an error leave no mark", async () => {
    const a = later();
    const b = later();
    const t1 = c.task(async (cx) => cx.suspend(a.promise), 0);
    const t2 = c.task(async (cx) => {
      await cx.suspend(b.promise);
      throw new Error("bad");
    }, 0);
    const nodes = [t1, t2];
    let got;
    root((cx) => {
      cx.recover(() => true);
      nodes.push(cx.spawn(async (cx) => {
        try {
          got = await cx.suspend([t1, t2]);
        } catch (err) {
          got = err;
        }
      }));
      nodes.push(cx.effect(t1, () => { }));
    });
    a.resolve(1);
    await tick();
    b.resolve();
    await tick();
    expect(got !== void 0).toBe(true);
    expect(marked(nodes)).toEqual([]);
  });

  test("a callback settle inside another node's run leaves no mark", () => {
    let resolveT;
    const t = c.task((cx) => {
      cx.suspend((resolve) => { resolveT = resolve; });
    }, 0);
    const k = signal(0);
    const nodes = [t, k];
    root((cx) => {
      nodes.push(cx.effect(t, () => { }));
      nodes.push(cx.spawn(async (cx) => { await cx.suspend(t); }));
      nodes.push(cx.effect(k, (v) => {
        if (v === 1) {
          resolveT(3);
        }
      }));
    });
    k.set(1);
    expect(t.get()).toBe(3);
    expect(marked(nodes)).toEqual([]);
  });

  test("settling deps with duplicates and defers leaves no mark", async () => {
    const gate = later();
    const s = signal(1);
    const d1 = signal("a");
    const d2 = signal("b");
    const t = c.task(async (cx) => {
      let v = cx.val(s);
      const x = cx.defer(d1);
      const y = cx.defer(s);
      await cx.suspend(gate.promise);
      /** Read again after the await: a duplicate in _deps. */
      v += cx.val(s);
      return v + x + y + cx.defer(d2);
    }, 0);
    const nodes = [s, d1, d2, t];
    root((cx) => { nodes.push(cx.effect(t, () => { })); });
    gate.resolve();
    await tick();
    expect(t.get()).toBe("2a1b");
    expect(marked(nodes)).toEqual([]);
    /** The deferred deps were subscribed, and still notify. */
    d1.set("z");
    expect(marked(nodes)).toEqual([]);
  });

  test("a sync result with defers leaves no mark", () => {
    const s = signal(1);
    const d = signal(2);
    const t = c.task((cx) => cx.val(s) + cx.defer(d) + cx.defer(s), 0);
    const nodes = [s, d, t];
    root((cx) => { nodes.push(cx.effect(t, () => { })); });
    expect(t.get()).toBe(4);
    expect(marked(nodes)).toEqual([]);
    d.set(3);
    expect(t.get()).toBe(5);
    expect(marked(nodes)).toEqual([]);
  });

  test("a detected await cycle leaves no mark", async () => {
    const gate = later();
    let t2;
    const t1 = c.task(async (cx) => {
      await cx.suspend(gate.promise);
      return cx.suspend(t2);
    }, 0);
    t2 = c.task(async (cx) => cx.suspend(t1), 0);
    const nodes = [t1, t2];
    gate.resolve();
    await tick();
    expect(t1.is(1 << 4) || t2.is(1 << 4)).toBe(true);
    expect(marked(nodes)).toEqual([]);
  });
});
