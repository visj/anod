import assert from 'assert';
import { root, batch, data, compute, effect, cleanup, value } from './helper/zorn.js';

describe("mayupdate", function () {
  it("does not trigger downstream computations unless changed", function () {
    root(function () {
      var d1 = data(1);
      var order = '';
      var t1 = compute(function () {
        order += 't1';
        return d1.val;
      });
      effect(function () {
        order += 'c1';
        t1.val;
      });
      assert.equal(order, 't1c1');
      order = '';
      d1.val = 1;
      assert.equal(order, 't1');
      order = '';
      d1.val++
      assert.equal(order, 't1c1');
    });
  });

  it("updates downstream pending nodes", function () {
    root(function () {
      var d1 = value(0);
      var d2 = value(0);
      var order = '';
      var t1 = compute(function () {
        order += 't1';
        return d1.val === 0;
      });
      effect(function () {
        order += 'c1';
        return d1.val;
      });
      effect(function () {
        order += 'e1';
        t1.val;
        effect(function () {
          cleanup(function () {
            order += 'e[c]2_1';
          });
          order += 'e2_1';
          return d2.val;
        });
      });
      order = '';
      d1.val = 1;
      assert.equal(order, 't1e[c]2_1c1e1e2_1');
    });
  });

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
      assert.equal(order, 't1c1c2');
      order = '';
      d1.val++;
      assert.equal(order, 't1c1');
    });
  });

  it("updates if dependent on both tracing and non-tracing node", function() {
    root(function() {
      var d1 = value(0);
      var count = 0;
      var t1 = compute(function() {
        return d1.val;
      });
      var c1 = compute(function() {
        return d1.val;
      });
      var c2 = compute(function() {
        count++;
        return t1.val + c1.val;
      });
      count = 0;
      d1.val++
      assert.equal(count, 1);
      assert.equal(c2.val, 2);
    });
  });

  it("does not update if called while being in mayDispose state", function() {
    root(function() {
      var d1 = value(1);
      var d2 = value(1);
      var count = 0;
      var c1;
      var c2 = compute(function() {
        return d1.val < 2;
      });
      effect(function() {
        d2.val;
        if (c1 !== void 0) {
          c1.val;
        }
      });
      effect(function() {
        c2.val;
        if (c1 === void 0) {
          c1 = compute(function() {
            count++;
            return d2.val;
          });
        }
      });
      d1.val++;
      batch(function() {
        d2.val++;
        d1.val++;
      });
      // c1 is disposed but called from previous effect, should not update
      assert.equal(count, 1);
    })
  })
});