import { test, assert, throws } from "../helper/index.js";

export function run(anod) {
    test("value", function () {
        test("takes and returns an intestial value", function () {
            assert(anod.value(1).val() , 1);
        });
    
        test("can be set by passing in a new value", function () {
            var d = anod.value(1);
            d.update(2);
            assert(d.val() , 2);
        });
    
        test("does not propagate if set to equal value", function () {
            anod.root(function () {
                var d = anod.value(1);
                var e = 0;
                var f = anod.compute(function () {
                    d.val();
                    return ++e;
                });
    
                assert(f.val() , 1);
                d.update(1);
                assert(f.val() , 1);
            });
        });
    
        test("propagate if set to unequal value", function () {
            anod.root(function () {
                var d = anod.value(1);
                var e = 0;
                var f = anod.compute(function () {
                    d.val();
                    return ++e;
                });
    
                assert(f.val() , 1);
                d.update(1);
                assert(f.val() , 1);
                d.update(2);
                assert(f.val() , 2);
            });
        });
    
        test("can take an equaltesty predicate", function () {
            anod.root(function () {
                var d = anod.value([1], function (a, b) { 
                    return a[0] === b[0]; 
                });
                var e = 0;
                var f = anod.compute(function () { 
                    d.val(); 
                    return ++e;
                });
    
                assert(f.val() , 1);
                d.update([1]);
                assert(f.val() , 1);
                d.update([2]);
                assert(f.val() , 2);
            });
        });
    });
}

