import { test, assert, Anod } from "../../helper/index.js";

/**
 *
 * @param {Anod} anod
 */
export function run(anod) {
    test("with unending changes", function () {
        test("throws when continually setting a direct dependency", function () {
            anod.root(function () {
                var d = anod.value(1);
                assert.throws(function () {
                    anod.effect(function () {
                        d.val();
                        d.update(d.peek() + 1);
                    });
                });
            });
        });

        test("throws when continually setting an indirect dependency", function () {
            anod.root(function () {
                var s1 = anod.value(1);
                var c1 = anod.compute(function () {
                    return s1.val();
                });
                var c2 = anod.compute(function () {
                    return c1.val();
                });
                var c3 = anod.compute(function () {
                    return c2.val();
                });

                assert.throws(function () {
                    anod.effect(function () {
                        c3.val();
                        s1.update(s1.peek() + 1);
                    });
                });
            });
        });
    });

    test("cleanup", function () {
        test("is called when effect is updated", function () {
            var s1 = anod.value(1);
            var calls = 0;
            anod.effect(function () {
                s1.val();
                anod.cleanup(function () {
                    calls++;
                });
            });
            assert(calls, 0);
            s1.update(s1.peek() + 1);
            assert(calls, 1);
        });

        test("can be called from within a subcomputation", function () {
            var s1 = anod.value(1);
            var calls = 0;
            anod.effect(function () {
                s1.val();
                anod.effect(function () {
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
            anod.effect(function () {
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
            anod.effect(function () {
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

        test("is run only once when a computation is disposed", function () {
            var s1 = anod.value(1);
            var calls = 0;
            var r1 = anod.root(function () {
                anod.effect(function () {
                    s1.val();
                    anod.cleanup(function () {
                        calls++;
                    });
                });
                assert(calls, 0);
                s1.update(s1.peek() + 1);
                assert(calls, 1);
            });
            r1.dispose();
            assert(calls, 2);
            s1.update(s1.peek() + 1);
            assert(calls, 2);
        });
    });
}

