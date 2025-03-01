import { test } from "../../helper/index.js";
import { value, root, effect, compute } from "../../../build/index.js";

test("root", function (t) {
  t.test("allows subcomputations to escape their parents", function (t) {
    root(function () {
      var s1 = value(0);
      var s2 = value(0);
      var count = 0;

      effect(function () {
        s1.val();
        root(function () {
          effect(function () {
            s2.val();
            count++;
          });
        });
      });
      t.equal(count, 1);
      s1.set(s1.peek() + 1);
      s1.set(s1.peek() + 1);

      t.equal(count, 3);
      count = 0;
      s2.set(s2.peek() + 1);
      t.equal(count, 3);
    });
  });

  t.test("does not batch updates when used at top level", function (t) {
    root(function () {
      var s1 = value(1);
      var c1 = compute(function () {
        return s1.val();
      });
      t.equal(c1.val(), 1);
      s1.set(2);
      t.equal(c1.val(), 2);
      s1.set(3);
      t.equal(c1.val(), 3);
    });
  });

  t.test("persists through entire scope when used at top level", function (t) {
    root(function () {
      var s1 = value(1);
      effect(function () {
        s1.val();
      });
      s1.set(2);
      var c2 = compute(function () {
        return s1.val();
      });
      s1.set(3);
      t.equal(c2.val(), 3);
    });
  });
});
