import { test, root, compute, value, batch } from './helper/anod.js';

describe("data", function () {
    it("takes and returns an initial value", function () {
        test.equals(value(1).val(), 1);
    });

    it("can be set by passing in a new value", function () {
        var s1 = value(1);
        s1.update(2);
        test.equals(s1.val(), 2);
    });

    it("does not throw if set to the same value twice in a batch", function () {
        var s1 = value(1);
        batch(function () {
            s1.update(2);
            s1.update(2);
        });
        test.equals(s1.val(), 2);
    });

    it("throws if set to two different values in a batch", function () {
        var s1 = value(1);
        batch(function () {
            s1.update(2);
            test.throws(function () {
                s1.update(3);
            });
        });
    });

    it("does not throw if set to the same value twice in a computation", function () {
        root(function () {
            var s1 = value(1);
            compute(function () {
                s1.update(2);
                s1.update(2);
            });
            test.equals(s1.val(), 2);
        });
    });

    it("throws if set to two different values in a computation", function () {
        root(function () {
            var s1 = value(1);
            compute(function () {
                s1.update(2);
                test.throws(function () {
                    s1.update(3);
                });
            });
        });
    });
});
