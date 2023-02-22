import { test, root, compute, value } from './helper/zorn.js';

describe("value", function () {
    it("takes and returns an initial value", function () {
        test.equals(value(1).val , 1);
    });

    it("can be set by passing in a new value", function () {
        var d = value(1);
        d.set(2);
        test.equals(d.val , 2);
    });

    it("does not propagate if set to equal value", function () {
        root(function () {
            var d = value(1);
            var e = 0;
            var f = compute(function () {
                d.val;
                return ++e;
            });

            test.equals(f.val , 1);
            d.set(1);
            test.equals(f.val , 1);
        });
    });

    it("propagate if set to unequal value", function () {
        root(function () {
            var d = value(1);
            var e = 0;
            var f = compute(function () {
                d.val;
                return ++e;
            });

            test.equals(f.val , 1);
            d.set(1);
            test.equals(f.val , 1);
            d.set(2);
            test.equals(f.val , 2);
        });
    });

    it("can take an equality predicate", function () {
        root(function () {
            var d = value([1], function (a, b) { 
                return a[0] === b[0]; 
            });
            var e = 0;
            var f = compute(function () { 
                d.val; 
                return ++e;
            });

            test.equals(f.val , 1);
            d.set([1]);
            test.equals(f.val , 1);
            d.set([2]);
            test.equals(f.val , 2);
        });
    });
});
