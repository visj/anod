import { test, root, dispose, compute, value } from "./helper/anod.js";

describe("dispose", function () {
  describe("root", function () {
    it("disables updates and sets computation's value to null", function () {
      var calls, s1, c1;
      root(function (teardown) {
        calls = 0;
        s1 = value(0);

        c1 = compute(function () {
          calls++;
          return s1.val();
        });

        test.equals(calls, 1);
        test.equals(c1.val(), 0);

        s1.update(1);

        test.equals(calls, 2);
        test.equals(c1.val(), 1);

        teardown();
        s1.update(2);

        test.equals(calls, 2);
        test.equals(c1.val(), null);
      });
    });

    it("works from the body of its own computation", function () {
      var calls, s1;
      root(function (teardown) {
        calls = 0;
        s1 = value(0);
        compute(function () {
          calls++;
          if (s1.val()) {
            teardown();
          }
          s1.val();
        });

        test.equals(calls, 1);
        s1.update(1);
        test.equals(calls, 2);
        s1.update(2);
        test.equals(calls, 2);
      });
    });

    it("works from the body of a subcomputation", function () {
      var calls, s1;
      root(function (teardown) {
        calls = 0;
        s1 = value(0);
        compute(function () {
          calls++;
          s1.val();
          compute(function () {
            if (s1.val()) {
              teardown();
            }
          });
        });

        test.equals(calls, 1);

        s1.update(1);
        test.equals(calls, 2);
        s1.update(2);
        test.equals(calls, 2);
      });
    });
  });

  describe("computations", function () {
    it("persists through cycle when manually disposed", function () {
      root(function () {
        var s1 = value(0);
        var c1 = compute(function () {
          return s1.val();
        });
        var count = 0;
        compute(function () {
          compute(function () {
            if (s1.val() > 0) {
              dispose(c1);
            }
          });
          compute(function () {
            count += c1.val();
          });
        });
        s1.update(s1.peek() + 1);
        s1.update(s1.peek() + 1);
        test.equals(count, 1);
      });
    });

    it("ignores multiple calls to dispose", function () {
      root(function () {
        var s1 = value(0);
        var c1 = compute(function () {
          return s1.val();
        });
        var count = 0;
        compute(function () {
          compute(function () {
            if (s1.val() > 0) {
              dispose(c1);
              dispose(c1);
              dispose(c1);
            }
          });
          compute(function () {
            count += c1.val();
          });
        });
        s1.update(s1.peek() + 1);
        s1.update(s1.peek() + 1);
        test.equals(count, 1);
      });
    });
  });

  describe("unmount", function () {
    it("does not unmount pending computations with changing dependencies", function () {
      var s1 = value(true);
      var s2 = value(0);
      var s3 = value(0);
      var calls = 0;
      compute(function () {
        if (!s1.val()) {
          dispose(s1);
          dispose(s2);
          s3.update(s3.peek() + 1);
        }
      });
      compute(
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
      test.equals(calls, 2);
    });
  });
});
