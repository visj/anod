import { test } from "../../helper/index.js";
import { array, value } from "../../../build/index.js";
import { shallowEq } from "../../helper/array.js";

test("concat", function (t) {
    t.test("behaves like native", function (t) {
        t.test("basic concat", function (t) {
            var s1 = array([1, 2, 3]);
            var s2 = array([4, 5, 6]);
            var s3 = s1.concat(s2);
            t.assert(shallowEq(s3.val(), [1, 2, 3, 4, 5, 6]));
        });

        t.test("multiple arrays", function (t) {
            var s1 = array([1, 2]);
            var s2 = array([3, 4]);
            var s3 = array([5, 6]);
            var s4 = s1.concat(s2, s3);
            t.assert(shallowEq(s4.val(), [1, 2, 3, 4, 5, 6]));
        });

        t.test("with non-array values", function (t) {
            var s1 = array([1, 2]);
            var s2 = s1.concat(3, [4, 5]);
            t.assert(shallowEq(s2.val(), [1, 2, 3, 4, 5]));
        });

        t.test("empty array", function (t) {
            var s1 = array([]);
            var s2 = s1.concat([1, 2]);
            t.assert(shallowEq(s2.val(), [1, 2]));
        });
    });

    t.test("when modified", function (t) {
        t.test("works on mutations", function (t) {
            var s1 = array([1, 2]);
            var s2 = array([3, 4]);
            var s3 = s1.concat(s2);
            t.assert(shallowEq(s3.val(), [1, 2, 3, 4]));

            s1.push(5);
            t.assert(shallowEq(s1.val(), [1, 2, 5]));
            t.assert(shallowEq(s3.val(), [1, 2, 5, 3, 4]));

            s2.push(6);
            t.assert(shallowEq(s2.val(), [3, 4, 6]));
            t.assert(shallowEq(s3.val(), [1, 2, 5, 3, 4, 6]));

            s1.splice(1, 1, 7);
            t.assert(shallowEq(s1.val(), [1, 7, 5]));
            t.assert(shallowEq(s3.val(), [1, 7, 5, 3, 4, 6]));

            s1.reverse();
            t.assert(shallowEq(s1.val(), [5, 7, 1]));
            t.assert(shallowEq(s3.val(), [5, 7, 1, 3, 4, 6]));
        });
    });

    t.test("edge cases", function (t) {
        t.test("null/undefined values", function (t) {
            var s1 = array([1, 2]);
            var s2 = s1.concat(null, undefined);
            t.assert(shallowEq(s2.val(), [1, 2, null, undefined]));
        });

        t.test("sparse arrays", function (t) {
            var s1 = array([1, , 3]);
            var s2 = array([4, , 6]);
            var s3 = s1.concat(s2);
            t.assert(shallowEq(s3.val(), [1, undefined, 3, 4, undefined, 6]));
        });

        t.test("large arrays", function (t) {
            var size = 10000;
            var s1 = array(new Array(size).fill(0).map(function(_, i) { return i; }));
            var s2 = array(new Array(size).fill(0).map(function(_, i) { return i + size; }));
            var s3 = s1.concat(s2);
            t.assert(shallowEq(s3.val(), s1.val().concat(s2.val())));
        });

        t.test("nested arrays", function (t) {
            var s1 = array([1, 2]);
            var s2 = array([3, [4, 5]]);
            var s3 = s1.concat(s2);
            t.assert(shallowEq(s3.val(), [1, 2, 3, [4, 5]]));
        });
    });
}); 