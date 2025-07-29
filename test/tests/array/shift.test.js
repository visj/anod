import { test } from "../../helper/index.js";
import { array, effect } from "../../../build/index.js";
import { shallowEq } from "../../helper/array.js";

test("shift", function (t) {
    t.test("removes first element", function (t) {
        var s1 = array([1, 2, 3]);
        s1.shift();
        t.assert(shallowEq(s1.val(), [2, 3]));
    });

    t.test("works for repeated calls", function (t) {
        var s1 = array([1, 2, 3]);
        s1.shift();
        s1.shift();
        t.assert(shallowEq(s1.val(), [3]));
    });

    t.test("shift on empty array", function (t) {
        var s1 = array([]);
        s1.shift();
        t.assert(shallowEq(s1.val(), []));
    });

    t.test("computes", function (t) {

        t.test("does not trigger on no-op shift", function(t) {
            var s1 = array([1]);
            var counter = 0;
            effect(function() {
                s1.val();
                counter++;
            });
            s1.shift();
            t.assert(counter === 2);
            s1.shift();
            s1.shift();
            t.assert(counter === 2);
        });

        t.test("updates mapped array", function (t) {
            var s1 = array([1, 2, 3]);
            var s2 = s1.map(function (x) { return x + 1; });
            s1.shift();
            t.assert(shallowEq(s2.val(), [3, 4]));
        });
    });
}); 