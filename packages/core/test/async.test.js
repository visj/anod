import { describe, test, expect } from "#test-runner";
import { signal, root } from "#fyren";

let c; root((_c) => { c = _c; });

const tick = () => Promise.resolve();
/** suspend() adds one extra microtask layer; settle needs 2 ticks for
 *  non-async fns returning suspend promises, 3 for async fns. */
const settle = () => tick().then(tick).then(tick);

describe("async", () => {
  describe("promise", () => {
    test("is loading while the promise is pending", async () => {
      let resolve;
      const c1 = c.task((c) => {
        return c.suspend(
          new Promise((r) => {
            resolve = r;
          })
        );
      });

      expect(c1.loading).toBe(true);

      resolve(42);
      await settle();

      expect(c1.loading).toBe(false);
    });

    test("returns seed value while loading", async () => {
      let resolve;
      const c1 = c.task((c) => {
        return c.suspend(
          new Promise((r) => {
            resolve = r;
          })
        );
      }, 0);

      expect(c1.get()).toBe(0);
      expect(c1.loading).toBe(true);

      resolve(99);
      await settle();

      expect(c1.get()).toBe(99);
      expect(c1.loading).toBe(false);
    });

    test("settles to the resolved value", async () => {
      const c1 = c.task((c) => {
        return c.suspend(Promise.resolve(42));
      });

      expect(c1.loading).toBe(true);
      await settle();

      expect(c1.get()).toBe(42);
      expect(c1.loading).toBe(false);
      expect(c1.error).toBeNull();
    });

    test("sets error flag on rejection", async () => {
      const c1 = c.task((c) => {
        return c.suspend(Promise.reject(new Error("async error")));
      });

      await settle();

      expect(c1.error).not.toBeNull();
      expect(c1.loading).toBe(false);
    });

    test("rethrows the error when read after rejection", async () => {
      const c1 = c.task((c) => {
        return c.suspend(Promise.reject(new Error("async error")));
      });

      await settle();

      expect(() => c1.get()).toThrow("async error");
    });

    test("clears error on subsequent successful resolution", async () => {
      const s1 = signal(true);
      const c1 = c.task((c) => {
        return c.val(s1)
          ? c.suspend(Promise.reject(new Error("fail")))
          : c.suspend(Promise.resolve(42));
      });

      await settle();
      expect(c1.error).not.toBeNull();

      s1.set(false);
      c1.get(); // Pull to trigger re-evaluation
      await settle();

      expect(c1.error).toBeNull();
      expect(c1.get()).toBe(42);
    });

    test("notifies downstream effect when promise settles", async () => {
      const c1 = c.task((c) => {
        return c.suspend(Promise.resolve(42));
      });
      let received = void 0;

      c.effect((c) => {
        received = c.val(c1);
      });

      expect(received).toBeUndefined(); // seed while loading
      await settle();

      expect(received).toBe(42);
    });

    test("ignores stale promise when signal updates before it resolves", async () => {
      const resolvers = [];
      const s1 = signal(0);

      const c1 = c.task((c) => {
        const v = c.val(s1);
        return c.suspend(
          new Promise((r) => {
            resolvers[v] = r;
          })
        );
      });

      // Trigger a second promise by updating the signal
      s1.set(1);
      c1.get(); // Pull to trigger re-evaluation with new signal value

      // Resolve the stale (first) promise — should be ignored
      resolvers[0](100);
      await settle();

      expect(c1.loading).toBe(true); // still loading; second promise not yet resolved

      // Resolve the current (second) promise
      resolvers[1](200);
      await settle();

      expect(c1.get()).toBe(200);
      expect(c1.loading).toBe(false);
    });
  });

  describe("async iterator", () => {
    test("is loading before the first yield", () => {
      let resolver;
      const iter = {
        [Symbol.asyncIterator]() {
          return this;
        },
        next() {
          return new Promise((r) => {
            resolver = r;
          });
        }
      };

      const c1 = c.task(() => {
        return iter;
      });

      expect(c1.loading).toBe(true);
      expect(c1.get()).toBeUndefined();

      // prevent unhandled-rejection noise from a never-resolved promise
      resolver({ done: true });
    });

    test("settles on each yielded value and notifies downstream", async () => {
      const resolvers = [];
      const iter = {
        [Symbol.asyncIterator]() {
          return this;
        },
        next() {
          return new Promise((r) => resolvers.push(r));
        },
        return() {
          return Promise.resolve({ done: true });
        }
      };

      const c1 = c.task(() => {
        return iter;
      });
      const values = [];

      c.effect((c) => {
        const v = c.val(c1);
        if (!c1.loading) {
          values.push(v);
        }
      });

      resolvers[0]({ value: 1, done: false });
      await tick();
      expect(values).toEqual([1]);

      resolvers[1]({ value: 2, done: false });
      await tick();
      expect(values).toEqual([1, 2]);

      resolvers[2]({ value: 3, done: false });
      await tick();
      expect(values).toEqual([1, 2, 3]);
    });

    test("is not loading after first yield", async () => {
      let resolver;
      const iter = {
        [Symbol.asyncIterator]() {
          return this;
        },
        next() {
          return new Promise((r) => {
            resolver = r;
          });
        },
        return() {
          return Promise.resolve({ done: true });
        }
      };

      const c1 = c.task(() => {
        return iter;
      });

      expect(c1.loading).toBe(true);

      resolver({ value: 42, done: false });
      await tick();

      expect(c1.loading).toBe(false);
      expect(c1.get()).toBe(42);
    });

    test("sets error flag when the iterator rejects", async () => {
      async function* failing() {
        throw new Error("iterator error");
      }

      const c1 = c.task(() => {
        return failing();
      });

      await tick();

      expect(c1.error).not.toBeNull();
      expect(() => c1.get()).toThrow("iterator error");
    });

    test("calls return() on the stale iterator when it next yields", async () => {
      let resolveStale;
      let returnCalled = false;

      const staleIter = {
        [Symbol.asyncIterator]() {
          return this;
        },
        next() {
          return new Promise((r) => {
            resolveStale = r;
          });
        },
        return() {
          returnCalled = true;
          return Promise.resolve({ value: undefined, done: true });
        }
      };

      const s1 = signal(true);
      const c1 = c.task((c) => {
        if (c.val(s1)) {
          return staleIter;
        }
        return (async function* () {
          yield 99;
        })();
      });

      s1.set(false);
      c1.get();
      await tick();
      await tick();

      expect(c1.get()).toBe(99);

      resolveStale({ value: 42, done: false });
      await tick();

      expect(returnCalled).toBe(true);
      expect(c1.get()).toBe(99);
    });
  });

  describe("context", () => {
    test("reads a signal before and after await", async () => {
      const s1 = signal(1);
      const s2 = signal(10);
      const c1 = c.task(async (c) => {
        let a = c.val(s1);
        await c.suspend(tick());
        let b = c.val(s2);
        return a + b;
      });
      await settle();
      expect(c1.get()).toBe(11);
    });

    test("re-runs when a dep added post-await changes", async () => {
      const s1 = signal(1);
      const s2 = signal(10);
      let runs = 0;
      const c1 = c.task(async (c) => {
        runs++;
        c.val(s1);
        await c.suspend(tick());
        return c.val(s2);
      });
      await settle();
      expect(c1.get()).toBe(10);
      expect(runs).toBe(1);

      s2.set(20);
      c1.get();
      await settle();
      expect(c1.get()).toBe(20);
      expect(runs).toBe(2);
    });

    test("tear-down: stale dep is not re-subscribed if not re-read", async () => {
      const s1 = signal(true);
      const sA = signal("a");
      const sB = signal("b");
      let runs = 0;
      const c1 = c.task(async (c) => {
        runs++;
        let sel = c.val(s1);
        await c.suspend(tick());
        return sel ? c.val(sA) : c.val(sB);
      });
      await settle();
      expect(c1.get()).toBe("a");

      // sB is not a current dep — changing it must NOT trigger a re-run.
      sB.set("B");
      await tick();
      expect(runs).toBe(1);

      // Flip: now sB becomes the dep, sA is torn down.
      s1.set(false);
      c1.get();
      await settle();
      expect(c1.get()).toBe("B");
      expect(runs).toBe(2);

      // sA no longer a dep.
      sA.set("AA");
      await tick();
      expect(runs).toBe(2);
    });

    test("duplicate reads in same sync chunk are cleaned by checkDeps", async () => {
      const s1 = signal(5);
      let runs = 0;
      const c1 = c.task(async (c) => {
        runs++;
        let sum = 0;
        for (let i = 0; i < 10; i++) {
          sum += c.val(s1);
        }
        await c.suspend(tick());
        return sum;
      });
      await settle();
      expect(c1.get()).toBe(50);
      expect(runs).toBe(1);

      s1.set(6);
      c1.get();
      await settle();
      expect(c1.get()).toBe(60);
      expect(runs).toBe(2);

      c1.dispose();
      const c2 = c.compute((c) => c.val(s1) + 1);
      expect(c2.get()).toBe(7);
      s1.set(7);
      expect(c2.get()).toBe(8);
    });

    test("cross-compute pollution: same signal read twice across await is deduped", async () => {
      const s1 = signal(1);
      const s2 = signal(10);
      const c0 = c.compute((c) => c.val(s2) * 100);
      expect(c0.get()).toBe(1000);

      let runs = 0;
      const c1 = c.task(async (c) => {
        runs++;
        c.val(s1);
        c.val(s2);
        await c.suspend(tick());
        return c.val(s2);
      });
      await settle();
      expect(c1.get()).toBe(10);
      expect(runs).toBe(1);

      s2.set(20);
      c1.get();
      await settle();
      expect(c1.get()).toBe(20);
      expect(runs).toBe(2);

      c1.dispose();
      const c2 = c.compute((c) => c.val(s2));
      expect(c2.get()).toBe(20);
      s2.set(21);
      expect(c2.get()).toBe(21);
    });

    test("captured context is the node itself", async () => {
      const s1 = signal(1);
      let captured;
      const c1 = c.task(async (c) => {
        if (captured === undefined) {
          captured = c;
        }
        await c.suspend(tick());
        return c.val(s1);
      });
      await settle();
      expect(c1.get()).toBe(1);
      /** Without Reader, captured context IS the node object. */
      expect(captured).toBe(c1);
    });

    test("task with bound signal dependency", async () => {
      const s1 = signal(5);
      const c1 = c.task(s1, async (val, c) => {
        return await c.suspend(Promise.resolve(val * 2));
      });
      await settle();
      expect(c1.get()).toBe(10);

      s1.set(6);
      c1.get();
      await settle();
      expect(c1.get()).toBe(12);
    });

    test("spawn with bound signal dependency", async () => {
      const s1 = signal(1);
      let observed = null;
      c.spawn(s1, async (val, c) => {
        observed = await c.suspend(Promise.resolve(val));
      });
      await settle();
      expect(observed).toBe(1);

      s1.set(2);
      await settle();
      expect(observed).toBe(2);
    });

    test("dynamic spawn: reads signals across await in an effect", async () => {
      const s1 = signal(1);
      const s2 = signal(10);
      let observed = null;
      c.spawn(async (c) => {
        let a = c.val(s1);
        await c.suspend(tick());
        let b = c.val(s2);
        observed = a + b;
      });
      await settle();
      expect(observed).toBe(11);

      s2.set(20);
      await settle();
      expect(observed).toBe(21);
    });
  });

  describe("stable context", () => {
    test("c.stable(): post-stable reads do not register new deps", async () => {
      const s1 = signal(1);
      const s2 = signal(10);
      let runs = 0;
      const c1 = c.task(async (c) => {
        runs++;
        const v1 = c.val(s1);
        c.stable();
        const v2 = c.val(s2);
        await c.suspend(tick());
        return v1 + v2;
      });
      await settle();
      expect(c1.get()).toBe(11);
      expect(runs).toBe(1);

      s2.set(99);
      await tick();
      expect(runs).toBe(1);
    });

    test("c.stable(): pre-stable reads stay tracked and trigger reruns", async () => {
      const s1 = signal(1);
      const s2 = signal(10);
      let runs = 0;
      const c1 = c.task(async (c) => {
        runs++;
        const v1 = c.val(s1);
        c.stable();
        const v2 = c.val(s2);
        await c.suspend(tick());
        return v1 + v2;
      });
      await settle();
      expect(c1.get()).toBe(11);

      s1.set(2);
      c1.get();
      await settle();
      expect(c1.get()).toBe(12);
      expect(runs).toBe(2);
    });

    test("c.equal() is callable on the context and propagates to node", async () => {
      const src = signal(0);
      const c1 = c.task(async (c) => {
        const v = c.val(src);
        c.equal(true);
        await c.suspend(tick());
        return v;
      });
      await settle();
      expect(c1.get()).toBe(0);
    });

    test("c.stable() on spawn()", async () => {
      const s1 = signal(1);
      const s2 = signal(100);
      let runs = 0;
      let observed;
      c.spawn(async (c) => {
        runs++;
        const v1 = c.val(s1);
        c.stable();
        const v2 = c.val(s2);
        await c.suspend(tick());
        observed = v1 + v2;
      });
      await settle();
      expect(observed).toBe(101);
      expect(runs).toBe(1);

      s2.set(200); // not tracked
      await tick();
      expect(runs).toBe(1);

      s1.set(2); // tracked
      await settle();
      expect(observed).toBe(202);
      expect(runs).toBe(2);
    });

    test("c.stable() before any reads: node goes dormant", async () => {
      const s1 = signal(1);
      let runs = 0;
      const c1 = c.task(async (c) => {
        runs++;
        c.stable();
        const v = c.val(s1);
        await c.suspend(tick());
        return v;
      });
      await settle();
      expect(c1.get()).toBe(1);
      expect(runs).toBe(1);

      s1.set(2);
      await tick();
      expect(runs).toBe(1);
      expect(c1.get()).toBe(1);
    });
  });

  describe("suspend", () => {
    test("resolves value when node is still alive", async () => {
      const c1 = c.task(async (c) => {
        const val = await c.suspend(Promise.resolve(42));
        return val;
      });
      await settle();
      expect(c1.get()).toBe(42);
    });

    test("never resumes when node is disposed", async () => {
      let continued = false;
      let resolve;
      const c1 = c.task(async (c) => {
        await c.suspend(
          new Promise((r) => {
            resolve = r;
          })
        );
        continued = true;
        return 99;
      });

      c1.dispose();
      resolve(42);
      await settle();

      expect(continued).toBe(false);
    });

    test("never resumes when node re-runs (stale activation)", async () => {
      const s1 = signal(1);
      let firstContinued = false;
      let firstResolve;
      let runs = 0;

      const c1 = c.task(async (c) => {
        runs++;
        const v = c.val(s1);
        if (runs === 1) {
          await c.suspend(
            new Promise((r) => {
              firstResolve = r;
            })
          );
          firstContinued = true;
          return v;
        }
        return await c.suspend(Promise.resolve(v * 10));
      });

      expect(c1.loading).toBe(true);
      expect(runs).toBe(1);

      s1.set(2);
      c1.get();
      await settle();

      expect(runs).toBe(2);
      expect(c1.get()).toBe(20);

      firstResolve(999);
      await settle();

      expect(firstContinued).toBe(false);
      expect(c1.get()).toBe(20);
    });

    test("suspend propagates rejections when node is current", async () => {
      const c1 = c.task(async (c) => {
        return await c.suspend(Promise.reject(new Error("boom")));
      });
      await settle();

      expect(c1.error).not.toBeNull();
      expect(() => c1.get()).toThrow("boom");
    });

    test("suspend works with bound task", async () => {
      const s1 = signal(5);
      const c1 = c.task(s1, async (val, c) => {
        const result = await c.suspend(Promise.resolve(val + 1));
        return result;
      });
      await settle();
      expect(c1.get()).toBe(6);

      s1.set(10);
      c1.get();
      await settle();
      expect(c1.get()).toBe(11);
    });

    test("suspend works with spawn", async () => {
      let observed = null;
      c.spawn(async (c) => {
        observed = await c.suspend(Promise.resolve(42));
      });
      await settle();
      expect(observed).toBe(42);
    });
  });

  describe("controller", () => {
    test("returns an AbortController", async () => {
      const c1 = c.task(async (c) => {
        const ctrl = c.controller();
        expect(ctrl).toBeInstanceOf(AbortController);
        expect(ctrl.signal.aborted).toBe(false);
        return await c.suspend(Promise.resolve(42));
      });
      await settle();
      expect(c1.get()).toBe(42);
    });

    test("controller is aborted on re-run", async () => {
      const s1 = signal(1);
      let captured = null;

      const c1 = c.task(async (c) => {
        const ctrl = c.controller();
        if (captured === null) {
          captured = ctrl;
        }
        const v = c.val(s1);
        return await c.suspend(Promise.resolve(v));
      });
      await settle();
      expect(c1.get()).toBe(1);
      expect(captured.signal.aborted).toBe(false);

      s1.set(2);
      c1.get();
      /** The old controller should be aborted on re-run. */
      expect(captured.signal.aborted).toBe(true);

      await settle();
      expect(c1.get()).toBe(2);
    });

    test("controller is aborted on dispose", async () => {
      let captured = null;

      const c1 = c.task(async (c) => {
        captured = c.controller();
        return await c.suspend(Promise.resolve(1));
      });
      await settle();
      expect(captured.signal.aborted).toBe(false);

      c1.dispose();
      expect(captured.signal.aborted).toBe(true);
    });

    test("controller works with spawn", async () => {
      const s1 = signal(1);
      let captured = null;

      c.spawn(async (c) => {
        const ctrl = c.controller();
        if (captured === null) {
          captured = ctrl;
        }
        c.val(s1);
        await c.suspend(tick());
      });
      await settle();
      expect(captured.signal.aborted).toBe(false);

      s1.set(2);
      await settle();
      /** Previous controller aborted on re-run. */
      expect(captured.signal.aborted).toBe(true);
    });

    test("each run gets a fresh controller", async () => {
      const s1 = signal(1);
      let controllers = [];

      const c1 = c.task(async (c) => {
        controllers.push(c.controller());
        const v = c.val(s1);
        return await c.suspend(Promise.resolve(v));
      });
      await settle();

      s1.set(2);
      c1.get();
      await settle();

      expect(controllers.length).toBe(2);
      expect(controllers[0]).not.toBe(controllers[1]);
      expect(controllers[0].signal.aborted).toBe(true);
      expect(controllers[1].signal.aborted).toBe(false);
    });
  });

  describe("defer", () => {
    test("reads value without subscribing during execution", async () => {
      const s1 = signal(1);
      const s2 = signal(10);
      let runs = 0;
      let resolve;

      const c1 = c.task((c) => {
        runs++;
        const a = c.val(s1);
        const b = c.defer(s2);
        return c.suspend(new Promise((r) => { resolve = r; }));
      });
      expect(runs).toBe(1);

      /** s2 was deferred — changing it while loading should NOT
       *  cause a re-run because we haven't subscribed yet. */
      s2.set(20);
      await tick();
      expect(runs).toBe(1);

      resolve(11);
      await settle();
      expect(c1.get()).toBe(11);
    });

    test("re-runs after settle if deferred dep changed", async () => {
      const s1 = signal(1);
      const s2 = signal(10);
      let runs = 0;
      let resolve;

      const c1 = c.task((c) => {
        runs++;
        const a = c.val(s1);
        const b = c.defer(s2);
        return c.suspend(
          new Promise((r) => {
            resolve = r;
          })
        );
      });

      expect(runs).toBe(1);
      s2.set(20);
      await tick();
      expect(runs).toBe(1);

      resolve(11);
      await settle();
      expect(runs).toBe(2);
    });

    test("does not re-run if deferred dep unchanged at settle", async () => {
      const s1 = signal(1);
      const s2 = signal(10);
      let runs = 0;

      const c1 = c.task((c) => {
        runs++;
        const a = c.val(s1);
        const b = c.defer(s2);
        return c.suspend(Promise.resolve(a + b));
      });
      await settle();
      expect(runs).toBe(1);

      s1.set(2);
      c1.get();
      await settle();
      expect(runs).toBe(2);
      expect(c1.get()).toBe(12);
    });

    test("deferred deps are subscribed after settle", async () => {
      const s1 = signal(1);
      const s2 = signal(10);
      let runs = 0;

      const c1 = c.task((c) => {
        runs++;
        const a = c.val(s1);
        const b = c.defer(s2);
        return c.suspend(Promise.resolve(a + b));
      });
      await settle();
      expect(runs).toBe(1);

      s2.set(20);
      c1.get();
      await settle();
      expect(runs).toBe(2);
      expect(c1.get()).toBe(21);
    });

    test("defer works with spawn", async () => {
      const s1 = signal(1);
      const s2 = signal(10);
      let observed = null;
      let runs = 0;

      c.spawn(async (c) => {
        runs++;
        const a = c.val(s1);
        const b = c.defer(s2);
        observed = a + b;
        await c.suspend(tick());
      });
      await settle();
      expect(observed).toBe(11);
      expect(runs).toBe(1);

      s2.set(20);
      await settle();
      expect(runs).toBe(2);
      expect(observed).toBe(21);
    });
  });

  describe("suspend task", () => {
    test("fast-path: spawn awaits a settled task", async () => {
      const taskA = c.task((c) => c.suspend(Promise.resolve(42)));
      await settle();
      expect(taskA.get()).toBe(42);

      let observed = null;
      c.spawn(async (c) => {
        observed = await c.suspend(taskA);
      });
      await settle();
      expect(observed).toBe(42);
    });

    test("slow-path: spawn awaits a loading task", async () => {
      let resolve;
      const taskA = c.task((c) => {
        return c.suspend(
          new Promise((r) => {
            resolve = r;
          })
        );
      });
      expect(taskA.loading).toBe(true);

      let observed = null;
      c.spawn(async (c) => {
        observed = await c.suspend(taskA);
      });
      await settle();
      expect(observed).toBe(null);

      resolve(99);
      await settle();
      expect(observed).toBe(99);
    });

    test("awaiter re-runs before task settles: waiter removed", async () => {
      let resolve;
      const taskA = c.task((c) => {
        return c.suspend(
          new Promise((r) => {
            resolve = r;
          })
        );
      });

      const s1 = signal(1);
      let observed = null;
      let runs = 0;
      c.spawn(async (c) => {
        runs++;
        const v = c.val(s1);
        if (runs === 1) {
          observed = await c.suspend(taskA);
        }
        await c.suspend(tick());
      });
      await settle();
      expect(runs).toBe(1);

      s1.set(2);
      await settle();
      expect(runs).toBe(2);

      resolve(42);
      await settle();
      expect(observed).toBe(null);
    });

    test("after settle, awaiter reacts to future task changes", async () => {
      const s1 = signal(1);
      const taskA = c.task((c) => {
        return c.suspend(Promise.resolve(c.val(s1) * 10));
      });
      await settle();
      expect(taskA.get()).toBe(10);

      let observed = null;
      let runs = 0;
      c.spawn(async (c) => {
        runs++;
        observed = await c.suspend(taskA);
      });
      await settle();
      expect(observed).toBe(10);
      expect(runs).toBe(1);

      s1.set(2);
      await settle();
      expect(taskA.get()).toBe(20);
      await settle();
      expect(runs).toBe(2);
      expect(observed).toBe(20);
    });

    test("multiple awaiters on the same task", async () => {
      let resolve;
      const taskA = c.task((c) => {
        return c.suspend(
          new Promise((r) => {
            resolve = r;
          })
        );
      });

      let obs1 = null,
        obs2 = null;
      c.spawn(async (c) => {
        obs1 = await c.suspend(taskA);
      });
      c.spawn(async (c) => {
        obs2 = await c.suspend(taskA);
      });
      await settle();
      expect(obs1).toBe(null);
      expect(obs2).toBe(null);

      resolve(77);
      await settle();
      expect(obs1).toBe(77);
      expect(obs2).toBe(77);
    });

    test("task awaiting another task (chained)", async () => {
      let resolve;
      const taskA = c.task((c) => {
        return c.suspend(
          new Promise((r) => {
            resolve = r;
          })
        );
      });
      const taskB = c.task(async (c) => {
        const val = await c.suspend(taskA);
        return val * 2;
      });

      expect(taskB.loading).toBe(true);

      resolve(5);
      await settle();
      expect(taskA.get()).toBe(5);
      await settle();
      expect(taskB.get()).toBe(10);
    });

    test("error propagation: task rejects, awaiter receives error", async () => {
      const taskA = c.task((c) => {
        return c.suspend(Promise.reject(new Error("fail")));
      });
      await settle();
      expect(taskA.error).not.toBeNull();

      let caught = null;
      c.spawn(async (c) => {
        try {
          await c.suspend(taskA);
        } catch (e) {
          caught = e;
        }
        await c.suspend(tick());
      });
      await settle();
      expect(caught).toBeInstanceOf(Error);
      expect(caught.message).toBe("fail");
    });

    test("dispose awaiter while waiting: no crash", async () => {
      let resolve;
      const taskA = c.task((c) => {
        return c.suspend(
          new Promise((r) => {
            resolve = r;
          })
        );
      });

      let observed = null;
      const r = root((r) => {
        r.spawn(async (c) => {
          observed = await c.suspend(taskA);
        });
      });
      await settle();
      expect(observed).toBe(null);

      r.dispose();
      resolve(42);
      await settle();
      expect(observed).toBe(null);
      expect(taskA.get()).toBe(42);
    });
  });

  describe("loading suppresses downstream", () => {
    test("effect does not re-run when a task dependency changes while loading", async () => {
      let resolve1, resolve2;
      const s1 = signal(1);
      let taskRuns = 0;
      const c1 = c.task((c) => {
        taskRuns++;
        const v = c.val(s1);
        if (v === 1) {
          return c.suspend(
            new Promise((r) => {
              resolve1 = r;
            })
          );
        }
        return c.suspend(
          new Promise((r) => {
            resolve2 = r;
          })
        );
      }, 0);
      let effectRuns = 0;

      c.effect((c) => {
        c.val(c1);
        effectRuns++;
      });

      expect(effectRuns).toBe(1);
      expect(c1.loading).toBe(true);
      expect(taskRuns).toBe(1);

      /**
       * Update s1 while the task is still loading. The task
       * re-executes (fires a new promise), but the downstream
       * effect must NOT be notified because the task is still
       * loading — its value hasn't settled yet.
       */
      s1.set(2);
      await settle();

      expect(taskRuns).toBe(2);
      expect(effectRuns).toBe(1);

      resolve2(42);
      await settle();

      /** Now the task has settled — the effect should run. */
      expect(effectRuns).toBe(2);
    });

    test("chained computes: intermediate task loading blocks downstream effect", async () => {
      let resolve;
      const s1 = signal(1);
      const c1 = c.task((c) => {
        const v = c.val(s1);
        return c.suspend(
          new Promise((r) => {
            resolve = r;
          })
        );
      }, 0);
      const c2 = c.compute((c) => c.val(c1) * 10);
      let runs = 0;
      let observed = void 0;

      c.effect((c) => {
        observed = c.val(c2);
        runs++;
      });

      expect(runs).toBe(1);
      expect(observed).toBe(0);

      /** Changing s1 while task is loading should not propagate. */
      s1.set(2);
      await settle();

      expect(runs).toBe(1);

      resolve(5);
      await settle();

      expect(runs).toBe(2);
      expect(observed).toBe(50);
    });

    test("multiple dep changes while loading do not cause multiple effect runs", async () => {
      let resolve;
      const s1 = signal(1);
      const s2 = signal(10);
      const c1 = c.task((c) => {
        const a = c.val(s1);
        const b = c.val(s2);
        return c.suspend(
          new Promise((r) => {
            resolve = r;
          })
        );
      }, 0);
      let runs = 0;

      c.effect((c) => {
        c.val(c1);
        runs++;
      });

      expect(runs).toBe(1);

      /**
       * Two dependency updates while loading — neither should
       * cause an extra effect run.
       */
      s1.set(2);
      await settle();
      s2.set(20);
      await settle();

      expect(runs).toBe(1);

      resolve(99);
      await settle();

      expect(runs).toBe(2);
    });
  });

  describe("pending", () => {
    test("returns true when task is loading", async () => {
      let resolve;
      const taskA = c.task((c) => {
        return c.suspend(new Promise((r) => { resolve = r; }));
      });
      let result = null;

      c.effect((c) => {
        result = c.pending(taskA);
      });

      expect(result).toBe(true);

      resolve(42);
      await settle();

      expect(result).toBe(false);
    });

    test("returns false when task is settled", async () => {
      const taskA = c.task((c) => c.suspend(Promise.resolve(10)));
      await settle();

      let result = null;
      c.effect((c) => {
        result = c.pending(taskA);
      });
      expect(result).toBe(false);
    });

    test("subscribes to the task: effect re-runs on settle", async () => {
      let resolve;
      const taskA = c.task((c) => {
        return c.suspend(new Promise((r) => { resolve = r; }));
      });
      let runs = 0;
      let observed = null;

      c.effect((c) => {
        runs++;
        if (c.pending(taskA)) {
          return;
        }
        observed = c.val(taskA);
      });

      expect(runs).toBe(1);
      expect(observed).toBe(null);

      resolve(42);
      await settle();

      expect(runs).toBe(2);
      expect(observed).toBe(42);
    });

    test("works with array of tasks", async () => {
      let resolveA, resolveB;
      const taskA = c.task((c) => c.suspend(new Promise((r) => { resolveA = r; })));
      const taskB = c.task((c) => c.suspend(new Promise((r) => { resolveB = r; })));

      let runs = 0;
      let observed = null;

      c.effect((c) => {
        runs++;
        if (c.pending([taskA, taskB])) {
          return;
        }
        observed = c.val(taskA) + c.val(taskB);
      });

      expect(runs).toBe(1);
      expect(observed).toBe(null);

      resolveA(10);
      await settle();
      /** Still pending because taskB is loading. */
      expect(runs).toBe(2);
      expect(observed).toBe(null);

      resolveB(20);
      await settle();
      expect(runs).toBe(3);
      expect(observed).toBe(30);
    });

    test("task stays pull-based when no promise waiters", async () => {
      const s1 = signal(1);
      let taskRuns = 0;

      const taskA = c.task((c) => {
        taskRuns++;
        return c.suspend(Promise.resolve(c.val(s1) * 10));
      });
      await settle();
      expect(taskRuns).toBe(1);
      expect(taskA.get()).toBe(10);

      /** Change dep but don't read taskA — should NOT re-run (pull). */
      s1.set(2);
      await tick();
      expect(taskRuns).toBe(1);

      /** Reading it pulls the update. */
      taskA.get();
      await settle();
      expect(taskRuns).toBe(2);
      expect(taskA.get()).toBe(20);
    });

    test("task does not re-run until a spawn conditionally reads it", async () => {
      const toggle = signal(false);
      const source = signal(1);
      let taskRuns = 0;

      const task1 = c.task((cx) => {
        taskRuns++;
        return cx.suspend(Promise.resolve(cx.val(source) * 10));
      }, 0);
      await settle();

      /** Task ran once on creation — that's expected. */
      expect(taskRuns).toBe(1);
      expect(task1.get()).toBe(10);

      /** Invalidate the task's dep while no one reads it. */
      source.set(2);
      await settle();
      expect(taskRuns).toBe(1);

      /** Spawn only reads task1 when toggle is true. */
      let observed = -1;
      c.spawn(async (cx) => {
        if (cx.val(toggle)) {
          observed = await cx.suspend(task1);
        }
      });
      await settle();
      expect(observed).toBe(-1);

      /** Flip the toggle — spawn now reads the task, pulling it. */
      toggle.set(true);
      await settle();

      expect(taskRuns).toBe(2);
      expect(observed).toBe(20);
    });

    test("task stops running when spawn stops reading it", async () => {
      const toggle = signal(true);
      const source = signal(1);
      let taskRuns = 0;

      const task1 = c.task((cx) => {
        taskRuns++;
        return cx.suspend(Promise.resolve(cx.val(source) * 10));
      }, 0);

      let observed = 0;
      c.spawn(async (cx) => {
        if (cx.val(toggle)) {
          observed = await cx.suspend(task1);
        }
      });
      await settle();
      expect(taskRuns).toBe(1);
      expect(observed).toBe(10);

      /** Stop reading the task. */
      toggle.set(false);
      await settle();

      /** Change the task's dep — it should NOT re-run (nobody reads it). */
      let before = taskRuns;
      source.set(2);
      await settle();
      expect(taskRuns).toBe(before);
    });

    test("unread task does not re-fire network-like work", async () => {
      const dep = signal("a");
      let fetches = 0;

      const task1 = c.task((cx) => {
        let val = cx.val(dep);
        fetches++;
        return cx.suspend(Promise.resolve(val));
      }, "");
      await settle();

      /** Initial creation fires once. */
      expect(fetches).toBe(1);
      expect(task1.get()).toBe("a");

      /** No one reads task1 — subsequent changes should not re-fire. */
      dep.set("b");
      dep.set("c");
      await settle();
      expect(fetches).toBe(1);

      /** Pull it — only one fetch for current value. */
      task1.get();
      await settle();
      expect(fetches).toBe(2);
      expect(task1.get()).toBe("c");
    });
  });
});
