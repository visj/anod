import { test, root, compute, value, batch } from './helper/anod.js';

describe("exceptions within computations", function () {
    it("halt updating", function () {
        root(function () {
            var a = value(false)
            var b = value(1);
            compute(function () {
                if (a.val()) {
                    throw new Error();
                }
            });
            var d = compute(function () {
                return b.val();
            });

            test.throws(function () {
                batch(function () {
                    a.update(true);
                    b.update(2);
                });
            })

            test.equals(b.val(), 2);
            test.equals(d.val(), 1);
        });
    });

    it("leave non-excepted parts of dependency tree intact", function () {
        root(function () {
            var a = value(false);
            var b = value(1);
            compute(function () {
                if (a.val()) {
                    throw new Error();
                }
            });
            var d = compute(function () { return b.val() });

            test.throws(function () {
                batch(function () {
                    a.update(true);
                    b.update(2);
                });
            });

            test.equals(b.val(), 2);
            test.equals(d.val(), 1);

            b.update(3);

            test.equals(b.val(), 3);
            test.equals(d.val(), 3);
        });
    });
});