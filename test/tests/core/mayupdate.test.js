import { test, assert, Anod } from "../../helper/index.js";

/**
 *
 * @param {Anod} anod
 */
export function run(anod) {
  var { data, value, compute, cleanup, effect, root } = anod;
  test("may update", function () {
    test("does not trigger downstream computations unless changed", function () {
      var s1 = data(1);
      var order = "";
      var c1 = compute(function () {
        order += "c1";
        return s1.val();
      });
      var c2 = compute(function () {
        order += "c2";
        return c1.val();
      });
      assert(order, "");
      c2.val();
      assert(order, "c2c1");
      order = "";
      s1.set(1);
      c2.val();
      assert(order, "c1");
      order = "";
      s1.set(s1.peek() + 1);
      c2.val();
      assert(order, "c1c2");
    });

    test("updates downstream pending nodes", function () {
      var s1 = value(0);
      var s2 = value(0);
      var order = "";
      var c1 = compute(function () {
        order += "c1";
        return s1.val() === 0;
      });
      effect(function () {
        c1.val();
        order += "e1";
        effect(function () {
          order += "e2";
          cleanup(function () {
            order += "cl1";
          });
          return s2.val();
        });
      });
      order = "";
      s1.set(1);
      assert(order, "c1cl1e1e2");
    });

    test("does not update if pending source disposes", function () {
      root(function () {
        var s1 = value(0);
        var s2 = value(0);
        var c1 = compute(function () {
          return s1.val();
        });
        var c2 = compute(function () {
          return c1.val();
        });
        var c3;
        effect(function () {
          c3 = compute(function () {
            return c2.val();
          });
          c1.val();
        });
        var c4 = compute(function () {
          return s2.val();
        });
        var count = 0;
        effect(function () {
          count++;
          c4.val();
          c3.val();
        });
        s1.set(s1.peek() + 1);
        assert(count, 1);
      });
    });
  });
}
