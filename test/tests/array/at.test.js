import { test } from "../../helper/index.js";
import { array, value } from "../../../build/index.js";
import { shallowEq } from "../../helper/array.js";

test("at", function (t) {
    t.test("behaves like native", function (t) {
        t.test("basic at", function (t) {
            var s1 = array([1, 2, 3, 4, 5]);
            var s2 = s1.at(2);
            t.assert(s2.val() === 3);
        });

        t.test("with negative index", function (t) {
            var s1 = array([1, 2, 3, 4, 5]);
            var s2 = s1.at(-1);
            t.assert(s2.val() === 5);
        });

        t.test("empty array", function (t) {
            var s1 = array([]);
            var s2 = s1.at(0);
            t.assert(s2.val() === undefined);
        });

        t.test("out of bounds", function (t) {
            var s1 = array([1, 2, 3]);
            var s2 = s1.at(5);
            t.assert(s2.val() === undefined);
        });
    });

    t.test("when modified", function (t) {
        t.test("works on mutations", function (t) {
            var s1 = array([1, 2, 3]);
            var s2 = s1.at(1);
            t.assert(s2.val() === 2);

            s1.push(4);
            t.assert(shallowEq(s1.val(), [1, 2, 3, 4]));
            t.assert(s2.val() === 2);

            s1.pop();
            t.assert(shallowEq(s1.val(), [1, 2, 3]));
            t.assert(s2.val() === 2);

            s1.splice(1, 1, 5);
            t.assert(shallowEq(s1.val(), [1, 5, 3]));
            t.assert(s2.val() === 5);

            s1.reverse();
            t.assert(shallowEq(s1.val(), [3, 5, 1]));
            t.assert(s2.val() === 5);
        });
    });

    t.test("edge cases", function (t) {
        t.test("null/undefined values", function (t) {
            var s1 = array([null, undefined, 1, 2]);
            var s2 = s1.at(0);
            t.assert(s2.val() === null);

            var s3 = s1.at(1);
            t.assert(s3.val() === undefined);
        });

        t.test("sparse arrays", function (t) {
            var s1 = array([1, , 3, , 5]);
            var s2 = s1.at(1);
            t.assert(s2.val() === undefined);
        });

        t.test("large arrays", function (t) {
            var size = 10000;
            var s1 = array(new Array(size).fill(0).map(function(_, i) { return i; }));
            var s2 = s1.at(size - 1);
            t.assert(s2.val() === size - 1);
        });

        t.test("various indices", function (t) {
            var s1 = array([1, 2, 3, 4, 5]);
            var s2 = s1.at(0);
            t.assert(s2.val() === 1);

            var s3 = s1.at(-0);
            t.assert(s3.val() === 1);

            var s4 = s1.at(-2);
            t.assert(s4.val() === 4);

            var s5 = s1.at(-5);
            t.assert(s5.val() === 1);

            var s6 = s1.at(-6);
            t.assert(s6.val() === undefined);
        });
    });
}); 