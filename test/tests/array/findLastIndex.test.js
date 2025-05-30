import { test } from "../../helper/index.js";
import { array, value } from "../../../build/index.js";
import { shallowEq } from "../../helper/array.js";

test("findLastIndex", function (t) {
    t.test("behaves like native", function (t) {
        t.test("basic findLastIndex", function (t) {
            var s1 = array([1, 2, 3, 4, 5]);
            var s2 = s1.findLastIndex(function (item) {
                return item > 3;
            });
            t.assert(s2.val() === 4);
        });

        t.test("with index", function (t) {
            var s1 = array(['a', 'b', 'c']);
            var s2 = s1.findLastIndex(function (item, index) {
                return index < 2;
            });
            t.assert(s2.val() === 1);
        });

        t.test("empty array", function (t) {
            var s1 = array([]);
            var s2 = s1.findLastIndex(function (item) {
                return item > 3;
            });
            t.assert(s2.val() === -1);
        });

        t.test("no match", function (t) {
            var s1 = array([1, 2, 3]);
            var s2 = s1.findLastIndex(function (item) {
                return item > 3;
            });
            t.assert(s2.val() === -1);
        });
    });

    t.test("when modified", function (t) {
        t.test("works on mutations", function (t) {
            var s1 = array([1, 2, 3, 4, 5]);
            var s2 = s1.findLastIndex(function (item) {
                return item > 3;
            });
            t.assert(s2.val() === 4);

            s1.pop();
            t.assert(shallowEq(s1.val(), [1, 2, 3, 4]));
            t.assert(s2.val() === 3);

            s1.pop();
            t.assert(shallowEq(s1.val(), [1, 2, 3]));
            t.assert(s2.val() === -1);

            s1.push(6);
            t.assert(shallowEq(s1.val(), [1, 2, 3, 6]));
            t.assert(s2.val() === 3);

            s1.splice(1, 1);
            t.assert(shallowEq(s1.val(), [1, 3, 6]));
            t.assert(s2.val() === 2);

            s1.reverse();
            t.assert(shallowEq(s1.val(), [6, 3, 1]));
            t.assert(s2.val() === 0);
        });
    });

    t.test("edge cases", function (t) {
        t.test("null/undefined values", function (t) {
            var s1 = array([1, 2, null, undefined]);
            var s2 = s1.findLastIndex(function (item) {
                return item === null;
            });
            t.assert(s2.val() === 2);

            var s3 = s1.findLastIndex(function (item) {
                return item === undefined;
            });
            t.assert(s3.val() === 3);
        });

        t.test("sparse arrays", function (t) {
            var s1 = array([1, , 3, , 5]);
            var s2 = s1.findLastIndex(function (item) {
                return item === undefined;
            });
            t.assert(s2.val() === 3);
        });

        t.test("large arrays", function (t) {
            var size = 10000;
            var s1 = array(new Array(size).fill(0).map(function(_, i) { return i; }));
            var s2 = s1.findLastIndex(function (item) {
                return item === size - 1;
            });
            t.assert(s2.val() === size - 1);
        });
    });
}); 