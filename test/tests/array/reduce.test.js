import { test } from "../../helper/index.js";
import { array, value } from "../../../build/index.js";
import { shallowEq } from "../../helper/array.js";

test("reduce", function (t) {
    t.test("behaves like native", function (t) {
        t.test("basic reduction", function (t) {
            var s1 = array([1, 2, 3]);
            var s2 = s1.reduce(function (acc, item) {
                return acc + item;
            });
            t.assert(s2.val() === 6);
        });

        t.test("with initial value", function (t) {
            var s1 = array([1, 2, 3]);
            var s2 = s1.reduce(function (acc, item) {
                return acc + item;
            }, 10);
            t.assert(s2.val() === 16);
        });

        t.test("with index", function (t) {
            var s1 = array(['a', 'b', 'c']);
            var s2 = s1.reduce(function (acc, item, index) {
                return acc + item + index;
            }, '');
            t.assert(s2.val() === 'a0b1c2');
        });

        t.test("single element", function (t) {
            var s1 = array([1]);
            var s2 = s1.reduce(function (acc, item) {
                return acc + item;
            });
            t.assert(s2.val() === 1);
        });

        t.test("empty array with initial value", function (t) {
            var s1 = array([]);
            var s2 = s1.reduce(function (acc, item) {
                return acc + item;
            }, 0);
            t.assert(s2.val() === 0);
        });
    });

    t.test("when modified", function (t) {
        t.test("works on mutations", function (t) {
            var s1 = array([1, 2, 3]);
            var s2 = s1.reduce(function (acc, item) {
                return acc + item;
            });
            t.assert(s2.val() === 6);

            s1.pop();
            t.assert(shallowEq(s1.val(), [1, 2]));
            t.assert(s2.val() === 3);

            s1.push(4);
            t.assert(shallowEq(s1.val(), [1, 2, 4]));
            t.assert(s2.val() === 7);

            s1.splice(1, 1);
            t.assert(shallowEq(s1.val(), [1, 4]));
            t.assert(s2.val() === 5);

            s1.reverse();
            t.assert(shallowEq(s1.val(), [4, 1]));
            t.assert(s2.val() === 5);
        });
    });

    t.test("edge cases", function (t) {
        t.test("null/undefined values", function (t) {
            var s1 = array([null, undefined, 1]);
            var s2 = s1.reduce(function (acc, item) {
                return acc + (item === null ? 'null' : item === undefined ? 'undefined' : item);
            }, '');
            t.assert(s2.val() === 'nullundefined1');
        });

        t.test("sparse arrays", function (t) {
            var s1 = array([1, , 3]);
            var s2 = s1.reduce(function (acc, item) {
                return acc + (item === undefined ? 'empty' : item);
            }, '');
            t.assert(s2.val() === '1empty3');
        });

        t.test("large arrays", function (t) {
            var size = 10000;
            var s1 = array(new Array(size).fill(0).map(function(_, i) { return i; }));
            var s2 = s1.reduce(function (acc, item) {
                return acc + item;
            });
            t.assert(s2.val() === (size * (size - 1)) / 2);
        });
    });
}); 