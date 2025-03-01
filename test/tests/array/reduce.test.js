import { test } from "../../helper/index.js";
import { array } from "../../../build/index.js";
import { shallowEq } from "../../helper/array.js";

test("reduce", function (t) {
    t.test("some", function (t) {
        t.test("behaves like native", function (t) {
            t.test("when true", function (t) {
                var s1 = array([1, 2, 3]);
                var s2 = s1.some(function (item) {
                    return item > 4;
                });
                t.assert(s2.val() === false);
            });

            t.test("when false", function (t) {
                var s1 = array([1, 2, 3]);
                var s2 = s1.some(function (item) {
                    return item === 2;
                });
                t.assert(s2.val() === true);
            });
        });

        t.test("when modified", function (t) {
            t.test("works on add", function (t) {
                var s1 = array([1, 2, 3]);
                var s2 = s1.some(function (item) {
                    return item === 2;
                });
                t.assert(s2.val() === true);
                
                s1.pop();
                t.assert(shallowEq(s1.val(), [1, 2]));
                t.assert(s2.val() === true);

                s1.pop();
                t.assert(shallowEq(s1.val(), [1]));
                t.assert(s2.val() === false);
            });
        });
    });
});