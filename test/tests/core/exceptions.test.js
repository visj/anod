import { test, assert, Anod } from "../../helper/index.js";

/**
 *
 * @param {Anod} anod
 */
export function run(anod) {
  var { value, effect, batch } = anod;
  test("exceptions", function () {
    test("throws on error", function () {
      var s1 = value(false);
      var s2 = value(1);
      effect(function () {
        if (s1.val()) {
          throw new Error();
        }
      });
      effect(function () {
        return s2.val();
      });

      assert.throws(function () {
        batch(function () {
          s1.set(true);
          s2.set(2);
        });
      });
      assert(s2.val(), 2);
    });
  });
}
