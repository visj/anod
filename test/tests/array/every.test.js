import { test } from "../../helper/index.js";
import { array, value } from "../../../build/index.js";
import { shallowEq } from "../../helper/array.js";

test("every", function (t) {
    t.test("behaves like native", function (t) {
        t.test("basic every", function (t) {
            var s1 = array([1, 2, 3, 4, 5]);
            var s2 = s1.every(function (item) {
                return item > 0;
            });
            t.assert(s2.val() === true);
        });

        t.test("with index", function (t) {
            var s1 = array(['a', 'b', 'c']);
            var s2 = s1.every(function (item, index) {
                return index < 3;
            });
            t.assert(s2.val() === true);
        });

        t.test("empty array", function (t) {
            var s1 = array([]);
            var s2 = s1.every(function (item) {
                return item > 3;
            });
            t.assert(s2.val() === true);
        });

        t.test("no match", function (t) {
            var s1 = array([1, 2, 3]);
            var s2 = s1.every(function (item) {
                return item > 3;
            });
            t.assert(s2.val() === false);
        });
    });

    t.test("additional mutation edge cases", function (t) {
        t.test("insert at head", function (t) {
            var s1 = array([2, 3, 4]);
            var s2 = s1.every(function (item) { return item > 1; });
            t.assert(s2.val() === true);
            s1.unshift(1);
            t.assert(shallowEq(s1.val(), [1, 2, 3, 4]));
            t.assert(s2.val() === false);
            s1.unshift(0);
            t.assert(shallowEq(s1.val(), [0, 1, 2, 3, 4]));
            t.assert(s2.val() === false);
        });
        t.test("insert at tail", function (t) {
            var s1 = array([1, 2, 3]);
            var s2 = s1.every(function (item) { return item < 4; });
            t.assert(s2.val() === true);
            s1.push(4);
            t.assert(shallowEq(s1.val(), [1, 2, 3, 4]));
            t.assert(s2.val() === false);
        });
        t.test("multiple insertions/removals", function (t) {
            var s1 = array([1, 2, 3]);
            var s2 = s1.every(function (item) { return item < 10; });
            t.assert(s2.val() === true);
            s1.splice(1, 2, 8, 9, 10);
            t.assert(shallowEq(s1.val(), [1, 8, 9, 10]));
            t.assert(s2.val() === false);
            s1.splice(0, 3, 20, 30);
            t.assert(shallowEq(s1.val(), [20, 30, 10]));
            t.assert(s2.val() === false);
        });
        t.test("sort mutation", function (t) {
            var s1 = array([3, 2, 1]);
            var s2 = s1.every(function (item, idx) { return item <= 3; });
            t.assert(s2.val() === true);
            s1.sort(function (a, b) { return a - b; });
            t.assert(shallowEq(s1.val(), [1, 2, 3]));
            t.assert(s2.val() === true);
        });
        t.test("callback mutates array", function (t) {
            var s1 = array([1, 2, 3]);
            var count = 0;
            var s2 = s1.every(function (item, idx) {
                count++;
                if (idx === 0) s1.push(4);
                return item < 5;
            });
            t.assert(s2.val() === true);
            t.assert(count === 3, "should not iterate over newly pushed element");
        });
        t.test("callback always false after mutation", function (t) {
            var s1 = array([1, 2, 3]);
            var s2 = s1.every(function (item) { return false; });
            t.assert(s2.val() === false);
            s1.push(4);
            t.assert(s2.val() === false);
            s1.set([10, 11]);
            t.assert(s2.val() === false);
        });
        t.test("callback always true after mutation", function (t) {
            var s1 = array([1, 2, 3]);
            var s2 = s1.every(function (item) { return true; });
            t.assert(s2.val() === true);
            s1.push(4);
            t.assert(s2.val() === true);
            s1.set([]);
            t.assert(s2.val() === true);
        });
    });

    t.test("when modified", function (t) {
        t.test("works on mutations", function (t) {
            var s1 = array([1, 2, 3, 4, 5]);
            var s2 = s1.every(function (item) {
                return item > 0;
            });
            t.assert(s2.val() === true);

            s1.pop();
            t.assert(shallowEq(s1.val(), [1, 2, 3, 4]));
            t.assert(s2.val() === true);

            s1.push(0);
            t.assert(shallowEq(s1.val(), [1, 2, 3, 4, 0]));
            t.assert(s2.val() === false);

            s1.pop();
            t.assert(shallowEq(s1.val(), [1, 2, 3, 4]));
            t.assert(s2.val() === true);

            s1.splice(1, 1, 0);
            t.assert(shallowEq(s1.val(), [1, 0, 3, 4]));
            t.assert(s2.val() === false);

            s1.reverse();
            t.assert(shallowEq(s1.val(), [4, 3, 0, 1]));
            t.assert(s2.val() === false);
        });
    });

    t.test("edge cases", function (t) {
        t.test("null/undefined values", function (t) {
            var s1 = array([null, undefined, 1, 2]);
            var s2 = s1.every(function (item) {
                return item === null || item === undefined;
            });
            t.assert(s2.val() === false);

            var s3 = array([null, null, null]);
            var s4 = s3.every(function (item) {
                return item === null;
            });
            t.assert(s4.val() === true);
        });

        t.test("sparse arrays", function (t) {
            var s1 = array([1, , 3, , 5]);
            var s2 = s1.every(function (item) {
                return item === undefined;
            });
            t.assert(s2.val() === false);
        });

        t.test("large arrays", function (t) {
            var size = 10000;
            var s1 = array(new Array(size).fill(0).map(function (_, i) { return i; }));
            var s2 = s1.every(function (item) {
                return item >= 0;
            });
            t.assert(s2.val() === true);
        });
    });
}); 