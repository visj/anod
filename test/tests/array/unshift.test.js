import { test } from "../../helper/index.js";
import { array } from "../../../build/index.js";
import { shallowEq } from "../../helper/array.js";

test("unshift", function (t) {
    t.test("adds one element to start", function (t) {
        var s1 = array([2, 3]);
        s1.unshift(1);
        t.assert(shallowEq(s1.val(), [1, 2, 3]));
    });

    t.test("adds multiple elements to start", function (t) {
        var s1 = array([3]);
        s1.unshift(1, 2);
        t.assert(shallowEq(s1.val(), [1, 2, 3]));
    });

    t.test("unshift to empty array", function (t) {
        var s1 = array([]);
        s1.unshift(1);
        t.assert(shallowEq(s1.val(), [1]));
    });

    t.test("reactivity: updates filtered array", function (t) {
        var s1 = array([2, 4]);
        var s2 = s1.filter(function (x) { return x > 1; });
        s1.unshift(0, 1, 5);
        t.assert(shallowEq(s2.val(), [5, 2, 4]));
    });
}); 