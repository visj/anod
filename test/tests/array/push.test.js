import { test } from "../../helper/index.js";
import { array } from "../../../build/index.js";
import { shallowEq } from "../../helper/array.js";

test("push", function (t) {
    t.test("adds one element", function (t) {
        var s1 = array([1, 2]);
        s1.push(3);
        t.assert(shallowEq(s1.val(), [1, 2, 3]));
    });

    t.test("adds multiple elements", function (t) {
        var s1 = array([1]);
        s1.push(2, 3, 4);
        t.assert(shallowEq(s1.val(), [1, 2, 3, 4]));
    });

    t.test("push to empty array", function (t) {
        var s1 = array([]);
        s1.push(1);
        t.assert(shallowEq(s1.val(), [1]));
    });

    t.test("reactivity: updates mapped array", function (t) {
        var s1 = array([1, 2]);
        var s2 = s1.map(function (x) { return x * 2; });
        s1.push(3);
        t.assert(shallowEq(s2.val(), [2, 4, 6]));
    });
}); 