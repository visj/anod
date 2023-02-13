var { root, compute, effect, data, value, freeze, on, sample } = require('../dist/zorn.cjs');

var assert = require('assert');

describe("on(...)", function () {
    it("registers a dependency", function () {
        root(function () {
            var d = data(1);
            var count = 0;
            function counter() {
                count++;
            }
            on(() => d.val, function () { counter(); });

            assert.equal(count, 1);
            
            d.val = 2;

            assert.equal(count, 2);
        });
    });

    it("prohibits dynamic dependencies", function () {
        root(function () {
            var d = data(1);
            var count = 0;
            function counter() {
                count++;
            }
            on(function () { }, function () {
                counter();
                return d.val;
            });

            assert.equal(count, 1);

            d.val = 2;

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
            on(function () {
                a.val; b.val; c.val;
            }, function () { counter(); });

            assert.equal(count, 1);

            a.val = 4;
            b.val = 5;
            c.val = 6;

            assert.equal(count, 4);
        });
    });

    it("allows an array of dependencies", function () {
        root(function () {
            var a = data(1),
                b = data(2),
                c = data(3);
            var count = 0;
            function counter() {
                count++;
            }
            f = on([() => a(), () => b(), () => c()], function () { counter(); });

            assert.equal(count, 1);

            a(4);
            b(5);
            c(6);

            assert.equal(count, 4);
        });
    });

    it("modifies its accumulator when reducing", function () {
        root(function () {
            var a = data(1),
                c = on(() => a(), function (sum) { return sum + a(); }, 0);

            assert.equal(c(), 1);

            a(2);

            assert.equal(c(), 3);

            a(3);
            a(4);

            assert.equal(c(), 10);
        });
    });

    it("suppresses initial run when onchanges is true", function () {
        root(function () {
            var a = data(1),
                c = on(() => a.val, function () { return a.val * 2; }, 0, true);

            assert.equal(c.val, 0);

            a.val = 2;

            assert.equal(c.val, 4);
        });
    })
});
