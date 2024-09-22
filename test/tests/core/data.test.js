import { test, assert, Anod } from "../../helper/index.js";

/**
 *
 * @param {Anod} anod
 */
export function run(anod) {
    var { value, effect, compute, batch } = anod;
    test("data", function () {
        test("takes and returns an intestial value", function () {
            assert(value(1).val(), 1);
        });

        test("can be set by passing in a new value", function () {
            var s1 = value(1);
            s1.set(2);
            assert(s1.val(), 2);
        });

        test("does not throw if set to the same value twice in a batch", function () {
            var s1 = value(1);
            batch(function () {
                s1.set(2);
                s1.set(2);
            });
            assert(s1.val(), 2);
        });

        test("throws if set to two different values in a batch", function () {
            var s1 = value(1);
            batch(function () {
                s1.set(2);
                assert.throws(function () {
                    s1.set(3);
                });
            });
        });

        test("does not throw if set to the same value twice in a computation", function () {
            var s1 = value(1);
            var c1 = compute(function () {
                s1.set(2);
                s1.set(2);
            });
            c1.val();
            assert(s1.val(), 2);
        });

        test("throws if set to two different values in a computation", function () {
            var s1 = value(1);
            effect(function () {
                s1.set(2);
                assert.throws(function () {
                    s1.set(3);
                });
            });
        });
    });
}
