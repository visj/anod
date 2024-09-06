import { test, assert, throws } from "../helper/index.js";

export function run(anod) {
    test("anod.cleanup", function () {
        test("is called when a computation is disposed", function () {
            var s1 = anod.value(1);
            var calls = 0;
            anod.compute(function () {
                s1.val();
                anod.cleanup(function () {
                    calls++;
                });
            });
            assert(calls, 0);
            s1.update(s1.peek() + 1);
            assert(calls, 1);
        });

        test("can be called from wtesthin a subcomputation", function () {
            var s1 = anod.value(1);
            var calls = 0;
            anod.compute(function () {
                s1.val();
                anod.compute(function () {
                    anod.cleanup(function () {
                        calls++;
                    });
                });
            });
            assert(calls, 0);
            s1.update(s1.peek() + 1);
            assert(calls, 1);
        });

        test("accepts multiple anod.cleanup functions", function () {
            var s1 = anod.value(1);
            var calls = 0;
            anod.compute(function () {
                s1.val();
                anod.cleanup(function () {
                    calls++;
                });
                anod.cleanup(function () {
                    calls++;
                });
            });
            assert(calls, 0);
            s1.update(s1.peek() + 1);
            assert(calls, 2);
        });

        test("runs anod.cleanups in reverse order", function () {
            var s1 = anod.value(1);
            var calls = "";
            anod.compute(function () {
                s1.val();
                anod.cleanup(function () {
                    calls += "a";
                });
                anod.cleanup(function () {
                    calls += "b";
                });
            });
            assert(calls, "");
            s1.update(s1.peek() + 1);
            assert(calls, "ba");
        });

        test("can be run wtesthin root scope", function () {
            var calls = 0;
            anod.root(function (teardown) {
                anod.cleanup(function () {
                    calls++;
                });
                teardown();
                assert(calls, 1);
            });
        });

        test("is run only once when a computation is disposed", function () {
            var s1 = anod.value(1);
            var calls = 0;
            anod.root(function (teardown) {
                anod.compute(function () {
                    s1.val();
                    anod.cleanup(function () {
                        calls++;
                    });
                });
                assert(calls, 0);
                s1.update(s1.peek() + 1);
                assert(calls, 1);
                teardown();
                assert(calls, 2);
                s1.update(s1.peek() + 1);
                assert(calls, 2);
            });
        });
    });

}