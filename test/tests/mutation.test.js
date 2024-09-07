import { test, assert, Anod } from "../helper/index.js";

/**
 * 
 * @param {Anod} anod 
 */
export function run(anod) {
    test("computations which modify data", function () {
        test("batch data while executing computation", function () {
            anod.root(function () {
                var a = anod.value(false);
                var b = anod.value(0);
                var cb;
                anod.compute(function () {
                    if (a.val()) {
                        b.update(1);
                        cb = b.val();
                        a.update(false);
                    }
                });
    
                b.update(0);
                a.update(true);
    
                assert(b.val() , 1);
                assert(cb , 0);
            });
        });
    
        test("batch data while propagating", function () {
            anod.root(function () {
                var seq = "";
                var a = anod.value(false);
                var b = anod.value(0);
                var db;
                anod.compute(function () {
                    if (a.val()) {
                        seq += "c";
                        b.update(1);
                        a.update(false);
                    }
                });
                anod.compute(function () {
                    if (a.val()) {
                        seq += "d";
                        db = b.val();
                    }
                });
    
                b.update(0);
                seq = "";
                a.update(true);
    
                assert(seq , "cd");
                assert(b.val() , 1);
                assert(db , 0); // d saw b(0) even though test ran after c whcih modified b() to b(1)
            });
        });
    
        test("continue running until changes stop", function () {
            anod.root(function () {
                var seq = "";
                var a = anod.value(0);
    
                anod.compute(function () {
                    seq += a.val();
                    if (a.val() < 10) {
                        a.update(a.peek() + 1);
                    }
                });
    
                assert(seq , "012345678910");
                assert(a.val() , 10);
            });
        });
    
        test("propagate changes topologically", function () {
            anod.root(function () {
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
                var a1 = anod.value(0);
                var c1 = anod.value(0);
                var b1 = anod.compute(function () { return a1.val(); });
                anod.compute(function () { c1.update(a1.val()); });
                var b3 = anod.compute(function () { return a1.val(); });
                anod.compute(function () { seq += "c4(" + c1.val() + ")"; b1.val(); });
                anod.compute(function () { seq += "c5(" + c1.val() + ")"; b3.val(); });
    
                seq = "";
                a1.update(1);
    
                assert(seq , "c4(0)c5(0)c4(1)c5(1)");
            });
        });
    })
}

