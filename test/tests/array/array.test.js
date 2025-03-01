import { test } from "../../helper/index.js";
import { array } from "../../../build/index.js";
import { shallowEq } from "../../helper/array.js";


test("array", function (t) {
    t.test("pop", function (t) {
        t.test("removes one object", function (t) {
            var s1 = array([1, 2, 3]);
            s1.pop();
            t.assert(shallowEq(s1.val(), [1, 2]));
        });

        t.test("works for repeated calls", function (t) {
            var s1 = array([1, 2, 3]);
            s1.pop();
            s1.pop();
            t.assert(shallowEq(s1.val(), [1]));
        });
    });
});