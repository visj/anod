import assert from 'assert';
import { root, compute, $compute, effect, data } from './helper/zorn.js';

describe("compute()", function () {
    describe("creation", function () {
        it("returns initial value of wrapped function", function () {
            root(function () {
                var f = compute(function () { return 1; });
                assert.equal(f.val, 1);
            });
        });
    });

    describe("evaluation", function () {
        it("occurs once intitially", function () {
            root(function () {
                var calls = 0;
                compute(function () {
                    calls++;
                });
                assert.equal(calls, 1);
            });
        });

        it("does not re-occur when read", function () {
            root(function () {
                var calls = 0;
                var f = compute(function () {
                    calls++;
                });

                f.val; f.val; f.val;

                assert.equal(calls, 1);
            });
        });
    });

    describe("with a dependency on an data", function () {
        it("updates when data is set", function () {
            root(function () {
                var d = data(1);
                var fevals = 0;
                effect(function () {
                    fevals++;
                    d.val;
                });

                fevals = 0;

                d.val = 1;
                assert.equal(fevals, 1);
            });
        });

        it("does not update when data is read", function () {
            root(function () {
                var d = data(1);
                var fevals = 0;
                effect(function () {
                    fevals++;
                    d.val;
                });

                fevals = 0;

                d.val;
                assert.equal(fevals, 0);
            });
        });

        it("updates return value", function () {
            root(function () {
                var d = data(1);
                var f = compute(function () {
                    return d.val;
                });

                d.val = 2;
                assert.equal(f.val, 2);
            });
        });
    });

    describe("with changing dependencies", function () {
        var i, t, e, fevals, f;

        function init() {
            i = data(true);
            t = data(1);
            e = data(2);
            fevals = 0;
            f = $compute(function () {
                fevals++;
                return i.val ? t.val : e.val;
            });
            fevals = 0;
        }

        it("updates on active dependencies", function () {
            root(function () {
                init();
                t.val = 5;
                assert.equal(fevals, 1);
                assert.equal(f.val, 5);
            });
        });

        it("does not update on inactive dependencies", function () {
            root(function () {
                init();
                e.val = 5;
                assert.equal(fevals, 0);
                assert.equal(f.val, 1);
            });
        });

        it("deactivates obsolete dependencies", function () {
            root(function () {
                init();
                i.val = false;
                fevals = 0;
                t.val = 5;
                assert.equal(fevals, 0);
            });
        });

        it("activates new dependencies", function () {
            root(function () {
                init();
                i.val = false;
                fevals = 0;
                e.val = 5;
                assert.equal(fevals, 1);
            });
        });
    });

    describe("that creates an data", function () {
        it("does not register a dependency", function () {
            root(function () {
                var fevals = 0, d;
                effect(function () {
                    fevals++;
                    d = data(1);
                });
                fevals = 0;
                d.val = 2;
                assert.equal(fevals, 0);
            });
        });
    });

    describe("from a function with no return value", function () {
        it("reads as undefined", function () {
            root(function () {
                var f = compute(function () { });
                assert(f.val == null);
            });
        });
    });

    describe("with a seed", function () {
        it("reduces seed value", function () {
            root(function () {
                var a = data(5);
                var f = compute(function (v) {
                    return v + a.val;
                }, 5);
                assert.equal(f.val, 10);
                a.val = 6;
                assert.equal(f.val, 16);
            });
        });
    });

    describe("with a dependency on a computation", function () {
        var d, fcount, f, gcount, g;

        function init() {
            d = data(1);
            fcount = 0;
            f = compute(function () {
                fcount++;
                return d.val;
            });
            gcount = 0;
            g = compute(function () {
                gcount++;
                return f.val;
            });
        }

        it("does not cause re-evaluation", function () {
            root(function () {
                init();
                assert.equal(fcount, 1);
            });
        });

        it("does not occur from a read", function () {
            root(function () {
                init();
                f.val;
                assert.equal(gcount, 1);
            });
        });

        it("does not occur from a read of the watcher", function () {
            root(function () {
                init();
                g.val;
                assert.equal(gcount, 1);
            });
        });

        it("occurs when computation updates", function () {
            root(function () {
                init();
                d.val = 2;
                assert.equal(fcount, 2);
                assert.equal(gcount, 2);
                assert.equal(g.val, 2);
            });
        });
    });

    describe("with unending changes", function () {
        it("throws when continually setting a direct dependency", function () {
            root(function () {
                var d = data(1);
                assert.throws(function () {
                    effect(function () {
                        d.val;
                        d.val = 2;
                    });
                });
            });
        });

        it("throws when continually setting an indirect dependency", function () {
            root(function () {
                var d = data(1);
                var f1 = compute(function () { return d.val; });
                var f2 = compute(function () { return f1.val; });
                var f3 = compute(function () { return f2.val; });

                assert.throws(function () {
                    effect(function () {
                        f3.val;
                        d.val = 2;
                    });
                });
            });
        });
    });

    describe("with circular dependencies", function () {
        it("throws when cycle created by modifying a branch", function () {
            root(function () {
                var d = data(1);
                var f = compute(function () {
                    return f ? f.val : d.val;
                });
                assert.throws(function () {
                    d.val = 0;
                });
            });
        });
    });

    describe("with converging dependencies", function () {
        it("propagates in topological order", function () {
            root(function () {
                //
                //     c1
                //    /  \
                //   /    \
                //  b1     b2
                //   \    /
                //    \  /
                //     a1 
                //
                var seq = "";
                var a1 = data(true);
                var b1 = compute(function () { a1.val; seq += "b1"; });
                var b2 = compute(function () { a1.val; seq += "b2"; });
                var c1 = compute(function () { b1.val, b2.val; seq += "c1"; });

                seq = "";
                a1.val = true;

                assert.equal(seq, "b1b2c1");
            });
        });

        it("only propagates once with linear convergences", function () {
            root(function () {
                //         d
                //         |
                // +---+---+---+---+
                // v   v   v   v   v
                // f1  f2  f3  f4  f5
                // |   |   |   |   |
                // +---+---+---+---+
                //         v
                //         g
                var d = data(0);
                var f1 = compute(function () { return d.val; });
                var f2 = compute(function () { return d.val; });
                var f3 = compute(function () { return d.val; });
                var f4 = compute(function () { return d.val; });
                var f5 = compute(function () { return d.val; });
                var gcount = 0;
                effect(function () {
                    gcount++;
                    return f1.val + f2.val + f3.val + f4.val + f5.val;
                });

                gcount = 0;
                d.val = 0;
                assert.equal(gcount, 1);
            });
        });

        it("only propagates once with exponential convergence", function () {
            root(function () {
                //     d
                //     |
                // +---+---+
                // v   v   v
                // f1  f2 f3
                //   \ | /
                //     O
                //   / | \
                // v   v   v
                // g1  g2  g3
                // +---+---+
                //     v
                //     h
                var d = data(0);
                var f1 = compute(function () { return d.val; });
                var f2 = compute(function () { return d.val; });
                var f3 = compute(function () { return d.val; });
                var g1 = compute(function () { return f1.val + f2.val + f3.val; });
                var g2 = compute(function () { return f1.val + f2.val + f3.val; });
                var g3 = compute(function () { return f1.val + f2.val + f3.val; });

                var hcount = 0;
                effect(function () {
                    hcount++;
                    g1.val + g2.val + g3.val;
                });

                hcount = 0;
                d.val = 0;
                assert.equal(hcount, 1);
            });
        });
    });
});
