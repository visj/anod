import assert from 'assert';
import { root, compute, value } from './helper/zorn.js';

describe("value", function () {
    it("takes and returns an initial value", function () {
        assert.equal(value(1).val, 1);
    });

    it("can be set by passing in a new value", function () {
        var d = value(1);
        d.val = 2;
        assert.equal(d.val, 2);
    });

    it("returns value being set", function () {
        var d = value(1);
        assert.equal(d.val = 2, 2);
    });

    it("does not propagate if set to equal value", function () {
        root(function () {
            var d = value(1);
            var e = 0;
            var f = compute(function () {
                d.val;
                return ++e;
            });

            assert.equal(f.val, 1);
            d.val = 1;
            assert.equal(f.val, 1);
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

            assert.equal(f.val, 1);
            d.val = 1;
            assert.equal(f.val, 1);
            d.val = 2;
            assert.equal(f.val, 2);
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

            assert.equal(f.val, 1);
            d.val = [1];
            assert.equal(f.val, 1);
            d.val = [2];
            assert.equal(f.val, 2);
        });
    });
});
