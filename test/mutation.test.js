import { test, root, effect, compute, value } from './helper/zorn.js';

describe("Computations which modify data", function () {
    it("batch data while executing computation", function () {
        root(function () {
            var a = value(false);
            var b = value(0);
            var cb;
            effect(function () {
                if (a.val) {
                    b.set(1);
                    cb = b.val;
                    a.set(false);
                }
            });

            b.set(0);
            a.set(true);

            test.ok(b.val === 1);
            test.ok(cb === 0);
        });
    });

    it("batch data while propagating", function () {
        root(function () {
            var seq = "";
            var a = value(false);
            var b = value(0);
            var db;
            effect(function () {
                if (a.val) {
                    seq += "c";
                    b.set(1);
                    a.set(false);
                }
            });
            effect(function () {
                if (a.val) {
                    seq += "d";
                    db = b.val;
                }
            });

            b.set(0);
            seq = "";
            a.set(true);

            test.ok(seq === "cd");
            test.ok(b.val === 1);
            test.ok(db === 0); // d saw b(0) even though it ran after c whcih modified b() to b(1)
        });
    });

    it("continue running until changes stop", function () {
        root(function () {
            var seq = "";
            var a = value(0);

            effect(function () {
                seq += a.val;
                if (a.val < 10) {
                    a.set(a.peek + 1);
                }
            });

            test.ok(seq === "012345678910");
            test.ok(a.val === 10);
        });
    });

    it("propagate changes topologically", function () {
        root(function () {
            //
            //    d1      d2
            //    |  \  /  |
            //    |   c1   |
            //    |   ^    |
            //    |   :    |
            //    b1  b2  b3 
            //      \ | /
            //        a1
            //
            var seq = "";
            var a1 = value(0);
            var c1 = value(0);
            var b1 = compute(function () { return a1.val; });
            effect(function () { c1.set(a1.val); });
            var b3 = compute(function () { return a1.val; });
            effect(function () { seq += "c4(" + c1.val + ")"; b1.val; });
            effect(function () { seq += "c5(" + c1.val + ")"; b3.val; });

            seq = "";
            a1.set(1);

            test.ok(seq === "c4(0)c5(0)c4(1)c5(1)");
        });
    });
})
