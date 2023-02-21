import { test, root, batch, data, compute, effect, dispose, $effect, cleanup, value } from './helper/zorn.js';

describe("may dispose", function () {

  describe("data", function () {
    it("does not propagate change when pending disposed owner disposes", function () {
      root(function (teardown) {
        var d1 = data(0);
        var d2 = data(0);
        var c1 = compute(function () { 
          return d2.val; 
        });
        var count = 0;
        /*
         * If d3 is created inside nested effect, it will be disposed 
         * when parent effect updates.
         */
        var stop = effect(function (_, __, stop) {
          c1.val;
          effect(function () {
            var d3 = data(d1.peek);
            root(function () {
              var c3 = compute(function () {
                d1.val;
                d3.set(d3.peek + 1);
              });
              effect(function () { c3.val; });
              effect(function () {
                d3.val;
                count++;
              });
            });
          });
          return stop;
        });
        count = 0;
        batch(function() {
          d1.set(d1.peek + 1);
          d2.set(d2.peek + 1);
        });
        test.ok(count === 2);
        stop();
        /*
         * In this example however, d3 is created inside parent,
         * so it will not be disposed when the effect updates.
         */
        var d3 = data(d1.peek);
        effect(function () {
          c1.val;
          effect(function () {
            root(function () {
              var c3 = compute(function () {
                d1.val;
                d3.set(d3.peek + 1);
              });
              effect(function () { c3.val; });
              effect(function () {
                d3.val;
                count++;
              });
            });
          });
        });
        count = 0;
        batch(function() {
          d1.set(d1.peek + 1);
          d2.set(d2.peek + 1);
        });
        test.ok(count === 3);
        teardown();
      });
    });
  });

  describe("computation", function () {
    it("does not execute pending disposed nodes", function () {
      root(function () {
        var d1 = value(0);
        var order = '';
        var t1 = compute(function () {
          order += 't1';
          return d1.val;
        });
        effect(function () {
          t1.val;
          order += 'c1';
          if (d1.peek === 0) {
            effect(function () {
              order += 'c2';
              d1.val;
            });
          }
        });
        test.ok(order === 't1c1c2');
        order = '';
        d1.set(d1.peek + 1);
        test.ok(order === 't1c1');
      });
    });

    it("does not update if called while being in mayDispose state", function () {
      root(function () {
        var d1 = value(1);
        var d2 = value(1);
        var count = 0;
        var c1;
        var c2 = compute(function () {
          return d1.val < 2;
        });
        effect(function () {
          d2.val;
          if (c1 !== void 0) {
            c1.val;
          }
        });
        effect(function () {
          c2.val;
          if (c1 === void 0) {
            c1 = compute(function () {
              count++;
              return d2.val;
            });
          }
        });
        d1.set(d1.peek + 1);
        batch(function () {
          d2.set(d2.peek + 1);
          d1.set(d1.peek + 1);
        });
        // c1 is disposed but called from previous effect, should not update
        test.ok(count === 1);
      })
    });
  });
});