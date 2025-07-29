import { test } from "../../helper/index.js";
import { array } from "../../../build/index.js";
import { shallowEq } from "../../helper/array.js";

test("splice", function (t) {
    t.test("removes elements", function (t) {
        var s1 = array([1, 2, 3, 4]);
        s1.splice(1, 2);
        t.assert(shallowEq(s1.val(), [1, 4]));
    });

    t.test("inserts elements", function (t) {
        var s1 = array([1, 4]);
        s1.splice(1, 0, 2, 3);
        t.assert(shallowEq(s1.val(), [1, 2, 3, 4]));
    });

    t.test("replace elements", function (t) {
        var s1 = array([1, 2, 3]);
        s1.splice(1, 1, 4, 5);
        t.assert(shallowEq(s1.val(), [1, 4, 5, 3]));
    });

    t.test("splice with no deleteCount", function (t) {
        var s1 = array([1, 2, 3]);
        s1.splice(1);
        t.assert(shallowEq(s1.val(), [1]));
    });

    t.test("reactivity: updates filtered array", function (t) {
        var s1 = array([1, 2, 3, 4]);
        var s2 = s1.filter(function (x) { return x % 2 === 0; });
        s1.splice(1, 2, 6);
        t.assert(shallowEq(s2.val(), [6, 4]));
    });
}); 