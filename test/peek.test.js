import assert from 'assert';
import { root, val, effect, data, peek } from './helper/zorn.js';

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
                peek(val(function () { b.val; }));
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