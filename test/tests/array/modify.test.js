import { test } from "../../helper/index.js";
import { array } from "../../../build/index.js";
import { shallowEq } from "../../helper/array.js";

test("modify", function (t) {
    t.test("modifies array with callback", function (t) {
        var s1 = array([1, 2, 3]);
        s1.modify(function (arr) {
            return arr.map(function (x) { return x * 2; });
        });
        t.assert(shallowEq(s1.val(), [2, 4, 6]));
    });

    t.test("identity callback leaves array unchanged", function (t) {
        var s1 = array([1, 2, 3]);
        s1.modify(function (arr) { return arr; });
        t.assert(shallowEq(s1.val(), [1, 2, 3]));
    });

    t.test("modify on empty array", function (t) {
        var s1 = array([]);
        s1.modify(function (arr) { return arr; });
        t.assert(shallowEq(s1.val(), []));
    });

    t.test("reactivity: updates mapped array", function (t) {
        var s1 = array([1, 2, 3]);
        var s2 = s1.map(function (x) { return x + 1; });
        s1.modify(function (arr) { return arr.slice().reverse(); });
        t.assert(shallowEq(s2.val(), [4, 3, 2]));
    });
}); 