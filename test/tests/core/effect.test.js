import { test, assert, Anod } from "../../helper/index.js";

/**
 *
 * @param {Anod} anod
 */
export function run(anod) {
    var { value, effect, compute, cleanup, root } = anod;
    test("effect", function () {
        test("that modifies signals", function () {
            test("batch data while executing computation", function () {
                var s1 = value(false);
                var s2 = value(0);
                var v1;
                effect(function () {
                    if (s1.val()) {
                        s2.set(1);
                        v1 = s2.val();
                        s1.set(false);
                    }
                });
                s1.set(true);
                assert(s2.val(), 1);
                assert(v1, 0);
            });
            test("throws when continually setting a direct dependency", function () {
                var s1 = value(1);
                assert.throws(function () {
                    effect(function () {
                        s1.val();
                        s1.set(s1.peek() + 1);
                    });
                });
            });
            test("throws when continually setting an indirect dependency", function () {
                var s1 = value(1);
                var c1 = compute(function () {
                    return s1.val();
                });
                var c2 = compute(function () {
                    return c1.val();
                });
                var c3 = compute(function () {
                    return c2.val();
                });
                assert.throws(function () {
                    effect(function () {
                        c3.val();
                        s1.set(s1.peek() + 1);
                    });
                });
            });
            test("batch data while propagating", function () {
                var s1 = value(false);
                var s2 = value(0);
                var v1;
                var seq = "";
                effect(function () {
                    if (s1.val()) {
                        seq += "c1";
                        s2.set(1);
                        s1.set(false);
                    }
                });
                effect(function () {
                    if (s1.val()) {
                        seq += "c2";
                        v1 = s2.val();
                    }
                });
                seq = "";
                s1.set(true);
                assert(seq, "c1c2");
                assert(s2.val(), 1);
                assert(v1, 0);
            });
            test("continue running until changes stop", function () {
                var seq = "";
                var s1 = value(0);
                effect(function () {
                    seq += s1.val();
                    if (s1.val() < 10) {
                        s1.set(s1.peek() + 1);
                    }
                });
                assert(seq, "012345678910");
                assert(s1.val(), 10);
            });
        });

        test("propagate changes topologically", function () {
            var seq = "";
            var s1 = value(0);
            var s2 = value(0);
            var c1 = compute(function () {
                seq += "c1";
                return s1.val();
            });
            effect(function () {
                seq += "e1";
                s2.set(s1.val()); 
            });
            var c2 = compute(function() {
                seq += "c2";
                return s2.val();
            });
            effect(function () { 
                seq += "e2s2{" + s2.val() + "}";
                c1.val();
            });
            effect(function () {
                seq += "e3s2{" + s2.val() + "}";
                c2.val();
            });
            seq = "";
            s1.set(1);
            assert(seq, "c1e1e2s2{0}c2e2s2{1}e3s2{1}");
        });

        test("cleanup", function () {
            test("is called when effect is updated", function () {
                var s1 = value(1);
                var count = 0;
                effect(function () {
                    s1.val();
                    cleanup(function () {
                        count++;
                    });
                });
                assert(count, 0);
                s1.set(2);
                assert(count, 1);
            });

            test("can be called from within a subcomputation", function () {
                var s1 = value(1);
                var calls = 0;
                effect(function () {
                    s1.val();
                    effect(function () {
                        cleanup(function () {
                            calls++;
                        });
                    });
                });
                assert(calls, 0);
                s1.set(2);
                assert(calls, 1);
            });

            test("accepts multiple anod.cleanup functions", function () {
                var s1 = value(1);
                var calls = 0;
                effect(function () {
                    s1.val();
                    cleanup(function () {
                        calls++;
                    });
                    cleanup(function () {
                        calls++;
                    });
                });
                assert(calls, 0);
                s1.set(2);
                assert(calls, 2);
            });

            test("runs cleanups in reverse order", function () {
                var s1 = value(1);
                var seq = "";
                effect(function () {
                    s1.val();
                    cleanup(function () {
                        seq += "cl1";
                    });
                    cleanup(function () {
                        seq += "cl2";
                    });
                });
                assert(seq, "");
                s1.set(2);
                assert(seq, "cl2cl1");
            });

            test("is run only once when a computation is disposed", function () {
                var s1 = value(1);
                var calls = 0;
                var r1 = root(function () {
                    effect(function () {
                        s1.val();
                        cleanup(function () {
                            calls++;
                        });
                    });
                    assert(calls, 0);
                    s1.set(s1.peek() + 1);
                    assert(calls, 1);
                });
                r1.dispose();
                assert(calls, 2);
                s1.set(s1.peek() + 1);
                assert(calls, 2);
            });
        });
    });
}

