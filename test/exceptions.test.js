import { test, root, effect, compute, value, batch } from './helper/zorn.js';

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

            test.throws(function () {
                batch(function () {
                    a.set(true);
                    b.set(2);
                });
            })

            test.ok(b.val === 2);
            test.ok(d.val === 2);
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

            test.throws(function () {
                batch(function () {
                    a.set(true);
                    b.set(2);
                });
            });

            test.ok(b.val === 2);
            test.ok(d.val === 2);

            b.set(3);

            test.ok(b.val === 3);
            test.ok(d.val === 3);
        });
    });
});