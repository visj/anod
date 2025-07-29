import { test } from "../../helper/index.js";
import { array } from "../../../build/index.js";
import { shallowEq } from "../../helper/array.js";

test("sort", function (t) {
    t.test("sorts array in place", function (t) {
        var s1 = array([3, 1, 2]);
        s1.sort();
        t.assert(shallowEq(s1.val(), [1, 2, 3]));
    });

    t.test("sorts with custom compare", function (t) {
        var s1 = array([1, 2, 3]);
        s1.sort(function (a, b) { return b - a; });
        t.assert(shallowEq(s1.val(), [3, 2, 1]));
    });

    t.test("sort on empty array", function (t) {
        var s1 = array([]);
        s1.sort();
        t.assert(shallowEq(s1.val(), []));
    });

    t.test("reactivity: updates mapped array", function (t) {
        var s1 = array([3, 1, 2]);
        var s2 = s1.map(function (x) { return x * 2; });
        s1.sort();
        t.assert(shallowEq(s2.val(), [2, 4, 6]));
    });
}); 