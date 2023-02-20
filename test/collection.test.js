import assert from 'assert';
import { root, array, dispose, cleanup, effect, compute, value } from './helper/zorn.js';


describe("collection", function () {

    it("should re-evaluate when an array element is changed", function () {
        var d1 = array([1, 2, 3]);
        var s1 = d1.slice(1);
        var s2 = s1.slice(1);
        var count = 0;
        effect(function () {
            count++;
            assert.deepEqual(s1.val, d1.peek.slice(1));
            assert.deepEqual(s2.val, s1.peek.slice(1));
        });
        d1.val = [4, 5, 6];
        d1.val = [7, 8, 9];
        assert.equal(count, 3);
    });

    describe("length", function() {
        it("returns a readonly signal when accessed", function() {
            var d1 = array([1, 2, 3]);
            var c1 = d1.length;
            assert.equal(c1.val, 3);
            d1.val = [4];
            assert.equal(c1.val, 1);
        });

        it("can be set to a new value", function() {
            var d1 = array([1, 2, 3]);
            d1.length = 2;
            assert.deepEqual(d1.val, [1, 2]);
        });


        it("works like a computation", function() {
            var d1 = array([1, 2, 3]);
            var c1 = d1.length;
            var c2 = compute(function() {
                return c1.val;
            });
            assert.equal(c2.val, 3);
            d1.val = [4];
            assert.equal(c2.val, 1);
        });

        it("does not evaluate unless changed", function() {
            var d1 = array([1, 2, 3]);
            var c1 = d1.length;
            var count = 0;
            var c2 = compute(function() {
                return c1.val;
            });
            effect(function() {
                count++;
                c2.val;
            })
            assert.equal(count, 1);
            d1.val = [4,5,6];
            assert.equal(count, 1);
            d1.val = [4,5,6,7];
            assert.equal(count, 2);
        });

        it("does not cause array signal to be read", function() {
            var d1 = array([1, 2, 3]);
            var c1;
            var count = 0;
            effect(function() {
                count++;
                c1 = d1.length;
            });
            effect(function() {
                count++;
                c1.val;
            })
            assert.equal(count, 2);
            d1.val = [4,5,6];
            assert.equal(count, 2);
            d1.val = [4,5,6,7];
            assert.equal(count, 3);
        });
    });
});