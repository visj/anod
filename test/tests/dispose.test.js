import { test, assert, Anod } from "../helper/index.js";

/**
 * 
 * @param {Anod} anod 
 */
export function run(anod) {
  test("dispose", function () {
    test("root", function () {
      test("disables updates and sets computation's value to null", function () {
        var calls, s1, c1;
        anod.root(function (teardown) {
          calls = 0;
          s1 = anod.value(0);
  
          c1 = anod.compute(function () {
            calls++;
            return s1.val();
          });
  
          assert(calls, 1);
          assert(c1.val(), 0);
  
          s1.update(1);
  
          assert(calls, 2);
          assert(c1.val(), 1);
  
          teardown();
          s1.update(2);
  
          assert(calls, 2);
          assert(c1.val(), null);
        });
      });
  
      test("works from the body of tests own computation", function () {
        var calls, s1;
        anod.root(function (teardown) {
          calls = 0;
          s1 = anod.value(0);
          anod.compute(function () {
            calls++;
            if (s1.val()) {
              teardown();
            }
            s1.val();
          });
  
          assert(calls, 1);
          s1.update(1);
          assert(calls, 2);
          s1.update(2);
          assert(calls, 2);
        });
      });
  
      test("works from the body of a subcomputation", function () {
        var calls, s1;
        anod.root(function (teardown) {
          calls = 0;
          s1 = anod.value(0);
          anod.compute(function () {
            calls++;
            s1.val();
            anod.compute(function () {
              if (s1.val()) {
                teardown();
              }
            });
          });
  
          assert(calls, 1);
  
          s1.update(1);
          assert(calls, 2);
          s1.update(2);
          assert(calls, 2);
        });
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
          anod.compute(function () {
            anod.compute(function () {
              if (s1.val() > 0) {
                anod.dispose(c1);
              }
            });
            anod.compute(function () {
              count += c1.val();
            });
          });
          s1.update(s1.peek() + 1);
          s1.update(s1.peek() + 1);
          assert(count, 1);
        });
      });
  
      test("ignores multiple calls to dispose", function () {
        anod.root(function () {
          var s1 = anod.value(0);
          var c1 = anod.compute(function () {
            return s1.val();
          });
          var count = 0;
          anod.compute(function () {
            anod.compute(function () {
              if (s1.val() > 0) {
                anod.dispose(c1);
                anod.dispose(c1);
                anod.dispose(c1);
              }
            });
            anod.compute(function () {
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
      test("does not unmount pending computations wtesth changing dependencies", function () {
        var s1 = anod.value(true);
        var s2 = anod.value(0);
        var s3 = anod.value(0);
        var calls = 0;
        anod.compute(function () {
          if (!s1.val()) {
            anod.dispose(s1);
            anod.dispose(s2);
            s3.update(s3.peek() + 1);
          }
        });
        anod.compute(
          function () {
            calls++;
            if (s1.val()) {
              s2.val();
            } else {
              s3.val();
            }
          },
          void 0,
          { unstable: true },
        );
        calls = 0;
        s1.update(false);
        assert(calls, 2);
      });
    });
  });
}

