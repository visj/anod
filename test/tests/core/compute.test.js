import { test } from "../../helper/index.js";
import {
  value,
  compute,
  Signal,
  ReadonlySignal
} from "../../../build/index.js";

test("compute", function (t){
  t.test("returns initial value of wrapped function", function (t){
    var c1 = compute(function () {
      return 1;
    });
    t.equal(c1.val(), 1);
  });

  t.test("does not run until read", function (t){
    var calls = 0;
    var c1 = compute(function () {
      calls++;
    });
    t.equal(calls, 0);
    c1.val();
    t.equal(calls, 1);
  });

  t.test("does not re-occur when read", function (t){
    var count = 0;
    var c1 = compute(function () {
      count++;
    });
    c1.val();
    c1.val();
    c1.val();
    t.equal(count, 1);
  });

  t.test("with a dependency on signal", function (t){
    t.test("updates when data is set", function (t){
      var s1 = value(1);
      var count = 0;
      var c1 = compute(function () {
        count++;
        return s1.val();
      });
      count = 0;
      s1.set(2);
      t.equal(c1.val(), 2);
      t.equal(count, 1);
    });

    t.test("does not update when data is read", function (t){
      var s1 = value(1);
      var count = 0;
      compute(function () {
        count++;
        return s1.val();
      });
      count = 0;
      s1.val();
      t.equal(count, 0);
    });

    t.test("updates return value", function (t){
      var s1 = value(1);
      var c1 = compute(function () {
        return s1.val();
      });
      s1.set(2);
      t.equal(c1.val(), 2);
    });
  });

  t.test("with changing dependencies", function (t){
    /** @type {Signal<boolean>} */
    var s1;
    /** @type {Signal<number>} */
    var s2;
    /** @type {Signal<number>} */
    var s3;
    /** @type {ReadonlySignal<number>} */
    var c1;
    /** @type {number} */
    var count;

    function init() {
      s1 = value(true);
      s2 = value(1);
      s3 = value(2);
      c1 = compute(function () {
        count++;
        return s1.val() ? s2.val() : s3.val();
      }, { stable: true });
      count = 0;
    }

    t.test("updates on active dependencies", function (t){
      init();
      s2.set(5);
      t.equal(c1.val(), 5);
      t.equal(count, 1);
    });

    t.test("does not update on inactive dependencies", function (t){
      init();
      s3.set(5);
      t.equal(count, 0);
      t.equal(c1.val(), 1);
    });

    t.test("deactivates obsolete dependencies", function (t){
      init();
      s1.set(false);
      count = 0;
      s2.set(5);
      t.equal(count, 0);
    });

    t.test("activates new dependencies", function (t){
      init();
      s1.set(false);
      count = 0;
      s3.set(5);
      c1.val();
      t.equal(count, 1);
    });
  });

  t.test("does not register dependency when creating signals", function (t){
    /** @type {Signal<number>} */
    var s1;
    var count = 0;
    var c1 = compute(function () {
      count++;
      s1 = value(1);
    });
    c1.val();
    count = 0;
    s1.set(2);
    c1.val();
    t.equal(count, 0);
  });

  t.test("returns undefined from void function", function (t){
    var c1 = compute(function () { });
    t.equal(c1.val(), void 0);
  });

  t.test("with a dependency on a computation", function (t){
    /** @type {Signal<number>} */
    var s1;
    /** @type {ReadonlySignal<number>} */
    var c1;
    /** @type {ReadonlySignal<number>} */
    var c2;
    /** @type {number} */
    var countOne;
    /** @type {number} */
    var countTwo;

    function init() {
      s1 = value(1);
      countOne = 0;
      c1 = compute(function () {
        countOne++;
        return s1.val();
      });
      countTwo = 0;
      c2 = compute(function () {
        countTwo++;
        return c1.val();
      });
    }

    t.test("does not cause re-evaluation", function (t){
      init();
      c2.val();
      t.equal(countOne, 1);
    });

    t.test("does not occur from a read", function (t){
      init();
      c1.val();
      t.equal(countTwo, 0);
    });

    t.test("does not occur from a read of the watcher", function (t){
      init();
      c2.val();
      t.equal(countTwo, 1);
    });

    t.test("occurs when computation updates", function (t){
      init();
      s1.set(2);
      t.equal(c2.val(), 2);
      t.equal(countOne, 1);
      t.equal(countTwo, 1);
    });
  });

  t.test("with circular dependencies", function (t){
    t.test("throws when cycle created by modifying a branch", function (t){
      var s1 = value(1);
      var c1 = compute(function () {
        return c1 ? c1.val() : s1.val();
      });
      t.throws(function () {
        s1.set(0);
        c1.val();
      });
    });
  });

  t.test("with converging dependencies", function (t){
    t.test("propagates in topological order", function (t){
      //
      //     c1
      //    /  \
      //   /    \
      //  b1     b2
      //   \    /
      //    \  /
      //     a1
      //
      var order = "";
      var s1 = value(0);
      var c1 = compute(function () {
        order += "c1";
        return s1.val();
      });
      var c2 = compute(function () {
        order += "c2";
        return s1.val();
      });
      var c3 = compute(function () {
        c1.val(), c2.val();
        order += "c3";
      });
      order = "";
      s1.set(s1.peek() + 1);
      c3.val();
      t.equal(order, "c1c2c3");
    });

    t.test("only propagates once with linear convergences", function (t){
      //         d
      //         |
      // +---+---+---+---+
      // v   v   v   v   v
      // f1  f2  f3  f4  f5
      // |   |   |   |   |
      // +---+---+---+---+
      //         v
      //         g
      var s1 = value(0);
      var c1 = compute(function () {
        return s1.val();
      });
      var c2 = compute(function () {
        return s1.val();
      });
      var c3 = compute(function () {
        return s1.val();
      });
      var c4 = compute(function () {
        return s1.val();
      });
      var c5 = compute(function () {
        return s1.val();
      });
      var count = 0;
      var c6 = compute(function () {
        count++;
        return c1.val() + c2.val() + c3.val() + c4.val() + c5.val();
      });
      count = 0;
      s1.set(s1.peek() + 1);
      c6.val();
      t.equal(count, 1);
    });

    t.test("only propagates once with exponential convergence", function (t){
      //     d
      //     |
      // +---+---+
      // v   v   v
      // c1  c2 c3
      //   \ | /
      //     O
      //   / | \
      // v   v   v
      // c4  c5  c6
      // +---+---+
      //     v
      //     h
      var s1 = value(0);
      var c1 = compute(function () {
        return s1.val();
      });
      var c2 = compute(function () {
        return s1.val();
      });
      var c3 = compute(function () {
        return s1.val();
      });
      var c4 = compute(function () {
        return c1.val() + c2.val() + c3.val();
      });
      var c5 = compute(function () {
        return c1.val() + c2.val() + c3.val();
      });
      var c6 = compute(function () {
        return c1.val() + c2.val() + c3.val();
      });

      var count = 0;
      var c7 = compute(function () {
        count++;
        return c4.val() + c5.val() + c6.val();
      });

      count = 0;
      s1.set(s1.peek() + 1);
      c7.val();
      t.equal(count, 1);
    });
  });
});