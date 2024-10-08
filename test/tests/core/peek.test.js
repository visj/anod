import { test, assert, Anod } from "../../helper/index.js";

/**
 *
 * @param {Anod} anod
 */
export function run(anod) {
    var { value, compute, effect, sample } = anod;
    
    test("peek", function () {
        test("returns the value of a data", function () {
            var s1 = value(1);
            assert(s1.peek(), 1);
        });

        test("avoids a dedendency", function () {
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
            assert(count, 1);
            s1.set(5);
            assert(count, 2);
            s2.set(4);
            assert(count, 2);
            s3.set(6);
            assert(count, 3);
        });

        test("can take computed values", function () {
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
            effect(function() {
                c1.val();
            });
            assert(count, 1);
            s2.set(4);
            assert(count, 1);
            s1.set(5);
            assert(count, 2);
        });
    });
}
