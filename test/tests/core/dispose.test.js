import { test, assert, Anod } from "../../helper/index.js";

/**
 *
 * @param {Anod} anod
 */
export function run(anod) {
  test("dispose", function () {
    test("root", function () {
      test("disables updates and sets computation's value to null", function () {
        var calls, s1, c1;
        var r1 = anod.root(function () {
          calls = 0;
          s1 = anod.value(0);

          c1 = anod.compute(function () {
            calls++;
            return s1.val();
          });

          assert(c1.val(), 0);
          assert(calls, 1);

          s1.update(1);

          assert(c1.val(), 1);
          assert(calls, 2);
        });
        r1.dispose();
        s1.update(2);

        assert(calls, 2);
        assert(c1.val(), null);
      });
    });

    test("computations", function () {
      test("persists through cycle when manually disposed", function () {
        anod.root(function () {
          var s1 = anod.value(0);
          var c1 = anod.compute(function () {
            return s1.val();
          });
          var count = 0;
          anod.effect(function () {
            anod.effect(function () {
              if (s1.val() > 0) {
                c1.dispose();
              }
            });
            anod.effect(function () {
              count += c1.val();
            });
          });
          s1.update(s1.peek() + 1);
          s1.update(s1.peek() + 1);
          assert(count, 1);
        });
      });
    });

    test("unmount", function () {
      test("does not unmount pending computations with changing dependencies", function () {
        var s1 = anod.value(true);
        var s2 = anod.value(0);
        var s3 = anod.value(0);
        var calls = 0;
        anod.effect(function () {
          if (!s1.val()) {
            s1.dispose();
            s2.dispose();
            s3.update(s3.peek() + 1);
          }
        });
        anod.effect(
          function () {
            calls++;
            if (s1.val()) {
              s2.val();
            } else {
              s3.val();
            }
          },
          { unstable: true },
        );
        calls = 0;
        s1.update(false);
        assert(calls, 2);
      });
    });
  });
}
