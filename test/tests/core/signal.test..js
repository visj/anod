import { test } from "../../helper/index.js";
import { data, value, batch, effect, compute, root, sample } from "../../../build/index.js";

test("data", function (t) {
    t.test("takes and returns an intestial value", function (t) {
        t.assert(data(1).val(), 1);
    });

    t.test("can be set by passing in a new value", function (t) {
        var s1 = data(1);
        s1.set(2);
        t.assert(s1.val(), 2);
    });

    t.test("does not throw if set to the same value twice in a batch", function (t) {
        var s1 = data(1);
        batch(function () {
            s1.set(2);
            s1.set(2);
        });
        t.assert(s1.val(), 2);
    });

    t.test("throws if set to two different values in a batch", function (t) {
        var s1 = data(1);
        batch(function () {
            s1.set(2);
            t.throws(function () {
                s1.set(3);
            });
        });
    });

    t.test("does not throw if set to the same value twice in a computation", function (t) {
        var s1 = data(1);
        var c1 = compute(function () {
            s1.set(2);
            s1.set(2);
        });
        c1.val();
        t.assert(s1.val(), 2);
    });

    t.test("throws if set to two different values in a computation", function (t) {
        var s1 = data(1);
        effect(function () {
            s1.set(2);
            t.throws(function () {
                s1.set(3);
            });
        });
    });
});

test("value", function (t) {
    t.test("takes and returns an intestial value", function (t) {
        var s1 = value(1).val();
        t.assert(s1, 1);
    });

    t.test("can be set by passing in a new value", function (t) {
        var s1 = value(1);
        s1.set(2);
        t.assert(s1.val(), 2);
    });

    t.test("does not propagate if set to equal value", function (t) {
        root(function () {
            var s1 = value(1);
            var count = 0;
            var c1 = compute(function () {
                s1.val();
                return ++count;
            });

            t.assert(c1.val(), 1);
            s1.set(1);
            t.assert(c1.val(), 1);
        });
    });

    t.test("propagate if set to unequal value", function (t) {
        root(function () {
            var s1 = value(1);
            var counter = 0;
            var c1 = compute(function () {
                s1.val();
                return ++counter;
            });

            t.assert(c1.val(), 1);
            s1.set(1);
            t.assert(c1.val(), 1);
            s1.set(2);
            t.assert(c1.val(), 2);
        });
    });

    t.test("can take an equaltesty predicate", function (t) {
        root(function () {
            var s1 = value([1], function (a, b) {
                return a[0] === b[0];
            });
            var count = 0;
            var c1 = compute(function () {
                s1.val();
                return ++count;
            });

            t.assert(c1.val(), 1);
            s1.set([1]);
            t.assert(c1.val(), 1);
            s1.set([2]);
            t.assert(c1.val(), 2);
        });
    });
});

test("peek", function (t) {
    t.test("returns the value of a data", function (t) {
        var s1 = value(1);
        t.assert(s1.peek(), 1);
    });

    t.test("avoids a dedendency", function (t) {
        var s1 = value(1);
        var s2 = value(2);
        var s3 = value(3);
        var count = 0;

        var c1 = compute(function () {
            count++;
            s1.val();
            s2.peek();
            s3.val();
        });
        effect(function () {
            c1.val();
        });
        t.assert(count, 1);
        s1.set(5);
        t.assert(count, 2);
        s2.set(4);
        t.assert(count, 2);
        s3.set(6);
        t.assert(count, 3);
    });

    t.test("can take computed values", function (t) {
        var s1 = value(1);
        var s2 = value(2);
        var s3 = value(3);
        var count = 0;

        var c1 = compute(function () {
            count++;
            s1.val();
            sample(function () {
                s1.val();
                s2.val();
            });
            s3.val();
        });
        effect(function () {
            c1.val();
        });
        t.assert(count, 1);
        s2.set(4);
        t.assert(count, 1);
        s1.set(5);
        t.assert(count, 2);
    });
});