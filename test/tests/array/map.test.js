import { test } from "../../helper/index.js";
import { array } from "../../../build/index.js";
import { shallowEq } from "../../helper/array.js";

test("map", function(t) {
    test("create", function(t) {
        var s1 = array([1,2,3]);
        var c1 = s1.map(function(val) {
            return val.toString();
        });
        t.assert(shallowEq(c1.val(), ["1", "2", "3"]));
    });

    test("update from empty", function(t) {
        var s1 = array([]);
        var c1 = s1.map(function(val) {
            return val.toString();
        });
        t.assert(shallowEq(c1.val(), []));
        s1.set([1,2,3]);
        t.assert(shallowEq(c1.val(), ["1", "2", "3"]));
    });

    test("clear", function(t) {
        var s1 = array([1,2,3]);
        var c1 = s1.map(function(val) {
            return val.toString();
        });
        t.assert(shallowEq(c1.val(), ["1", "2", "3"]));
        s1.set([]);
        t.assert(shallowEq(c1.val(), []));
    });
});