import { test, assert, Anod } from "../../helper/index.js";

/**
 *
 * @param {Anod} anod
 */
export function run(anod) {
  var { value, compute, effect, root } = anod;
  test("dispose", function () {
    test("root", function () {
      test("disables updates and sets computation's value to null", function () {
        var count, s1, c1;
        var r1 = root(function () {
          count = 0;
          s1 = value(0);

          c1 = compute(function () {
            count++;
            return s1.val();
          });

          assert(c1.val(), 0);
          assert(count, 1);

          s1.set(1);

          assert(c1.val(), 1);
          assert(count, 2);
        });
        r1.dispose();
        s1.set(2);

        assert(count, 2);
        assert(c1.val(), null);
      });
    });

    test("computations", function () {
      test("persists through cycle when manually disposed", function () {
        root(function () {
          var s1 = value(0);
          var c1 = compute(function () {
            return s1.val();
          });
          var count = 0;
          effect(function () {
            effect(function () {
              if (s1.val() > 0) {
                c1.dispose();
              }
            });
            effect(function () {
              count += c1.val();
            });
          });
          s1.set(s1.peek() + 1);
          s1.set(s1.peek() + 1);
          assert(count, 1);
        });
      });
    });

    test("unmount", function () {
      test("does not unmount pending computations with changing dependencies", function () {
        var s1 = value(true);
        var s2 = value(0);
        var s3 = value(0);
        var calls = 0;
        effect(function () {
          if (!s1.val()) {
            s1.dispose();
            s2.dispose();
            s3.set(s3.peek() + 1);
          }
        });
        effect(function () {
          calls++;
          if (s1.val()) {
            s2.val();
          } else {
            s3.val();
          }
        }, { unstable: true });
        calls = 0;
        s1.set(false);
        assert(calls, 2);
      });
    });
  });
}
