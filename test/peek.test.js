import assert from 'assert';
import { root, val, compute, data} from './helper/zorn.js';

describe("peek(...)", function () {

    it("returns the value of a data", function () {
        root(function() {
            var d = data(1);
            assert.equal(val(function() {
                return d.val;
            }).peek, 1);
        });
    });

    it("avoids a dedendency", function () {
        root(function () {
            var a = data(1);
            var b = data(2);
            var c = data(3);
            var d = 0;
            
            compute(function () {
                d++; 
                a.val;
                b.peek;
                c.val;
            });

            assert.equal(d, 1);

            b.val = 4;

            assert.equal(d, 1);

            a.val = 5;
            c.val = 6;

            assert.equal(d, 3);
        });
    });

    it("can take computed values", function() {
        root(function () {
            var a = data(1);
            var b = data(2);
            var c = data(3);
            var d = 0;
            
            compute(function () {
                d++; 
                a.val;
                val(function() {
                    return b.val;
                }).peek;
                c.val;
            });

            assert.equal(d, 1);
            b.val = 4;

            assert.equal(d, 1);
            a.val = 5;

            assert.equal(d, 2);
        });
    });
})