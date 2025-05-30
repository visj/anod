import { test } from "../../helper/index.js";
import { array, value } from "../../../build/index.js";
import { shallowEq } from "../../helper/array.js";

test("forEach", function (t) {
    t.test("behaves like native", function (t) {
        t.test("basic forEach", function (t) {
            var s1 = array([1, 2, 3]);
            var sum = 0;
            s1.forEach(function (item) {
                sum += item;
            });
            t.assert(sum === 6);
        });

        t.test("with index", function (t) {
            var s1 = array(['a', 'b', 'c']);
            var result = [];
            s1.forEach(function (item, index) {
                result.push(index + item);
            });
            t.assert(shallowEq(result, ['0a', '1b', '2c']));
        });

        t.test("empty array", function (t) {
            var s1 = array([]);
            var count = 0;
            s1.forEach(function () {
                count++;
            });
            t.assert(count === 0);
        });
    });

    t.test("when modified", function (t) {
        t.test("works on mutations", function (t) {
            var s1 = array([1, 2, 3]);
            var result = [];
            s1.forEach(function (item) {
                result.push(item);
            });
            t.assert(shallowEq(result, [1, 2, 3]));

            s1.push(4);
            result = [];
            s1.forEach(function (item) {
                result.push(item);
            });
            t.assert(shallowEq(result, [1, 2, 3, 4]));

            s1.pop();
            result = [];
            s1.forEach(function (item) {
                result.push(item);
            });
            t.assert(shallowEq(result, [1, 2, 3]));

            s1.splice(1, 1, 5);
            result = [];
            s1.forEach(function (item) {
                result.push(item);
            });
            t.assert(shallowEq(result, [1, 5, 3]));

            s1.reverse();
            result = [];
            s1.forEach(function (item) {
                result.push(item);
            });
            t.assert(shallowEq(result, [3, 5, 1]));
        });
    });

    t.test("edge cases", function (t) {
        t.test("null/undefined values", function (t) {
            var s1 = array([null, undefined, 1, 2]);
            var result = [];
            s1.forEach(function (item) {
                result.push(item);
            });
            t.assert(shallowEq(result, [null, undefined, 1, 2]));
        });

        t.test("sparse arrays", function (t) {
            var s1 = array([1, , 3, , 5]);
            var result = [];
            s1.forEach(function (item) {
                result.push(item);
            });
            t.assert(shallowEq(result, [1, undefined, 3, undefined, 5]));
        });

        t.test("large arrays", function (t) {
            var size = 10000;
            var s1 = array(new Array(size).fill(0).map(function(_, i) { return i; }));
            var sum = 0;
            s1.forEach(function (item) {
                sum += item;
            });
            t.assert(sum === (size * (size - 1)) / 2);
        });
    });
}); 