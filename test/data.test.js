import { test, root, effect, compute, value, batch } from './helper/zorn.js';

describe("data", function () {
    it("takes and returns an initial value", function () {
        test.equals(value(1).val , 1);
    });

    it("can be set by passing in a new value", function () {
        var d = value(1);
        d.set(2);
        test.equals(d.val , 2);
    });

    it("does not throw if set to the same value twice in a batch", function () {
        var d = value(1);
        batch(function () {
            d.set(2);
            d.set(2);
        });
        test.equals(d.val , 2);
    });

    it("throws if set to two different values in a batch", function () {
        var d = value(1);
        batch(function () {
            d.set(2);
            test.throws(function () {
                d.set(3);
            }, /conflict/);
        });
    });

    it("does not throw if set to the same value twice in a computation", function () {
        root(function () {
            var d = value(1);
            compute(function () {
                d.set(2);
                d.set(2);
            });
            test.equals(d.val , 2);
        });
    });

    it("throws if set to two different values in a computation", function () {
        root(function () {
            var d = value(1);
            effect(function () {
                d.set(2);
                test.throws(function () {
                    d.set(3);
                }, /conflict/);
            });
        });
    });
});
