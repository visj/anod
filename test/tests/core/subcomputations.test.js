import { test, assert, Anod } from "../../helper/index.js";

/**
 *
 * @param {Anod} anod
 */
export function run(anod) {
  test("subcomputations", function () {
    test("does not register a dependency on the subcomputation", function () {
      anod.root(function () {
        var d = anod.value(1);
        var outerCount = 0;
        var innerCount = 0;
        function outerCounter() {
          outerCount++;
        }
        function innerCounter() {
          innerCount++;
        }
        anod.effect(function () {
          outerCounter();
          anod.effect(function () {
            innerCounter();
            return d.val();
          });
        });

        outerCount = innerCount = 0;

        d.update(2);

        assert(innerCount, 1);
        assert(outerCount, 0);
      });
    });

    test("with child", function () {
      var d, e, g, h, outerCount, outerCounter, innerCount, innerCounter;

      function init() {
        d = anod.value(1);
        e = anod.value(2);
        outerCount = innerCount = 0;
        outerCounter = function () {
          outerCount++;
        };
        innerCounter = function () {
          innerCount++;
        };
        anod.effect(function () {
          outerCounter();
          d.val();
          g = anod.compute(function () {
            innerCounter();
            return e.val();
          });
        });
        h = g;
        h.val();
      }

      test("creates child on intestialization", function () {
        anod.root(function () {
          init();
          assert(h.val(), 2);
        });
      });

      test("does not depend on child's dependencies", function () {
        anod.root(function () {
          init();
          e.update(3);
          assert(outerCount, 1);
          assert(innerCount, 2);
        });
      });

      test("disposes child when test is disposed", function () {
        var r1 = anod.root(function () {
          init();
        });
        r1.dispose();
        e.update(3);
        assert(g.val(), null);
      });
    });
  });
}
