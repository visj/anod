import { test, assert, context, Anod } from "../../helper/index.js";

/**
 *
 * @param {Anod} anod
 */
export function run(anod) {
  if (global.gc) {
    var { value, compute } = anod;

    function collect(callback) {
      setTimeout(function() {
        global.gc();
        callback();
      });
    }

    test("garbage collection", function () {

      test("should not be collected when referenced", function () {
        var s1 = value(1);
        var ref = new WeakRef(
          compute(function () {
            s1.val();
          }),
        );
        // Bind dependencies
        ref.deref().val();
        var restore = context();
        collect(function() {
          restore(function() {
            assert(ref.deref() !== void 0, true);
          })
        });
      });

      test("should be collected when disposed", function () {
        var s1 = anod.value(1);
        var c1 = new WeakRef(
          compute(function () {
            s1.val();
          }),
        );
        c1.deref().val();
        s1.dispose();
        var restore = context();
        collect(function() {
          restore(function() {
            assert(c1.deref(), void 0);
          });
        })
      });

      test("should be collected when only referenced locally", function () {
        function local() {
          var s1 = new WeakRef(value(1));
          var c1 = new WeakRef(
            compute(function () {
              return s1.deref().val();
            }),
          );
          return { s1, c1 };
        }
        var { s1, c1 } = local();
        assert(c1.deref().val(), 1);
        s1.deref().dispose();
        var restore = context();
        collect(function() {
          restore(function() {
            assert(s1.deref(), void 0);
            assert(c1.deref(), void 0);
          });
        });
      });
    });
  }
}
