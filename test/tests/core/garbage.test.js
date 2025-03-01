import { test } from "../../helper/index.js";
import { value, compute } from "../../../build/index.js";

if (global.gc) {
  function collect(callback) {
    setTimeout(function () {
      global.gc();
      callback();
    });
  }
  test("garbage collection", function (t) {
    t.test("should not be collected when referenced", function (t) {
      var s1 = value(1);
      var ref = new WeakRef(
        compute(function () {
          s1.val();
        }),
      );
      // Bind dependencies
      ref.deref().val();
      collect(function () {
        t.equal(ref.deref() !== void 0, true);
      });
    });

    t.test("should be collected when disposed", function (t) {
      var s1 = value(1);
      var c1 = new WeakRef(
        compute(function () {
          s1.val();
        }),
      );
      c1.deref().val();
      s1.dispose();
      collect(function () {
        t.equal(c1.deref(), void 0);
      })
    });

    t.test("should be collected when only referenced locally", function (t) {
      function local() {
        var s1 = new WeakRef(value(1));
        var c1 = new WeakRef(
          compute(function () {
            return s1.deref().val();
          }),
        );
        return { s1, c1 };
      }
      var { s1, c1 } = local();
      t.equal(c1.deref().val(), 1);
      s1.deref().dispose();
      collect(function () {
        t.equal(s1.deref(), void 0);
        t.equal(c1.deref(), void 0);
      });
    });
  });
}
