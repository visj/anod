import { test, assert, Anod } from "../../helper/index.js";

/**
 *
 * @param {Anod} anod
 */
export function run(anod) {
  test("may update", function () {
    test("does not trigger downstream computations unless changed", function () {
      var d1 = anod.data(1);
      var order = "";
      var c1 = anod.compute(function () {
        order += "c1";
        return d1.val();
      });
      var c2 = anod.compute(function () {
        order += "c2";
        return c1.val();
      });
      assert(order, "");
      c2.val();
      assert(order, "c2c1");
      order = "";
      d1.set(1);
      c2.val();
      assert(order, "c1");
      order = "";
      d1.set(d1.peek() + 1);
      c2.val();
      assert(order, "c1c2");
    });

    test("updates downstream pending nodes", function () {
      var d1 = anod.value(0);
      var d2 = anod.value(0);
      var order = "";
      var c1 = anod.compute(function () {
        order += "c1";
        return d1.val() === 0;
      });
      anod.effect(function () {
        c1.val();
        order += "e1";
        anod.effect(function () {
          order += "e2";
          anod.cleanup(function () {
            order += "cl1";
          });
          return d2.val();
        });
      });
      order = "";
      d1.set(1);
      assert(order, "c1cl1e1e2");
    });

    test("does not update if pending source disposes", function () {
      anod.root(function () {
        var d1 = anod.value(0);
        var d2 = anod.value(0);
        var c1 = anod.compute(function () {
          return d1.val();
        });
        var c2 = anod.compute(function () {
          return c1.val();
        });
        var c3;
        anod.effect(function () {
          c3 = anod.compute(function () {
            return c2.val();
          });
          c1.val();
        });
        var c4 = anod.compute(function () {
          return d2.val();
        });
        var count = 0;
        anod.effect(function () {
          count++;
          c4.val();
          c3.val();
        });
        d1.set(d1.peek() + 1);
        assert(count, 1);
      });
    });
  });
}
