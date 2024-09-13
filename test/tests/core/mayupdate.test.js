import { test, assert, Anod } from "../../helper/index.js";

/**
 *
 * @param {Anod} anod
 */
export function run(anod) {
  test("mayupdate", function () {
    test("does not trigger downstream computations unless changed", function () {
      anod.root(function () {
        var d1 = anod.data(1);
        var order = '';
        var t1 = anod.compute(function () {
          order += 't1';
          return d1.val();
        });
        anod.compute(function () {
          order += 'c1';
          t1.val();
        });
        assert(order , 't1c1');
        order = '';
        d1.update(1);
        assert(order , 't1');
        order = '';
        d1.update(d1.peek() + 1);
        assert(order , 't1c1');
      });
    });

    test("updates downstream pending nodes", function () {
      anod.root(function () {
        var d1 = anod.value(0);
        var d2 = anod.value(0);
        var order = '';
        var t1 = anod.compute(function () {
          order += 't1';
          return d1.val() === 0;
        });
        anod.compute(function () {
          order += 'c1';
          return d1.val();
        });
        anod.compute(function () {
          order += 'e1';
          t1.val();
          anod.compute(function () {
            anod.cleanup(function () {
              order += 'e[c]2_1';
            });
            order += 'e2_1';
            return d2.val();
          });
        });
        order = '';
        d1.update(1);
        assert(order , 't1c1e[c]2_1e1e2_1');
      });
    });

    test("updates once if dependent on both tracing and non-tracing node", function() {
      anod.root(function() {
        var d1 = anod.value(0);
        var count = 0;
        var t1 = anod.compute(function() {
          return d1.val();
        }, null);
        var c1 = anod.compute(function() {
          return d1.val();
        });
        var c2 = anod.compute(function() {
          count++;
          return t1.val() + c1.val();
        });
        count = 0;
        d1.update(d1.peek() + 1);
        assert(count , 1);
        assert(c2.val() , 2);
      });
    });

    test("does not update if pending source disposes", function() {
      anod.root(function() {
        var d1 = anod.value(0);
        var d2 = anod.value(0);
        var c1 = anod.compute(function() {
          return d1.val();
        });
        var c2 = anod.compute(function() {
          return c1.val();
        });
        var c3;
        anod.compute(function() {
          c3 = anod.compute(function() {
            return c2.val();
          });
          c1.val();
        });
        var c4 = anod.compute(function() {
          return d2.val();
        });
        var count = 0;
        anod.compute(function() {
          c4.val(); c3.val();
          count++;
        });
        d1.update(d1.peek() + 1);
        assert(count , 1);
      });
    });
  });
}
