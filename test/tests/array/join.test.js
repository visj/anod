import { test } from "../../helper/index.js";
import { array, value } from "../../../build/index.js";
import { shallowEq } from "../../helper/array.js";

test("join", function (t) {
    t.test("behaves like native", function (t) {
        t.test("basic join", function (t) {
            var s1 = array([1, 2, 3, 4, 5]);
            var s2 = s1.join();
            t.assert(s2.val() === "1,2,3,4,5");
        });

        t.test("with undefined", function (t) {
            var s1 = array([1, 2, 3, 4, 5]);
            var s2 = s1.join(undefined);
            t.assert(s2.val() === "1,2,3,4,5");
        });

        t.test("with separator", function (t) {
            var s1 = array(["a", "b", "c"]);
            var s2 = s1.join("-");
            t.assert(s2.val() === "a-b-c");
        });

        t.test("empty array", function (t) {
            var s1 = array([]);
            var s2 = s1.join();
            t.assert(s2.val() === "");
        });

        t.test("single element", function (t) {
            var s1 = array([1]);
            var s2 = s1.join();
            t.assert(s2.val() === "1");
        });
    });

    t.test("when modified", function (t) {
        t.test("works on mutations", function (t) {
            var s1 = array([1, 2, 3]);
            var s2 = s1.join();
            t.assert(s2.val() === "1,2,3");

            s1.push(4);
            t.assert(shallowEq(s1.val(), [1, 2, 3, 4]));
            t.assert(s2.val() === "1,2,3,4");

            s1.pop();
            t.assert(shallowEq(s1.val(), [1, 2, 3]));
            t.assert(s2.val() === "1,2,3");

            s1.splice(1, 1, 5);
            t.assert(shallowEq(s1.val(), [1, 5, 3]));
            t.assert(s2.val() === "1,5,3");

            s1.reverse();
            t.assert(shallowEq(s1.val(), [3, 5, 1]));
            t.assert(s2.val() === "3,5,1");
        });
    });

    t.test("edge cases", function (t) {
        t.test("null/undefined values", function (t) {
            var s1 = array([null, undefined, 1, 2]);
            var s2 = s1.join();
            t.assert(s2.val() === ",,1,2");

            var s3 = array([null, null, null]);
            var s4 = s3.join();
            t.assert(s4.val() === ",,");
        });

        t.test("sparse arrays", function (t) {
            var s1 = array([1, , 3, , 5]);
            var s2 = s1.join();
            t.assert(s2.val() === "1,,3,,5");
        });

        t.test("large arrays", function (t) {
            var size = 10000;
            var s1 = array(new Array(size).fill(0).map(function(_, i) { return i; }));
            var s2 = s1.join();
            t.assert(s2.val() === s1.val().join());
        });

        t.test("various separators", function (t) {
            var s1 = array([1, 2, 3]);
            var s2 = s1.join("");
            t.assert(s2.val() === "123");

            var s3 = s1.join(" ");
            t.assert(s3.val() === "1 2 3");

            var s4 = s1.join("--");
            t.assert(s4.val() === "1--2--3");
        });
    });
}); 