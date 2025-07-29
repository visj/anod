import { test } from "../../helper/index.js";
import { array } from "../../../build/index.js";
import { shallowEq } from "../../helper/array.js";

test("reverse", function (t) {
    t.test("reverses array", function (t) {
        var s1 = array([1, 2, 3]);
        s1.reverse();
        t.assert(shallowEq(s1.val(), [3, 2, 1]));
    });

    t.test("works for repeated calls", function (t) {
        var s1 = array([1, 2, 3]);
        s1.reverse();
        s1.reverse();
        t.assert(shallowEq(s1.val(), [1, 2, 3]));
    });

    t.test("reverse on empty array", function (t) {
        var s1 = array([]);
        s1.reverse();
        t.assert(shallowEq(s1.val(), []));
    });

    t.test("reactivity: updates mapped array", function (t) {
        var s1 = array([1, 2, 3]);
        var s2 = s1.map(function (x) { return x * 10; });
        s1.reverse();
        t.assert(shallowEq(s2.val(), [30, 20, 10]));
    });
}); 