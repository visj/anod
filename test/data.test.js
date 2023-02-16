import assert from 'assert';
import { root, compute, value, batch } from './helper/zorn.js';

describe("data", function () {
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

    it("does not throw if set to the same value twice in a batch", function () {
        var d = value(1);
        batch(function () {
            d.val = 2;
            d.val = 2;
        });
        assert.equal(d.val, 2);
    });

    it("throws if set to two different values in a batch", function () {
        var d = value(1);
        batch(function () {
            d.val = 2;
            assert.throws(function () {
                d.val = 3;
            }, /Zorn: Conflict/);
        });
    });

    it("does not throw if set to the same value twice in a computation", function () {
        root(function () {
            var d = value(1);
            compute(function () {
                d.val = 2;
                d.val = 2;
            });
            assert.equal(d.val, 2);
        });
    });

    it("throws if set to two different values in a computation", function () {
        root(function () {
            var d = value(1);
            compute(function () {
                d.val = 2;
                assert.throws(function () {
                    d.val = 3;
                }, /Zorn: Conflict/);
            });
        });
    });
});
