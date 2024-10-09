import { test } from "../../helper/index.js";
import { value, effect, compute, cleanup, root, batch } from "../../../build/index.js";

test("effect", function (t) {
  t.test("that modifies signals", function (t) {
    t.test("batch data while executing computation", function (t) {
      var s1 = value(false);
      var s2 = value(0);
      var v1;
      effect(function () {
        if (s1.val()) {
          s2.set(1);
          v1 = s2.val();
          s1.set(false);
        }
      });
      s1.set(true);
      t.assert(s2.val(), 1);
      t.assert(v1, 0);
    });
    t.test("throws when continually setting a direct dependency", function (t) {
      var s1 = value(1);
      t.throws(function () {
        effect(function () {
          s1.val();
          s1.set(s1.peek() + 1);
        });
      });
    });
    t.test("throws when continually setting an indirect dependency", function (t) {
      var s1 = value(1);
      var c1 = compute(function () {
        return s1.val();
      });
      var c2 = compute(function () {
        return c1.val();
      });
      var c3 = compute(function () {
        return c2.val();
      });
      t.throws(function () {
        effect(function () {
          c3.val();
          s1.set(s1.peek() + 1);
        });
      });
    });
    t.test("throws on error", function (t) {
      var s1 = value(false);
      var s2 = value(1);
      effect(function () {
        if (s1.val()) {
          throw new Error();
        }
      });
      effect(function () {
        s2.val();
      });

      t.throws(function () {
        batch(function () {
          s1.set(true);
          s2.set(2);
        });
      });
      t.assert(s2.val(), 2);
    });

    t.test("batch data while propagating", function (t) {
      var s1 = value(false);
      var s2 = value(0);
      var v1;
      var seq = "";
      effect(function () {
        if (s1.val()) {
          seq += "c1";
          s2.set(1);
          s1.set(false);
        }
      });
      effect(function () {
        if (s1.val()) {
          seq += "c2";
          v1 = s2.val();
        }
      });
      seq = "";
      s1.set(true);
      t.assert(seq, "c1c2");
      t.assert(s2.val(), 1);
      t.assert(v1, 0);
    });
    t.test("continue running until changes stop", function (t) {
      var seq = "";
      var s1 = value(0);
      effect(function () {
        seq += s1.val();
        if (s1.val() < 10) {
          s1.set(s1.peek() + 1);
        }
      });
      t.assert(seq, "012345678910");
      t.assert(s1.val(), 10);
    });
  });

  t.test("propagate changes topologically", function (t) {
    var seq = "";
    var s1 = value(0);
    var s2 = value(0);
    var c1 = compute(function () {
      seq += "c1";
      return s1.val();
    });
    effect(function () {
      seq += "e1";
      s2.set(s1.val());
    });
    var c2 = compute(function () {
      seq += "c2";
      return s2.val();
    });
    effect(function () {
      seq += "e2s2{" + s2.val() + "}";
      c1.val();
    });
    effect(function () {
      seq += "e3s2{" + s2.val() + "}";
      c2.val();
    });
    seq = "";
    s1.set(1);
    t.assert(seq, "c1e1e2s2{0}c2e2s2{1}e3s2{1}");
  });

  t.test("cleanup", function (t) {
    t.test("is called when effect is updated", function (t) {
      var s1 = value(1);
      var count = 0;
      effect(function () {
        s1.val();
        cleanup(function () {
          count++;
        });
      });
      t.assert(count, 0);
      s1.set(2);
      t.assert(count, 1);
    });

    t.test("can be called from within a subcomputation", function (t) {
      var s1 = value(1);
      var calls = 0;
      effect(function () {
        s1.val();
        effect(function () {
          cleanup(function () {
            calls++;
          });
        });
      });
      t.assert(calls, 0);
      s1.set(2);
      t.assert(calls, 1);
    });

    t.test("accepts multiple cleanup functions", function (t) {
      var s1 = value(1);
      var calls = 0;
      effect(function () {
        s1.val();
        cleanup(function () {
          calls++;
        });
        cleanup(function () {
          calls++;
        });
      });
      t.assert(calls, 0);
      s1.set(2);
      t.assert(calls, 2);
    });

    t.test("runs cleanups in reverse order", function (t) {
      var s1 = value(1);
      var seq = "";
      effect(function () {
        s1.val();
        cleanup(function () {
          seq += "cl1";
        });
        cleanup(function () {
          seq += "cl2";
        });
      });
      t.assert(seq, "");
      s1.set(2);
      t.assert(seq, "cl2cl1");
    });

    t.test("is run only once when a computation is disposed", function (t) {
      var s1 = value(1);
      var calls = 0;
      var r1 = root(function () {
        effect(function () {
          s1.val();
          cleanup(function () {
            calls++;
          });
        });
        t.assert(calls, 0);
        s1.set(s1.peek() + 1);
        t.assert(calls, 1);
      });
      r1.dispose();
      t.assert(calls, 2);
      s1.set(s1.peek() + 1);
      t.assert(calls, 2);
    });
  });
});