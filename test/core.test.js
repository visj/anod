import { test, root, compute, value } from './helper/anod.js';

describe("compute()", function () {
    describe("creation", function () {
        it("returns initial value of wrapped function", function () {
            root(function () {
                var f = compute(function () { return 1; });
                test.equals(f.val() , 1);
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
                test.equals(calls , 1);
            });
        });

        it("does not re-occur when read", function () {
            root(function () {
                var calls = 0;
                var f = compute(function () {
                    calls++;
                });

                f.val(); f.val(); f.val();

                test.equals(calls , 1);
            });
        });
    });

    describe("with a dependency on an data", function () {
        it("updates when data is set", function () {
            root(function () {
                var d = value(1);
                var fevals = 0;
                compute(function () {
                    fevals++;
                    d.val();
                });

                fevals = 0;

                d.update(d.peek() + 1);
                test.equals(fevals , 1);
            });
        });

        it("does not update when data is read", function () {
            root(function () {
                var d = value(1);
                var fevals = 0;
                compute(function () {
                    fevals++;
                    d.val();
                });

                fevals = 0;

                d.val();
                test.equals(fevals , 0);
            });
        });

        it("updates return value", function () {
            root(function () {
                var d = value(1);
                var f = compute(function () {
                    return d.val();
                });

                d.update(2);
                test.equals(f.val() , 2);
            });
        });
    });

    describe("with changing dependencies", function () {
        var i, t, e, fevals, f;

        function init() {
            i = value(true);
            t = value(1);
            e = value(2);
            fevals = 0;
            f = compute(function () {
                fevals++;
                return i.val() ? t.val() : e.val();
            }, 0, void 0, true);
            fevals = 0;
        }

        it("updates on active dependencies", function () {
            root(function () {
                init();
                t.update(5);
                test.equals(fevals , 1);
                test.equals(f.val() , 5);
            });
        });

        it("does not update on inactive dependencies", function () {
            root(function () {
                init();
                e.update(5);
                test.equals(fevals , 0);
                test.equals(f.val() , 1);
            });
        });

        it("deactivates obsolete dependencies", function () {
            root(function () {
                init();
                i.update(false);
                fevals = 0;
                t.update(5);
                test.equals(fevals , 0);
            });
        });

        it("activates new dependencies", function () {
            root(function () {
                init();
                i.update(false);
                fevals = 0;
                e.update(5);
                test.equals(fevals , 1);
            });
        });
    });

    describe("that creates an data", function () {
        it("does not register a dependency", function () {
            root(function () {
                var fevals = 0, d;
                compute(function () {
                    fevals++;
                    d = value(1);
                });
                fevals = 0;
                d.update(2);
                test.equals(fevals , 0);
            });
        });
    });

    describe("from a function with no return value", function () {
        it("reads as undefined", function () {
            root(function () {
                var f = compute(function () { });
                test.ok(f.val() == null);
            });
        });
    });

    describe("with a seed", function () {
        it("reduces seed value", function () {
            root(function () {
                var a = value(5);
                var f = compute(function (v) {
                    return v + a.val();
                }, 5);
                test.equals(f.val() , 10);
                a.update(6);
                test.equals(f.val() , 16);
            });
        });
    });

    describe("with a dependency on a computation", function () {
        var d, fcount, f, gcount, g;

        function init() {
            d = value(1);
            fcount = 0;
            f = compute(function () {
                fcount++;
                return d.val();
            });
            gcount = 0;
            g = compute(function () {
                gcount++;
                return f.val();
            });
        }

        it("does not cause re-evaluation", function () {
            root(function () {
                init();
                test.equals(fcount , 1);
            });
        });

        it("does not occur from a read", function () {
            root(function () {
                init();
                f.val();
                test.equals(gcount , 1);
            });
        });

        it("does not occur from a read of the watcher", function () {
            root(function () {
                init();
                g.val();
                test.equals(gcount , 1);
            });
        });

        it("occurs when computation updates", function () {
            root(function () {
                init();
                d.update(2);
                test.equals(fcount , 2);
                test.equals(gcount , 2);
                test.equals(g.val() , 2);
            });
        });
    });

    describe("with unending changes", function () {
        it("throws when continually setting a direct dependency", function () {
            root(function () {
                var d = value(1);
                test.throws(function () {
                    compute(function () {
                        d.val();
                        d.update(d.peek() + 1);
                    });
                });
            });
        });

        it("throws when continually setting an indirect dependency", function () {
            root(function () {
                var d = value(1);
                var f1 = compute(function () { return d.val(); });
                var f2 = compute(function () { return f1.val(); });
                var f3 = compute(function () { return f2.val(); });

                test.throws(function () {
                    compute(function () {
                        f3.val();
                        d.update(d.peek() + 1);
                    });
                });
            });
        });
    });

    describe("with circular dependencies", function () {
        it("throws when cycle created by modifying a branch", function () {
            root(function () {
                var d = value(1);
                var f = compute(function () {
                    return f ? f.val() : d.val();
                });
                test.throws(function () {
                    d.update(0);
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
                var a1 = value(0);
                var b1 = compute(function () { seq += "b1"; return a1.val(); });
                var b2 = compute(function () { seq += "b2"; return a1.val(); });
                compute(function () { b1.val(), b2.val(); seq += "c1"; });

                seq = "";
                a1.update(a1.peek() + 1);

                test.equals(seq , "b1b2c1");
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
                var d = value(0);
                var f1 = compute(function () { return d.val(); });
                var f2 = compute(function () { return d.val(); });
                var f3 = compute(function () { return d.val(); });
                var f4 = compute(function () { return d.val(); });
                var f5 = compute(function () { return d.val(); });
                var gcount = 0;
                compute(function () {
                    gcount++;
                    return f1.val() + f2.val() + f3.val() + f4.val() + f5.val();
                });

                gcount = 0;
                d.update(d.peek() + 1);
                test.equals(gcount , 1);
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
                var d = value(0);
                var f1 = compute(function () { return d.val(); });
                var f2 = compute(function () { return d.val(); });
                var f3 = compute(function () { return d.val(); });
                var g1 = compute(function () { return f1.val() + f2.val() + f3.val(); });
                var g2 = compute(function () { return f1.val() + f2.val() + f3.val(); });
                var g3 = compute(function () { return f1.val() + f2.val() + f3.val(); });

                var hcount = 0;
                compute(function () {
                    hcount++;
                    g1.val() + g2.val() + g3.val();
                });

                hcount = 0;
                d.update(d.peek() + 1);
                test.equals(hcount , 1);
            });
        });
    });
});
