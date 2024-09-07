import { test, assert, Anod } from "../helper/index.js";

/**
 * 
 * @param {Anod} anod 
 */
export function run(anod) {
  test("may dispose", function () {

    test("computation", function () {
      test("does not execute pending disposed nodes", function () {
        anod.root(function () {
          var d1 = anod.value(0);
          var order = '';
          var t1 = anod.compute(function () {
            order += 't1';
            return d1.val();
          });
          anod.compute(function () {
            t1.val();
            order += 'c1';
            if (d1.peek() === 0) {
              anod.compute(function () {
                order += 'c2';
                d1.val();
              });
            }
          });
          assert(order , 't1c1c2');
          order = '';
          d1.update(d1.peek() + 1);
          assert(order , 't1c1');
        });
      });
  
      test("does not update if called while being in mayDispose state", function () {
        anod.root(function () {
          var d1 = anod.value(1);
          var d2 = anod.value(1);
          var count = 0;
          var c1;
          var c2 = anod.compute(function () {
            return d1.val() < 2;
          });
          anod.compute(function () {
            d2.val();
            if (c1 !== void 0) {
              c1.val();
            }
          });
          anod.compute(function () {
            c2.val();
            if (c1 === void 0) {
              c1 = anod.compute(function () {
                count++;
                return d2.val();
              });
            }
          });
          d1.update(d1.peek() + 1);
          anod.batch(function () {
            d2.update(d2.peek() + 1);
            d1.update(d1.peek() + 1);
          });
          // c1 is disposed but called from previous compute, should not update
          assert(count , 1);
        })
      });
    });
  });
}
