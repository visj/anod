import { test } from "../../helper/index.js";
import { array, value } from "../../../build/index.js";
import { shallowEq } from "../../helper/array.js";

test("filter", function (t) {
    t.test("behaves like native", function (t) {
        t.test("basic filtering", function (t) {
            var s1 = array([1, 2, 3, 4, 5]);
            var s2 = s1.filter(function (item) {
                return item > 3;
            });
            t.assert(shallowEq(s2.val(), [4, 5]));
        });

        t.test("with index", function (t) {
            var s1 = array(["a", "b", "c"]);
            var s2 = s1.filter(function (item, index) {
                return index > 0;
            });
            t.assert(shallowEq(s2.val(), ["b", "c"]));
        });

        t.test("empty array", function (t) {
            var s1 = array([]);
            var s2 = s1.filter(function (item) {
                return item > 3;
            });
            t.assert(shallowEq(s2.val(), []));
        });

        t.test("no matches", function (t) {
            var s1 = array([1, 2, 3]);
            var s2 = s1.filter(function (item) {
                return item > 3;
            });
            t.assert(shallowEq(s2.val(), []));
        });
    });

    t.test("when modified", function (t) {
        t.test("works on mutations", function (t) {
            var s1 = array([1, 2, 3, 4, 5]);
            var s2 = s1.filter(function (item) {
                return item > 3;
            });
            t.assert(shallowEq(s2.val(), [4, 5]));

            s1.pop();
            t.assert(shallowEq(s1.val(), [1, 2, 3, 4]));
            t.assert(shallowEq(s2.val(), [4]));

            s1.push(6);
            t.assert(shallowEq(s1.val(), [1, 2, 3, 4, 6]));
            t.assert(shallowEq(s2.val(), [4, 6]));

            s1.splice(1, 1);
            t.assert(shallowEq(s1.val(), [1, 3, 4, 6]));
            t.assert(shallowEq(s2.val(), [4, 6]));

            s1.reverse();
            t.assert(shallowEq(s1.val(), [6, 4, 3, 1]));
            t.assert(shallowEq(s2.val(), [6, 4]));
        });
    });

    t.test("edge cases", function (t) {
        t.test("null/undefined values", function (t) {
            var s1 = array([null, undefined, 1, 2]);
            var s2 = s1.filter(function (item) {
                return item !== null && item !== undefined;
            });
            t.assert(shallowEq(s2.val(), [1, 2]));
        });

        t.test("sparse arrays", function (t) {
            var s1 = array([1, , 3, , 5]);
            var s2 = s1.filter(function (item) {
                return item !== undefined;
            });
            t.assert(shallowEq(s2.val(), [1, 3, 5]));
        });

        t.test("large arrays", function (t) {
            var size = 10000;
            var s1 = array(new Array(size).fill(0).map(function(_, i) { return i; }));
            var s2 = s1.filter(function (item) {
                return item % 2 === 0;
            });
            t.assert(s2.val().length === size / 2);
            t.assert(s2.val()[0] === 0);
            t.assert(s2.val()[s2.val().length - 1] === size - 2);
        });
    });
}); 