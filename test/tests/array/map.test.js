import { test } from "../../helper/index.js";
import { array, value } from "../../../build/index.js";
import { shallowEq } from "../../helper/array.js";

test("map", function (t) {
    t.test("behaves like native", function (t) {
        t.test("basic mapping", function (t) {
            var s1 = array([1, 2, 3]);
            var s2 = s1.map(function (item) {
                return item * 2;
            });
            t.assert(shallowEq(s2.val(), [2, 4, 6]));
        });

        t.test("with index", function (t) {
            var s1 = array(['a', 'b', 'c']);
            var s2 = s1.map(function (item, index) {
                return item + index;
            });
            t.assert(shallowEq(s2.val(), ['a0', 'b1', 'c2']));
        });

        t.test("empty array", function (t) {
            var s1 = array([]);
            var s2 = s1.map(function (item) {
                return item * 2;
            });
            t.assert(shallowEq(s2.val(), []));
        });
    });

    t.test("when modified", function (t) {
        t.test("works on mutations", function (t) {
            var s1 = array([1, 2, 3]);
            var s2 = s1.map(function (item) {
                return item * 2;
            });
            t.assert(shallowEq(s2.val(), [2, 4, 6]));

            s1.pop();
            t.assert(shallowEq(s1.val(), [1, 2]));
            t.assert(shallowEq(s2.val(), [2, 4]));

            s1.push(4);
            t.assert(shallowEq(s1.val(), [1, 2, 4]));
            t.assert(shallowEq(s2.val(), [2, 4, 8]));

            s1.splice(1, 1);
            t.assert(shallowEq(s1.val(), [1, 4]));
            t.assert(shallowEq(s2.val(), [2, 8]));

            s1.reverse();
            t.assert(shallowEq(s1.val(), [4, 1]));
            t.assert(shallowEq(s2.val(), [8, 2]));
        });
    });

    t.test("edge cases", function (t) {
        t.test("null/undefined values", function (t) {
            var s1 = array([null, undefined, 1]);
            var s2 = s1.map(function (item) {
                return item === null ? 'null' : item === undefined ? 'undefined' : item;
            });
            t.assert(shallowEq(s2.val(), ['null', 'undefined', 1]));
        });

        t.test("sparse arrays", function (t) {
            var s1 = array([1, , 3]);
            var s2 = s1.map(function (item) {
                return item === undefined ? 'empty' : item;
            });
            t.assert(shallowEq(s2.val(), [1, 'empty', 3]));
        });

        t.test("large arrays", function (t) {
            var size = 10000;
            var s1 = array(new Array(size).fill(0).map(function(_, i) { return i; }));
            var s2 = s1.map(function (item) {
                return item * 2;
            });
            t.assert(s2.val().length === size);
            t.assert(s2.val()[size - 1] === (size - 1) * 2);
        });
    });

    t.test("error cases", function (t) {
        t.test("callback errors", function (t) {
            var s1 = array([1, 2, 3]);
            var s2 = s1.map(function (item) {
                if (item === 2) throw new Error('Test error');
                return item * 2;
            });
            t.throws(function() {
                s2.val();
            });
        });
    });
}); 