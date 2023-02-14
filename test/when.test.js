import assert from 'assert';
import { root, val, compute, effect, $effect, data, when } from './helper/zorn.js';

describe("when(...)", function () {
    it("registers a dependency", function () {
        root(function () {
            var d = data(1);
            var count = 0;
            function counter() {
                count++;
            }
            effect(when(d, function () { counter(); }));

            assert.equal(count, 1);

            d.val = 2;

            assert.equal(count, 2);
        });
    });

    it("prohibits dynamic dependencies", function () {
        root(function () {
            var d1 = data(1);
            var d2 = data(2);
            var count = 0;
            function counter() {
                count++;
            }
            effect(when(d2, function () {
                counter();
                return d1.val;
            }));

            assert.equal(count, 1);

            d1.val = 2;

            assert.equal(count, 1);
        });
    });

    it("allows multiple dependencies", function () {
        root(function () {
            var a = data(1),
                b = data(2),
                c = data(3);
            var count = 0;
            function counter() {
                count++;
            }
            effect(when([a, b, c], function () { counter(); }));

            assert.equal(count, 1);

            a.val = 4;
            b.val = 5;
            c.val = 6;

            assert.equal(count, 4);
        });
    });

    it("modifies its accumulator when reducing", function () {
        root(function () {
            var a = data(1);

            var c = compute(when(a, function (v, sum) {
                return v + sum;
            }), 0);

            assert.equal(c.val, 1);

            a.val = 2;

            assert.equal(c.val, 3);

            a.val = 3;
            a.val = 4;

            assert.equal(c.val, 10);
        });
    });

    it("suppresses initial run when onchanges is true", function () {
        root(function () {
            var a = data(1);
            var c = compute(when(a, function (val) { 
                return val * 2;
            }, true), 0);

            assert.equal(c.val, 0);

            a.val = 2;

            assert.equal(c.val, 4);
        });
    });

    it("allows conditional dependencies", function () {
        root(function () {
            var a = data(1);
            var b = data(2);
            var c = data(3);
            var count = 0;
            function counter() {
                count++;
            }
            $effect(when(val(function() {
                if (a.val < 2) {
                    b.val;
                } else {
                    c.val;
                }
            }), counter));

            assert.equal(count, 1);
            c.val = 4;
            assert.equal(count, 1);
            a.val = 2;
            assert.equal(count, 2);
            a.val = 3;
            assert.equal(count, 3);
        });
    });
});
