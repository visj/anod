import { test, root, compute, value, batch } from "./helper/anod.js";

describe("exceptions within computations", function () {
  it("halt updating", function () {
    root(function () {
      var a = value(false);
      var b = value(1);
      compute(function () {
        if (a.val()) {
          throw new Error();
        }
      });
      var d = compute(function () {
        return b.val();
      });

      test.throws(function () {
        batch(function () {
          a.update(true);
          b.update(2);
        });
      });

      test.equals(b.val(), 2);
      test.equals(d.val(), 2);
    });
  });

  it("leave non-excepted parts of dependency tree intact", function () {
    root(function () {
      var a = value(false);
      var b = value(1);
      compute(function () {
        if (a.val()) {
          throw new Error();
        }
      });
      var d = compute(function () {
        return b.val();
      });

      test.throws(function () {
        batch(function () {
          a.update(true);
          b.update(2);
        });
      });

      test.equals(b.val(), 2);
      test.equals(d.val(), 2);

      b.update(3);

      test.equals(b.val(), 3);
      test.equals(d.val(), 3);
    });
  });

  it("disposes registered computations after exception", function () {
    root(function () {
      var v1 = value(0);
      var order = "";
      try {
        compute(function () {
          v1.val();
          order += "c1";
          compute(function () {
            order += "c2";
            if (v1.val() === 0) {
              throw new Error("");
            }
          });
        });
      } catch (err) {}
      order = "";
      try {
        v1.update(1);
      } catch (err) {}
      test.equals(order, "c1c2");
    });
  });
});
