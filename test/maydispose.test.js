import { test, root, batch, data, compute, value } from './helper/anod.js';

describe("may dispose", function () {

  describe("computation", function () {
    it("does not execute pending disposed nodes", function () {
      root(function () {
        var d1 = value(0);
        var order = '';
        var t1 = compute(function () {
          order += 't1';
          return d1.val();
        });
        compute(function () {
          t1.val();
          order += 'c1';
          if (d1.peek() === 0) {
            compute(function () {
              order += 'c2';
              d1.val();
            });
          }
        });
        test.equals(order , 't1c1c2');
        order = '';
        d1.update(d1.peek() + 1);
        test.equals(order , 't1c1');
      });
    });

    it("does not update if called while being in mayDispose state", function () {
      root(function () {
        var d1 = value(1);
        var d2 = value(1);
        var count = 0;
        var c1;
        var c2 = compute(function () {
          return d1.val() < 2;
        });
        compute(function () {
          d2.val();
          if (c1 !== void 0) {
            c1.val();
          }
        });
        compute(function () {
          c2.val();
          if (c1 === void 0) {
            c1 = compute(function () {
              count++;
              return d2.val();
            });
          }
        });
        d1.update(d1.peek() + 1);
        batch(function () {
          d2.update(d2.peek() + 1);
          d1.update(d1.peek() + 1);
        });
        // c1 is disposed but called from previous compute, should not update
        test.equals(count , 1);
      })
    });
  });
});