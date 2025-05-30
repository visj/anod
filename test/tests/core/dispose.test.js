import { test } from "../../helper/index.js";
import { 
  value,
  compute,
  effect,
  root,
  batch
} from "../../../build/index.js";

test("dispose", function (t) {
  t.test("root", function (t) {
    t.test("disables updates and sets computation's value to null", function (t) {
      var count, s1, c1;
      var r1 = root(function () {
        count = 0;
        s1 = value(0);

        c1 = compute(function () {
          count++;
          return s1.val();
        });

        t.equal(c1.val(), 0);
        t.equal(count, 1);

        s1.set(1);

        t.equal(c1.val(), 1);
        t.equal(count, 2);
      });
      r1.dispose();
      s1.set(2);

      t.equal(count, 2);
      t.equal(c1.val(), null);
    });
  });

  t.test("computations", function (t) {
    t.test("persists through cycle when manually disposed", function (t) {
      root(function () {
        var s1 = value(0);
        var c1 = compute(function () {
          return s1.val();
        });
        var count = 0;
        effect(function () {
          effect(function () {
            if (s1.val() > 0) {
              c1.dispose();
            }
          });
          effect(function () {
            count += c1.val();
          });
        });
        s1.set(s1.peek() + 1);
        s1.set(s1.peek() + 1);
        t.equal(count, 1);
      });
    });
  });

  t.test("unmount", function (t) {
    t.test("does not unmount pending computations with changing dependencies", function (t) {
      var s1 = value(true);
      var s2 = value(0);
      var s3 = value(0);
      var calls = 0;
      effect(function () {
        if (!s1.val()) {
          s1.dispose();
          s2.dispose();
          s3.set(s3.peek() + 1);
        }
      });
      effect(function () {
        calls++;
        if (s1.val()) {
          s2.val();
        } else {
          s3.val();
        }
      }, { unstable: true });
      calls = 0;
      s1.set(false);
      t.equal(calls, 2);
    });
  });

  t.test("may dispose", function (t) {
    t.test("computation", function (t) {
      t.test("does not execute pending disposed nodes", function (t) {
        var s1 = value(0);
        var order = "";
        var c1 = compute(function () {
          order += "c1";
          return s1.val();
        });
        var c3;
        effect(function () {
          order += "e1";
          if (c3) {
            c3.val();
          }
          s1.val();
        })
        effect(function () {
          c1.val();
          order += "e2";
          if (s1.peek() === 0) {
            c3 = compute(function () {
              order += "c3";
              s1.val();
            });
          }
        });
        t.equal(order, "e1c1e2");
        order = "";
        s1.set(1);
        t.equal(order, "c1e1e2");
      });

      t.test("does not update if called while being in may dispose state", function (t) {
        var s1 = value(1);
        var s2 = value(1);
        var count = 0;
        var c1;
        var c2 = compute(function () {
          return s1.val() < 2;
        });
        compute(function () {
          s2.val();
          if (c1 !== void 0) {
            c1.val();
          }
        });
        effect(function () {
          c2.val();
          if (c1 === void 0) {
            c1 = compute(function () {
              count++;
              return s2.val();
            });
          }
        });
        c1.val();
        s1.set(1);
        batch(function () {
          s2.set(1);
          s1.set(2);
        });
        // c1 is disposed but called from previous compute, should not update
        c1.val();
        t.equal(count, 1);
      });
    });
  });
});

