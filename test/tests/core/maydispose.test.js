import { test, assert, Anod } from "../../helper/index.js";

/**
 *
 * @param {Anod} anod
 */
export function run(anod) {
  var { value, compute, batch, effect } = anod;
  test("may dispose", function () {
    test("computation", function () {
      test("does not execute pending disposed nodes", function () {
        var s1 = value(0);
        var order = "";
        var c1 = compute(function () {
          order += "c1";
          return s1.val();
        });
        var c3;
        effect(function () {
          order += "e1";
          if (c3) {
            c3.val();
          }
          s1.val();
        })
        effect(function () {
          c1.val();
          order += "e2";
          if (s1.peek() === 0) {
            c3 = compute(function () {
              order += "c3";
              s1.val();
            });
          }
        });
        assert(order, "e1c1e2");
        order = "";
        s1.set(1);
        assert(order, "c1e1e2");
      });

      test("does not update if called while being in may dispose state", function () {
        var s1 = value(1);
        var s2 = value(1);
        var count = 0;
        var c1;
        var c2 = compute(function () {
          return s1.val() < 2;
        });
        compute(function () {
          s2.val();
          if (c1 !== void 0) {
            c1.val();
          }
        });
        effect(function () {
          c2.val();
          if (c1 === void 0) {
            c1 = compute(function () {
              count++;
              return s2.val();
            });
          }
        });
        c1.val();
        s1.set(1);
        anod.batch(function () {
          s2.set(1);
          s1.set(2);
        });
        // c1 is disposed but called from previous compute, should not update
        c1.val();
        assert(count, 1);
      });
    });
  });
}
