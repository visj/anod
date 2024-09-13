import { test, assert, Anod } from "../../helper/index.js";

/**
 *
 * @param {Anod} anod
 */
export function run(anod) {
  test("exceptions within computations", function () {
    test("halt updating", function () {
      anod.root(function () {
        var a = anod.value(false);
        var b = anod.value(1);
        anod.compute(function () {
          if (a.val()) {
            throw new Error();
          }
        });
        var d = anod.compute(function () {
          return b.val();
        });

        assert.throws(function () {
          anod.batch(function () {
            a.update(true);
            b.update(2);
          });
        });

        assert(b.val(), 2);
        assert(d.val(), 2);
      });
    });

    test("leave non-excepted parts of dependency tree intact", function () {
      anod.root(function () {
        var a = anod.value(false);
        var b = anod.value(1);
        anod.compute(function () {
          if (a.val()) {
            throw new Error();
          }
        });
        var d = anod.compute(function () {
          return b.val();
        });

        assert.throws(function () {
          anod.batch(function () {
            a.update(true);
            b.update(2);
          });
        });

        assert(b.val(), 2);
        assert(d.val(), 2);

        b.update(3);

        assert(b.val(), 3);
        assert(d.val(), 3);
      });
    });

    test("disposes registered computations after exception", function () {
      anod.root(function () {
        var v1 = anod.value(0);
        var order = "";
        try {
          anod.compute(function () {
            v1.val();
            order += "c1";
            anod.compute(function () {
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
        assert(order, "c1c2");
      });
    });
  });
}
