import { test } from "../../helper/index.js";
import { value, batch, compute } from "../../../build/index.js";

test("batch", function (t) {
  t.test("batches changes until end", function (t) {
    var s1 = value(1);
    batch(function () {
      s1.set(2);
      t.equal(s1.val(), 1);
    });
    t.equal(s1.val(), 2);
  });

  t.test("stops propagation within tests scope", function (t) {
    var s1 = value(1);
    var c1 = compute(function () {
      return s1.val();
    });
    batch(function () {
      s1.set(2);
      t.equal(c1.val(), 1);
    });
    t.equal(c1.val(), 2);
  });
});	