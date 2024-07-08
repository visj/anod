import { test, root, compute, value } from './helper/anod.js';

describe("Computations which modify data", function () {
    it("batch data while executing computation", function () {
        root(function () {
            var a = value(false);
            var b = value(0);
            var cb;
            compute(function () {
                if (a.val()) {
                    b.update(1);
                    cb = b.val();
                    a.update(false);
                }
            });

            b.update(0);
            a.update(true);

            test.equals(b.val() , 1);
            test.equals(cb , 0);
        });
    });

    it("batch data while propagating", function () {
        root(function () {
            var seq = "";
            var a = value(false);
            var b = value(0);
            var db;
            compute(function () {
                if (a.val()) {
                    seq += "c";
                    b.update(1);
                    a.update(false);
                }
            });
            compute(function () {
                if (a.val()) {
                    seq += "d";
                    db = b.val();
                }
            });

            b.update(0);
            seq = "";
            a.update(true);

            test.equals(seq , "cd");
            test.equals(b.val() , 1);
            test.equals(db , 0); // d saw b(0) even though it ran after c whcih modified b() to b(1)
        });
    });

    it("continue running until changes stop", function () {
        root(function () {
            var seq = "";
            var a = value(0);

            compute(function () {
                seq += a.val();
                if (a.val() < 10) {
                    a.update(a.peek() + 1);
                }
            });

            test.equals(seq , "012345678910");
            test.equals(a.val() , 10);
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
            var b1 = compute(function () { return a1.val(); });
            compute(function () { c1.update(a1.val()); });
            var b3 = compute(function () { return a1.val(); });
            compute(function () { seq += "c4(" + c1.val() + ")"; b1.val(); });
            compute(function () { seq += "c5(" + c1.val() + ")"; b3.val(); });

            seq = "";
            a1.update(1);

            test.equals(seq , "c4(0)c5(0)c4(1)c5(1)");
        });
    });
})
