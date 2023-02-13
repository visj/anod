var { root, compute, effect, data, value, freeze, on, peek } = require('../dist/zorn.cjs');

var assert = require('assert');

describe("peek(...)", function () {
    it("avoids a dedendency", function () {
        root(function () {
            var a = data(1);
            var b = data(2);
            var c = data(3);
            var d = 0;
            effect(function () {
                d++;
                a.val;
                peek(b);
                c.val;
            });

            assert.equal(d, 1);

            b.val = 4;

            assert.equal(d, 1);

            a.val = 5;
            c.val = 6;

            assert.equal(d, 3);
        });
    })
})