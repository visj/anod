import { describe, test, expect } from "#test-runner";
import { signal, root, c, DISPOSED, LOADING } from "#anod";

const tick = () => Promise.resolve();
const settle = () => tick().then(tick).then(tick);

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * c.shield() (D10, bugs/design/README.md): the activation runs to
 * completion. Its re-run and disposal, and those of every owner above
 * it, wait until it ends. A disposal that waits freezes its subtree.
 */
describe("shield", () => {
  describe("spawn", () => {
    test("shielded spawn completes body before re-running", async () => {
      const s1 = signal([1, 2, 3]);
      let saved = [];
      let runs = 0;

      c.spawn(async (c) => {
        runs++;
        let arr = c.val(s1);
        c.shield();
        for (let i = 0; i < arr.length; i++) {
          await c.suspend(tick());
          saved.push(arr[i]);
        }
      });
      await settle();
      expect(runs).toBe(1);
      expect(saved).toEqual([1, 2, 3]);

      saved = [];
      s1.set([4, 5]);
      await settle();
      expect(runs).toBe(2);
      expect(saved).toEqual([4, 5]);
    });

    test("shielded spawn ignores mid-flight dep changes", async () => {
      const s1 = signal(1);
      let steps = [];
      let resolve;

      c.spawn(async (c) => {
        let val = c.val(s1);
        c.shield();
        steps.push("start:" + val);
        await c.suspend(new Promise((r) => { resolve = r; }));
        steps.push("end:" + val);
      });
      await settle();
      expect(steps).toEqual(["start:1"]);

      s1.set(2);
      await settle();
      expect(steps).toEqual(["start:1"]);

      resolve(void 0);
      await settle();
      expect(steps).toEqual(["start:1", "end:1", "start:2"]);

      resolve(void 0);
      await settle();
      expect(steps).toEqual(["start:1", "end:1", "start:2", "end:2"]);
    });

    test("shielded spawn re-runs when dep changed during the shield", async () => {
      const s1 = signal(1);
      let runs = 0;
      let resolve;
      let values = [];

      c.spawn(async (cx) => {
        runs++;
        let val = cx.val(s1);
        cx.shield();
        await cx.suspend(new Promise((r) => { resolve = r; }));
        values.push(val);
      });
      await settle();
      expect(runs).toBe(1);

      s1.set(2);
      await settle();
      expect(runs).toBe(1);

      resolve(void 0);
      await settle();
      expect(values).toEqual([1]);
      expect(runs).toBe(2);

      resolve(void 0);
      await settle();
      expect(values).toEqual([1, 2]);
    });

    test("shielded spawn re-runs when a transitive dep changed (FLAG_PENDING)", async () => {
      const s1 = signal(1);
      const c1 = c.compute(s1, (val) => val * 2);
      let resolve;
      let values = [];

      c.spawn(async (cx) => {
        let val = cx.val(c1);
        cx.shield();
        await cx.suspend(new Promise((r) => { resolve = r; }));
        values.push(val);
      });
      await settle();

      s1.set(2);
      await settle();
      resolve(void 0);
      await settle();
      expect(values).toEqual([2]);

      resolve(void 0);
      await settle();
      expect(values).toEqual([2, 4]);
    });

    test("shielding twice in one activation holds once", async () => {
      const s = signal(0);
      let runs = 0;
      const d = deferred();
      c.spawn(async (cx) => {
        runs++;
        cx.val(s);
        cx.shield();
        cx.shield();
        if (runs === 1) {
          await cx.suspend(d.promise);
        }
      });
      s.set(1);
      d.resolve();
      await settle();
      expect(runs).toBe(2);
      s.set(2);
      await settle();
      expect(runs).toBe(3);
    });

    test("tasks can't shield", () => {
      let shield;
      c.task((cx) => {
        shield = cx.shield;
        return 1;
      });
      expect(shield).toBeUndefined();
    });
  });

  describe("sync effect", () => {
    test("the shield ends when the fn returns", () => {
      const s = signal(0);
      let runs = 0;
      c.effect((cx) => {
        cx.val(s);
        cx.shield();
        runs++;
      });
      s.set(1);
      expect(runs).toBe(2);
    });

    test("a callback suspend holds the shield until it delivers", async () => {
      const s = signal(0);
      let runs = 0;
      let done;
      c.effect((cx) => {
        runs++;
        cx.val(s);
        cx.shield();
        cx.suspend((resolve) => { done = resolve; });
      });
      s.set(1);
      expect(runs).toBe(1);
      done();
      await settle();
      expect(runs).toBe(2);
    });
  });

  describe("owners", () => {
    test("an owner's re-run waits for a shielded child", async () => {
      const route = signal("a");
      const log = [];
      const saves = [];
      root((r) => {
        r.effect((cx) => {
          const page = cx.val(route);
          log.push("page:" + page);
          cx.spawn(async (sc) => {
            sc.shield();
            const d = deferred();
            saves.push(d);
            await sc.suspend(d.promise);
            log.push("saved:" + page);
          });
        });
      });
      route.set("b");
      expect(log).toEqual(["page:a"]);
      saves[0].resolve();
      await settle();
      expect(log).toEqual(["page:a", "saved:a", "page:b"]);
    });

    test("siblings keep updating while a shield is active", async () => {
      const s = signal(0);
      const seen = [];
      const d = deferred();
      root((r) => {
        r.spawn(async (sc) => {
          sc.shield();
          await sc.suspend(d.promise);
        });
        r.effect((cx) => {
          seen.push(cx.val(s));
        });
      });
      s.set(1);
      s.set(2);
      expect(seen).toEqual([0, 1, 2]);
      d.resolve();
      await settle();
    });

    test("a nested owner's re-run waits; its sibling still updates", async () => {
      const a = signal(0);
      const b = signal(0);
      const log = [];
      const d = deferred();
      root((r) => {
        r.effect((cx) => {
          log.push("held:" + cx.val(a));
          cx.spawn(async (sc) => {
            sc.shield();
            await sc.suspend(d.promise);
          });
        });
        r.effect((cx) => {
          log.push("free:" + cx.val(b));
        });
      });
      a.set(1);
      b.set(1);
      expect(log).toEqual(["held:0", "free:0", "free:1"]);
      d.resolve();
      await settle();
      expect(log).toEqual(["held:0", "free:0", "free:1", "held:1"]);
    });
  });

  describe("dispose while shielded", () => {
    test("disposal waits for the shield, then tears down children first", async () => {
      const order = [];
      const d = deferred();
      const r1 = root((r) => {
        r.cleanup(() => order.push("root cleanup"));
        r.spawn(async (cx) => {
          cx.cleanup(() => order.push("spawn cleanup"));
          cx.shield();
          order.push("start");
          await cx.suspend(d.promise);
          order.push("end");
        });
      });
      r1.dispose();
      expect(order).toEqual(["start"]);
      expect(r1.is(DISPOSED)).toBe(false);
      d.resolve();
      await settle();
      expect(order).toEqual(["start", "end", "spawn cleanup", "root cleanup"]);
      expect(r1.is(DISPOSED)).toBe(true);
    });

    test("the subtree is frozen while the disposal waits", async () => {
      const s = signal(0);
      const seen = [];
      let cleaned = false;
      const d = deferred();
      const r1 = root((r) => {
        r.spawn(async (sc) => {
          sc.shield();
          await sc.suspend(d.promise);
        });
        r.effect((cx) => {
          seen.push(cx.val(s));
          cx.cleanup(() => { cleaned = true; });
        });
      });
      r1.dispose();
      s.set(1);
      expect(seen).toEqual([0]);
      expect(cleaned).toBe(false);
      d.resolve();
      await settle();
      expect(seen).toEqual([0]);
      expect(cleaned).toBe(true);
    });

    test("a shielded node that releases under a frozen subtree doesn't re-run", async () => {
      const s = signal(0);
      let runs = 0;
      const a = deferred();
      const b = deferred();
      const r1 = root((r) => {
        r.spawn(async (sc) => {
          runs++;
          sc.val(s);
          sc.shield();
          await sc.suspend(a.promise);
        });
        r.spawn(async (sc) => {
          sc.shield();
          await sc.suspend(b.promise);
        });
      });
      s.set(1);
      r1.dispose();
      a.resolve();
      await settle();
      expect(runs).toBe(1);
      expect(r1.is(DISPOSED)).toBe(false);
      b.resolve();
      await settle();
      expect(runs).toBe(1);
      expect(r1.is(DISPOSED)).toBe(true);
    });

    test("the shielded continuation reads and creates children after its owner is disposed", async () => {
      const s = signal(1);
      const d = deferred();
      const log = [];
      const r1 = root((r) => {
        r.spawn(async (sc) => {
          sc.shield();
          await sc.suspend(d.promise);
          log.push("read:" + sc.val(s));
          sc.effect((cx) => {
            log.push("child");
            cx.cleanup(() => log.push("child cleanup"));
          });
        });
      });
      r1.dispose();
      d.resolve();
      await settle();
      expect(log).toEqual(["read:1", "child", "child cleanup"]);
      expect(r1.is(DISPOSED)).toBe(true);
    });

    test("disposing the shielded spawn itself waits for its activation", async () => {
      const d = deferred();
      let spawn;
      let cleaned = 0;
      const r1 = root((r) => {
        spawn = r.spawn(async (sc) => {
          sc.cleanup(() => cleaned++);
          sc.shield();
          await sc.suspend(d.promise);
        });
      });
      spawn.dispose();
      expect(spawn.is(DISPOSED)).toBe(false);
      expect(cleaned).toBe(0);
      d.resolve();
      await settle();
      expect(spawn.is(DISPOSED)).toBe(true);
      expect(cleaned).toBe(1);
      /** The root lives on, and its own teardown doesn't reach the spawn again. */
      r1.dispose();
      expect(cleaned).toBe(1);
    });

    test("resume() inside a disposing subtree does nothing", async () => {
      const s = signal(0);
      const seen = [];
      const d = deferred();
      let child;
      const r1 = root((r) => {
        r.spawn(async (sc) => {
          sc.shield();
          await sc.suspend(d.promise);
        });
        child = r.effect((cx) => {
          seen.push(cx.val(s));
        });
      });
      r1.dispose();
      child.resume();
      s.set(1);
      expect(seen).toEqual([0]);
      d.resolve();
      await settle();
    });

    test("a graceful dispose doesn't abort the controller", async () => {
      const d = deferred();
      let ctrl;
      const r1 = root((r) => {
        r.spawn(async (sc) => {
          sc.shield();
          ctrl = sc.controller();
          await sc.suspend(d.promise);
        });
      });
      r1.dispose();
      expect(ctrl.signal.aborted).toBe(false);
      d.resolve();
      await settle();
      expect(ctrl.signal.aborted).toBe(true);
    });

    test("a shielded node created after the freeze doesn't re-run when it releases", async () => {
      const s = signal(0);
      const a = deferred();
      const b = deferred();
      const hold = deferred();
      let runs = 0;
      const r1 = root((r) => {
        r.spawn(async (sc) => {
          sc.shield();
          await sc.suspend(a.promise);
          /** Created after the disposal froze the subtree, so not paused. */
          sc.spawn(async (inner) => {
            runs++;
            inner.val(s);
            inner.shield();
            await inner.suspend(b.promise);
          });
        });
        r.spawn(async (sc) => {
          sc.shield();
          await sc.suspend(hold.promise);
        });
      });
      r1.dispose();
      a.resolve();
      await settle();
      expect(runs).toBe(1);
      s.set(1);
      b.resolve();
      await settle();
      expect(runs).toBe(1);
      expect(r1.is(DISPOSED)).toBe(false);
      hold.resolve();
      await settle();
      expect(r1.is(DISPOSED)).toBe(true);
    });

    test("an effect that shields and throws on a re-run is still disposed", () => {
      const s = signal(0);
      let cleaned = 0;
      root((r) => {
        r.recover(() => true);
        r.effect((cx) => {
          cx.cleanup(() => cleaned++);
          if (cx.val(s) > 0) {
            cx.shield();
            throw new Error("boom");
          }
        });
      });
      s.set(1);
      /** One for the re-run's teardown of run 1, one for the disposal. */
      expect(cleaned).toBe(2);
    });

    test("a sync effect that shields and throws is still disposed", () => {
      let cleaned = 0;
      root((r) => {
        r.recover(() => true);
        r.effect((cx) => {
          cx.cleanup(() => cleaned++);
          cx.shield();
          throw new Error("boom");
        });
      });
      expect(cleaned).toBe(1);
    });
  });

  describe("dispose(true)", () => {
    test("ends the shield: aborts, cleans up, drops the continuation", async () => {
      const d = deferred();
      let ctrl;
      let cleaned = false;
      let resumed = false;
      const r1 = root((r) => {
        r.spawn(async (sc) => {
          sc.cleanup(() => { cleaned = true; });
          sc.shield();
          ctrl = sc.controller();
          await sc.suspend(d.promise);
          resumed = true;
        });
      });
      r1.dispose(true);
      expect(ctrl.signal.aborted).toBe(true);
      expect(cleaned).toBe(true);
      expect(r1.is(DISPOSED)).toBe(true);
      d.resolve();
      await settle();
      expect(resumed).toBe(false);
    });

    test("escalates a graceful dispose that is waiting", async () => {
      let ctrl;
      let cleaned = 0;
      const r1 = root((r) => {
        r.spawn(async (sc) => {
          sc.cleanup(() => cleaned++);
          sc.shield();
          ctrl = sc.controller();
          /** Waits for its own abort, which a graceful dispose never sends. */
          await sc.suspend(new Promise((res) => {
            ctrl.signal.addEventListener("abort", res, { once: true });
          }));
        });
      });
      r1.dispose();
      await settle();
      expect(cleaned).toBe(0);
      r1.dispose(true);
      expect(ctrl.signal.aborted).toBe(true);
      expect(cleaned).toBe(1);
      await settle();
      expect(cleaned).toBe(1);
    });

    test("forcing a child releases an owner waiting on it", async () => {
      let spawn;
      let rootCleaned = false;
      const r1 = root((r) => {
        r.cleanup(() => { rootCleaned = true; });
        spawn = r.spawn(async (sc) => {
          sc.shield();
          await sc.suspend(new Promise(() => {}));
        });
      });
      r1.dispose();
      expect(rootCleaned).toBe(false);
      spawn.dispose(true);
      expect(spawn.is(DISPOSED)).toBe(true);
      expect(rootCleaned).toBe(true);
      expect(r1.is(DISPOSED)).toBe(true);
    });

    test("breaks a cycle through a child's cleanup", async () => {
      const g = deferred();
      let childCleaned = false;
      let finished = false;
      const r1 = root((r) => r.spawn(async (sc) => {
        sc.shield();
        sc.effect((child) => child.cleanup(() => {
          childCleaned = true;
          g.resolve();
        }));
        await sc.suspend(g.promise);
        finished = true;
      }));
      r1.dispose();
      await settle();
      expect(childCleaned).toBe(false);
      r1.dispose(true);
      expect(childCleaned).toBe(true);
      await settle();
      expect(finished).toBe(false);
    });

    test("leaves unrelated reactive work running", async () => {
      const s = signal(0);
      const seen = [];
      const r1 = root((r) => r.spawn(async (sc) => {
        sc.shield();
        await sc.suspend(new Promise(() => {}));
      }));
      root((r) => r.effect((cx) => { seen.push(cx.val(s)); }));
      r1.dispose();
      r1.dispose(true);
      s.set(1);
      expect(seen).toEqual([0, 1]);
    });
  });

  describe("unshielded stale guard", () => {
    test("unshielded PENDING+needsUpdate marks FLAG_STALE so pull re-runs", async () => {
      const s1 = signal(1);
      const c1 = c.compute(s1, (val) => val * 2);
      let runs = 0;
      let resolve;

      /** Task depends on c1 (transitive dep of s1). */
      const t1 = c.task(async (cx) => {
        runs++;
        let val = cx.val(c1);
        await cx.suspend(new Promise((r) => { resolve = r; }));
        return val;
      });
      await settle();
      expect(runs).toBe(1);

      /** Change s1 while task is loading. Task gets FLAG_PENDING.
       *  The old promise resolves — should be discarded (stale).
       *  After discarding, FLAG_STALE is set so the next pull re-runs. */
      s1.set(2);
      resolve(void 0);
      await settle();

      /** Task is still loading (old activation discarded, FLAG_STALE set).
       *  Pulling triggers re-run → new activation with new promise. */
      expect(t1.is(LOADING)).toBe(true);
      t1.get();
      expect(runs).toBe(2);

      /** Resolve the new activation. */
      resolve(void 0);
      await settle();
      expect(t1.get()).toBe(4);
    });

    test("unshielded PENDING+needsUpdate with effect subscriber triggers re-run", async () => {
      const s1 = signal(1);
      const c1 = c.compute(s1, (val) => val * 2);
      let runs = 0;
      let resolve;
      let observed = [];

      /** Task depends on c1 (transitive dep of s1). */
      const t1 = c.task(async (cx) => {
        runs++;
        let val = cx.val(c1);
        await cx.suspend(new Promise((r) => { resolve = r; }));
        return val;
      });
      await settle();

      /** Effect subscribes to the task — will trigger re-run. */
      c.effect((cx) => {
        if (!cx.pending(t1)) {
          observed.push(cx.val(t1));
        }
      });
      resolve(void 0);
      await settle();
      expect(observed).toEqual([2]);
      expect(runs).toBe(1);

      /** Change dep while loading. Effect ensures task re-runs. */
      s1.set(2);
      resolve(void 0);
      await settle();
      resolve(void 0);
      await settle();
      expect(observed).toEqual([2, 4]);
      expect(runs).toBe(2);
    });
  });
});
