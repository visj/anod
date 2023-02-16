import assert from 'assert';
import { root, effect, compute, value, batch } from './helper/zorn.js';

describe("exceptions within computations", function () {
    it("halt updating", function () {
        root(function () {
            var a = value(false)
            var b = value(1);
            effect(function () {
                if (a.val) {
                    throw new Error();
                }
            });
            var d = compute(function () {
                return b.val;
            });

            assert.throws(function () {
                batch(function () {
                    a.val = true;
                    b.val = 2;
                });
            })

            assert.equal(b.val, 2);
            assert.equal(d.val, 2);
        });
    });

    it("leave non-excepted parts of dependency tree intact", function () {
        root(function () {
            var a = value(false);
            var b = value(1);
            effect(function () {
                if (a.val) {
                    throw new Error();
                }
            });
            var d = compute(function () { return b.val });

            assert.throws(function () {
                batch(function () {
                    a.val = true;
                    b.val = 2;
                });
            });

            assert.equal(b.val, 2);
            assert.equal(d.val, 2);

            b.val = 3;

            assert.equal(b.val, 3);
            assert.equal(d.val, 3);
        });
    });
});