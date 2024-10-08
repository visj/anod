import { test, assert, Anod } from "../../helper/index.js";

/**
 *
 * @param {Anod} anod
 */
export function run(anod) {
    var { data, value, batch, effect, compute, root } = anod;
    test("data", function () {
        test("takes and returns an intestial value", function () {
            assert(data(1).val(), 1);
        });

        test("can be set by passing in a new value", function () {
            var s1 = data(1);
            s1.set(2);
            assert(s1.val(), 2);
        });

        test("does not throw if set to the same value twice in a batch", function () {
            var s1 = data(1);
            batch(function () {
                s1.set(2);
                s1.set(2);
            });
            assert(s1.val(), 2);
        });

        test("throws if set to two different values in a batch", function () {
            var s1 = data(1);
            batch(function () {
                s1.set(2);
                assert.throws(function () {
                    s1.set(3);
                });
            });
        });

        test("does not throw if set to the same value twice in a computation", function () {
            var s1 = data(1);
            var c1 = compute(function () {
                s1.set(2);
                s1.set(2);
            });
            c1.val();
            assert(s1.val(), 2);
        });

        test("throws if set to two different values in a computation", function () {
            var s1 = data(1);
            effect(function () {
                s1.set(2);
                assert.throws(function () {
                    s1.set(3);
                });
            });
        });
    });
    test("value", function () {
        test("takes and returns an intestial value", function () {
            var s1 = value(1).val();
            assert(s1, 1);
        });

        test("can be set by passing in a new value", function () {
            var s1 = value(1);
            s1.set(2);
            assert(s1.val(), 2);
        });

        test("does not propagate if set to equal value", function () {
            root(function () {
                var s1 = value(1);
                var count = 0;
                var c1 = compute(function () {
                    s1.val();
                    return ++count;
                });

                assert(c1.val(), 1);
                s1.set(1);
                assert(c1.val(), 1);
            });
        });

        test("propagate if set to unequal value", function () {
            root(function () {
                var s1 = value(1);
                var counter = 0;
                var c1 = compute(function () {
                    s1.val();
                    return ++counter;
                });

                assert(c1.val(), 1);
                s1.set(1);
                assert(c1.val(), 1);
                s1.set(2);
                assert(c1.val(), 2);
            });
        });

        test("can take an equaltesty predicate", function () {
            root(function () {
                var s1 = value([1], function (a, b) {
                    return a[0] === b[0];
                });
                var count = 0;
                var c1 = compute(function () {
                    s1.val();
                    return ++count;
                });

                assert(c1.val(), 1);
                s1.set([1]);
                assert(c1.val(), 1);
                s1.set([2]);
                assert(c1.val(), 2);
            });
        });
    });
}
