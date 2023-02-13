var { root, compute, effect, data, freeze } = require('../dist/zorn.cjs');

var assert = require('assert');

describe("exceptions within S computations", function () {
    it("halt updating", function () {
        root(function () {
            var a = data(false)
            var b = data(1);
            effect(function () {
                if (a.val) {
                    throw new Error("xxx");
                }
            });
            var d = compute(function () {
                return b.val
            });

            assert.throws(function () {
                freeze(function () {
                    a.val = true;
                    b.val = 2;
                });
            })

            assert.equal(b.val, 2);
            assert.equal(d.val, 1);
        });
    });

    it("do not leave stale scheduled updates", function () {
        root(function () {
            var a = data(false);
            var b = data(1);
            compute(function () {
                if (a.val) {
                    throw new Error("xxx");
                }
            });
            var d = compute(function () {
                return b.val;
            });

            assert.throws(function () {
                freeze(function () {
                    a.val = true;
                    b.val = 2;
                });
            });

            assert.equal(d.val, 1);

            // updating a() should not trigger previously scheduled updated of b(), since htat propagation excepted
            a.val = false;

            assert.equal(d.val, 1);
        });
    });

    it("leave non-excepted parts of dependency tree intact", function () {
        root(function () {
            var a = data(false);
            var b = data(1);
            effect(function () {
                if (a.val) {
                    throw new Error("xxx");
                }
            });
            var d = compute(function () { return b.val });

            assert.throws(function () {
                freeze(function () {
                    a.val = true;
                    b.val = 2;
                });
            });

            assert.equal(b.val, 2);
            assert.equal(d.val, 1);

            b.val = 3;

            assert.equal(b.val, 3);
            assert.equal(d.val, 3);
        });
    });
});