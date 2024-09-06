import { test, assert, throws } from "../helper/index.js";

export function run(anod) {
    test("data", function () {
        test("takes and returns an intestial value", function () {
            assert(anod.value(1).val(), 1);
        });
    
        test("can be set by passing in a new value", function () {
            var s1 = anod.value(1);
            s1.update(2);
            assert(s1.val(), 2);
        });
    
        test("does not throw if set to the same value twice in a batch", function () {
            var s1 = anod.value(1);
            anod.batch(function () {
                s1.update(2);
                s1.update(2);
            });
            assert(s1.val(), 2);
        });
    
        test("throws if set to two different values in a batch", function () {
            var s1 = anod.value(1);
            anod.batch(function () {
                s1.update(2);
                throws(function () {
                    s1.update(3);
                });
            });
        });
    
        test("does not throw if set to the same value twice in a computation", function () {
            anod.root(function () {
                var s1 = anod.value(1);
                anod.compute(function () {
                    s1.update(2);
                    s1.update(2);
                });
                assert(s1.val(), 2);
            });
        });
    
        test("throws if set to two different values in a computation", function () {
            anod.root(function () {
                var s1 = anod.value(1);
                anod.compute(function () {
                    s1.update(2);
                    throws(function () {
                        s1.update(3);
                    });
                });
            });
        });
    });
}