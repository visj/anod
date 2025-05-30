import { test } from "../../helper/index.js";
import { array, value } from "../../../build/index.js";
import { shallowEq } from "../../helper/array.js";

test("slice", function (t) {
    t.test("behaves like native", function (t) {
        t.test("basic slice", function (t) {
            var s1 = array([1, 2, 3, 4, 5]);
            var s2 = s1.slice(1, 4);
            t.assert(shallowEq(s2.val(), [2, 3, 4]));
        });

        t.test("with start only", function (t) {
            var s1 = array([1, 2, 3, 4, 5]);
            var s2 = s1.slice(2);
            t.assert(shallowEq(s2.val(), [3, 4, 5]));
        });

        t.test("with negative indices", function (t) {
            var s1 = array([1, 2, 3, 4, 5]);
            var s2 = s1.slice(-3, -1);
            t.assert(shallowEq(s2.val(), [3, 4]));
        });

        t.test("empty array", function (t) {
            var s1 = array([]);
            var s2 = s1.slice(0, 2);
            t.assert(shallowEq(s2.val(), []));
        });

        t.test("out of bounds", function (t) {
            var s1 = array([1, 2, 3]);
            var s2 = s1.slice(5);
            t.assert(shallowEq(s2.val(), []));
        });
    });

    t.test("when modified", function (t) {
        t.test("works on mutations", function (t) {
            var s1 = array([1, 2, 3, 4, 5]);
            var s2 = s1.slice(1, 4);
            t.assert(shallowEq(s2.val(), [2, 3, 4]));

            s1.push(6);
            t.assert(shallowEq(s1.val(), [1, 2, 3, 4, 5, 6]));
            t.assert(shallowEq(s2.val(), [2, 3, 4]));

            s1.pop();
            t.assert(shallowEq(s1.val(), [1, 2, 3, 4, 5]));
            t.assert(shallowEq(s2.val(), [2, 3, 4]));

            s1.splice(1, 1, 7);
            t.assert(shallowEq(s1.val(), [1, 7, 3, 4, 5]));
            t.assert(shallowEq(s2.val(), [7, 3, 4]));

            s1.reverse();
            t.assert(shallowEq(s1.val(), [5, 4, 3, 7, 1]));
            t.assert(shallowEq(s2.val(), [4, 3, 7]));
        });
    });

    t.test("edge cases", function (t) {
        t.test("null/undefined values", function (t) {
            var s1 = array([null, undefined, 1, 2]);
            var s2 = s1.slice(0, 2);
            t.assert(shallowEq(s2.val(), [null, undefined]));
        });

        t.test("sparse arrays", function (t) {
            var s1 = array([1, , 3, , 5]);
            var s2 = s1.slice(1, 4);
            t.assert(shallowEq(s2.val(), [undefined, 3, undefined]));
        });

        t.test("large arrays", function (t) {
            var size = 10000;
            var s1 = array(new Array(size).fill(0).map(function(_, i) { return i; }));
            var s2 = s1.slice(size - 5);
            t.assert(shallowEq(s2.val(), [size - 5, size - 4, size - 3, size - 2, size - 1]));
        });

        t.test("various index combinations", function (t) {
            var s1 = array([1, 2, 3, 4, 5]);
            var s2 = s1.slice(0, 0);
            t.assert(shallowEq(s2.val(), []));

            var s3 = s1.slice(0, -0);
            t.assert(shallowEq(s3.val(), []));

            var s4 = s1.slice(-2, -1);
            t.assert(shallowEq(s4.val(), [4]));

            var s5 = s1.slice(-1, -2);
            t.assert(shallowEq(s5.val(), []));
        });
    });
}); 