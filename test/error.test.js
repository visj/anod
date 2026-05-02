import { describe, test, expect } from "#test-runner";
import { signal, root, REFUSE, PANIC, FATAL, c } from "#anod";

const tick = () => Promise.resolve();
const settle = () => tick().then(tick).then(tick);

describe("error types", () => {
  describe("constants", () => {
    test("REFUSE is 1, PANIC is 2, FATAL is 3", () => {
      expect(REFUSE).toBe(1);
      expect(PANIC).toBe(2);
      expect(FATAL).toBe(3);
    });
  });

  describe("c.refuse()", () => {
    test("sets error with type REFUSE without throwing", () => {
      const s1 = signal(1);
      const c1 = c.compute((cx) => {
        let v = cx.val(s1);
        if (v > 10) {
          return cx.refuse("too large");
        }
        return v;
      });
      expect(c1.get()).toBe(1);
      expect(c1.error).toBe(false);

      s1.set(20);
      /** Compute is lazy — must pull to trigger re-run. */
      let caught;
      try {
        c1.get();
      } catch (e) {
        caught = e;
      }
      expect(c1.error).toBe(true);
      expect(c1.get().type).toBe(REFUSE);
      expect(c1.get().error).toBe("too large");
    });

    test("get() returns error POJO when refused", () => {
      const c1 = c.compute((cx) => {
        return cx.refuse("nope");
      });
      expect(c1.error).toBe(true);
      expect(c1.get().type).toBe(REFUSE);
      expect(c1.get().error).toBe("nope");
    });

    test("refuse propagates through bound compute", () => {
      const s1 = signal(0);
      const c1 = c.compute((cx) => {
        let v = cx.val(s1);
        if (v < 0) {
          return cx.refuse("negative");
        }
        return v;
      });
      const c2 = c.compute(c1, (val) => val * 2);
      expect(c2.get()).toBe(0);

      s1.set(-1);
      /** Pull to trigger re-run through the chain. */
      let caught;
      try {
        c2.get();
      } catch (e) {
        caught = e;
      }
      expect(c2.error).toBe(true);
      expect(c2.get().type).toBe(REFUSE);
    });

    test("refuse recovers and compute re-runs on next change", () => {
      const s1 = signal(1);
      const c1 = c.compute((cx) => {
        let v = cx.val(s1);
        if (v > 10) {
          return cx.refuse("too large");
        }
        return v;
      });
      expect(c1.get()).toBe(1);

      s1.set(20);
      try { c1.get(); } catch (e) { }
      expect(c1.error).toBe(true);

      /** Fix the input — error clears, value updates. */
      s1.set(5);
      expect(c1.get()).toBe(5);
      expect(c1.error).toBe(false);
    });
  });

  describe("c.panic()", () => {
    test("get() returns error POJO when panicked", () => {
      const c1 = c.compute((cx) => {
        cx.panic("critical");
      });
      expect(c1.error).toBe(true);
      expect(c1.get().type).toBe(PANIC);
      expect(c1.get().error).toBe("critical");
    });

    test("panic in effect is caught by recover with correct type", () => {
      const s1 = signal(0);
      let recovered = null;
      root((r) => {
        r.recover((err) => {
          recovered = err;
          return true;
        });
        r.effect((cx) => {
          if (cx.val(s1) > 0) {
            cx.panic("effect panic");
          }
        });
      });

      s1.set(1);
      expect(recovered).not.toBeNull();
      expect(recovered.type).toBe(PANIC);
      expect(recovered.error).toBe("effect panic");
    });

    test("panic is distinguishable from fatal in recover", () => {
      const s1 = signal(0);
      let types = [];
      root((r) => {
        r.effect((cx) => {
          cx.recover((err) => {
            types.push(err.type);
            return true;
          });
          let v = cx.val(s1);
          if (v === 1) {
            cx.panic("user panic");
          }
          if (v === 2) {
            throw new Error("unexpected");
          }
        });
      });

      s1.set(1);
      s1.set(0);
      s1.set(2);
      expect(types).toEqual([PANIC, FATAL]);
    });

    test("panic in sync compute produces PANIC type", () => {
      const c1 = c.compute((cx) => {
        cx.panic("sync panic");
      });
      expect(c1.error).toBe(true);
      expect(c1.get().type).toBe(PANIC);
      expect(c1.get().error).toBe("sync panic");
    });
  });

  describe("FATAL (unexpected errors)", () => {
    test("unexpected throw produces FATAL type", () => {
      const c1 = c.compute(() => {
        throw new Error("oops");
      });
      expect(c1.get().type).toBe(FATAL);
      expect(c1.get().error.message).toBe("oops");
    });

    test("throwing non-Error produces FATAL wrapping the value", () => {
      const c1 = c.compute(() => {
        throw "string error";
      });
      expect(c1.get().type).toBe(FATAL);
      expect(c1.get().error).toBe("string error");
    });

    test("FATAL in effect goes to recover", () => {
      const s1 = signal(0);
      let recovered = null;
      root((r) => {
        r.recover((err) => {
          recovered = err;
          return true;
        });
        r.effect((cx) => {
          if (cx.val(s1) > 0) {
            throw new Error("crash");
          }
        });
      });

      s1.set(1);
      expect(recovered.type).toBe(FATAL);
      expect(recovered.error.message).toBe("crash");
    });
  });

  describe("recover can filter by type", () => {
    test("recover ignores REFUSE/PANIC but handles FATAL", () => {
      const s1 = signal(0);
      let fatals = 0;
      let others = 0;
      root((r) => {
        r.effect((cx) => {
          cx.recover((err) => {
            if (err.type === FATAL) {
              fatals++;
            } else {
              others++;
            }
            return true;
          });
          let v = cx.val(s1);
          if (v === 1) {
            cx.panic("user error");
          }
          if (v === 2) {
            throw new Error("system crash");
          }
        });
      });

      s1.set(1);
      s1.set(0);
      s1.set(2);
      expect(fatals).toBe(1);
      expect(others).toBe(1);
    });
  });
});
