import { test } from "../../helper/index.js";
import { array } from "../../../build/index.js";
import { shallowEq } from "../../helper/array.js";

test("compute", function (t) {
    t.test("filter", function (t) {
        t.test("behaves like native", function (t) {
            var s1 = array([1, 2, 3, 4, 5]);
            var s2 = s1.filter(function (item) {
                return item % 2 !== 0;
            });
            t.assert(shallowEq(s2.val(), [1, 3, 5]));
        });
    });
});