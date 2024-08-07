import { test, root, data, compute, cleanup, value } from './helper/anod.js';

describe("mayupdate", function () {
  it("does not trigger downstream computations unless changed", function () {
    root(function () {
      var d1 = data(1);
      var order = '';
      var t1 = compute(function () {
        order += 't1';
        return d1.val();
      });
      compute(function () {
        order += 'c1';
        t1.val();
      });
      test.equals(order , 't1c1');
      order = '';
      d1.update(1);
      test.equals(order , 't1');
      order = '';
      d1.update(d1.peek() + 1);
      test.equals(order , 't1c1');
    });
  });

  it("updates downstream pending nodes", function () {
    root(function () {
      var d1 = value(0);
      var d2 = value(0);
      var order = '';
      var t1 = compute(function () {
        order += 't1';
        return d1.val() === 0;
      });
      compute(function () {
        order += 'c1';
        return d1.val();
      });
      compute(function () {
        order += 'e1';
        t1.val();
        compute(function () {
          cleanup(function () {
            order += 'e[c]2_1';
          });
          order += 'e2_1';
          return d2.val();
        });
      });
      order = '';
      d1.update(1);
      test.equals(order , 't1c1e[c]2_1e1e2_1');
    });
  });

  it("updates once if dependent on both tracing and non-tracing node", function() {
    root(function() {
      var d1 = value(0);
      var count = 0;
      var t1 = compute(function() {
        return d1.val();
      }, null);
      var c1 = compute(function() {
        return d1.val();
      });
      var c2 = compute(function() {
        count++;
        return t1.val() + c1.val();
      });
      count = 0;
      d1.update(d1.peek() + 1);
      test.equals(count , 1);
      test.equals(c2.val() , 2);
    });
  });

  it("does not update if pending source disposes", function() {
    root(function() {
      var d1 = value(0);
      var d2 = value(0);
      var c1 = compute(function() {
        return d1.val();
      });
      var c2 = compute(function() {
        return c1.val();
      });
      var c3;
      compute(function() {
        c3 = compute(function() {
          return c2.val();
        });
        c1.val();
      });
      var c4 = compute(function() {
        return d2.val();
      });
      var count = 0;
      compute(function() {
        c4.val(); c3.val();
        count++;
      });
      d1.update(d1.peek() + 1);
      test.equals(count , 1);
    });
  });

});