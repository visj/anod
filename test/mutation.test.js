import assert from 'assert';
import { root, compute, signal } from './helper/zorn.js';

describe("Computations which modify data", function () {
    it("batch data while executing computation", function () {
        root(function () {
            var a = signal(false);
            var b = signal(0);
            var cb;
            compute(function () {
                if (a.val) {
                    b.val = 1;
                    cb = b.val;
                    a.val = false;
                }
            });

            b.val = 0;
            a.val = true;

            assert.equal(b.val, 1);
            assert.equal(cb, 0);
        });
    });

    it("batch data while propagating", function () {
        root(function () {
            var seq = "";
            var a = signal(false);
            var b = signal(0);
            var db;
            compute(function () {
                if (a.val) {
                    seq += "c";
                    b.val = 1;
                    a.val = false;
                }
            });
            compute(function () {
                if (a.val) {
                    seq += "d";
                    db = b.val;
                }
            });

            b.val = 0;
            seq = "";
            a.val = true;

            assert.equal(seq, "cd");
            assert.equal(b.val, 1);
            assert.equal(db, 0); // d saw b(0) even though it ran after c whcih modified b() to b(1)
        });
    });

    it("continue running until changes stop", function () {
        root(function () {
            var seq = "";
            var a = signal(0);

            compute(function () {
                seq += a.val;
                if (a.val < 10) {
                    a.val++;
                }
            });

            assert.equal(seq, "012345678910");
            assert.equal(a.val, 10);
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
            var a1 = signal(0);
            var c1 = signal(0);
            var b1 = compute(function () { return a1.val; });
            compute(function () { c1.val = a1.val; });
            var b3 = compute(function () { return a1.val; });
            compute(function () { seq += "c4(" + c1.val + ")"; return b1.val; });
            compute(function () { seq += "c5(" + c1.val + ")"; return b3.val; });

            seq = "";
            a1.val = 1;

            assert.equal(seq, "c4(0)c5(0)c4(1)c5(1)");
        });
    });
})
