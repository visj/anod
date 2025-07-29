import { test } from "../../helper/index.js";
import {
  data,
  value,
  effect,
  compute,
  root,
  cleanup,
  Signal,
  ReadonlySignal
} from "../../../build/index.js";

test("update", function (t) {
  t.test("does not register a dependency on the subcomputation", function (t) {
    root(function () {
      var s1 = value(1);
      var outerCount = 0;
      var innerCount = 0;
      function outerCounter() {
        outerCount++;
      }
      function innerCounter() {
        innerCount++;
      }
      effect(function () {
        outerCounter();
        effect(function () {
          innerCounter();
          s1.val();
        });
      });

      outerCount = innerCount = 0;

      s1.set(2);

      t.equal(innerCount, 1);
      t.equal(outerCount, 0);
    });
  });

  t.test("with child", function (t) {
    /** @type {Signal<number>} */
    var s1;
    /** @type {Signal<number>} */
    var s2;
    /** @type {ReadonlySignal<number>} */
    var c1;
    /** @type {ReadonlySignal<number>} */
    var c2;
    /** @type {number} */
    var outerCount;
    /** @type {function(): void} */
    var outerCounter;
    /** @type {number} */
    var innerCount;
    /** @type {function(): void} */
    var innerCounter;

    function init() {
      s1 = value(1);
      s2 = value(2);
      outerCount = innerCount = 0;
      outerCounter = function () {
        outerCount++;
      };
      innerCounter = function () {
        innerCount++;
      };
      effect(function () {
        outerCounter();
        s1.val();
        c1 = compute(function () {
          innerCounter();
          return s2.val();
        });
      });
      c2 = c1;
      effect(function () {
        c2.val();
      });
    }

    t.test("creates child on initialization", function (t) {
      init();
      t.equal(c2.val(), 2);
    });

    t.test("does not depend on child's dependencies", function () {
      init();
      s2.set(3);
      t.equal(outerCount, 1);
      t.equal(innerCount, 2);
    });

    t.test("disposes child when test is disposed", function (t) {
      var r1 = root(function () {
        init();
      });
      r1.dispose();
      s2.set(3);
      t.equal(c1.val(), null);
    });
  });

  t.test("may update", function (t) {
    t.test("does not trigger downstream computations unless changed", function (t) {
      var s1 = data(1);
      var order = "";
      var c1 = compute(function () {
        order += "c1";
        return s1.val();
      });
      var c2 = compute(function () {
        order += "c2";
        return c1.val();
      });
      t.equal(order, "");
      c2.val();
      t.equal(order, "c2c1");
      order = "";
      s1.set(1);
      c2.val();
      t.equal(order, "c1");
      order = "";
      s1.set(s1.peek() + 1);
      c2.val();
      t.equal(order, "c1c2");
    });

    t.test("updates downstream pending nodes", function (t) {
      var s1 = value(0);
      var s2 = value(0);
      var order = "";
      var c1 = compute(function () {
        order += "c1";
        return s1.val() === 0;
      });
      effect(function () {
        c1.val();
        order += "e1";
        effect(function () {
          order += "e2";
          cleanup(function () {
            order += "cl1";
          });
          s2.val();
        });
      });
      order = "";
      s1.set(1);
      t.equal(order, "c1cl1e1e2");
    });

    t.test("does not update if pending source disposes", function (t) {
      root(function () {
        var s1 = value(0);
        var s2 = value(0);
        var c1 = compute(function () {
          return s1.val();
        });
        var c2 = compute(function () {
          return c1.val();
        });
        var c3;
        effect(function () {
          c3 = compute(function () {
            return c2.val();
          });
          c1.val();
        });
        var c4 = compute(function () {
          return s2.val();
        });
        var count = 0;
        effect(function () {
          count++;
          c4.val();
          c3.val();
        });
        s1.set(s1.peek() + 1);
        t.equal(count, 1);
      });
    });
  });
});