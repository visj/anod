import assert from 'assert';
import { root, effect, effectWhen, compute, $compute, value } from './helper/zorn.js';

describe("when", function () {

    it("should record provided dependencies", function() {
        var d1 = value(1);
        var count = 0;
        effectWhen(d1, function() {
            count++;
        });
        assert.equal(count, 1);
        d1.val++;
        assert.equal(count, 2);
    });
    
    it("should not record values when reading", function() {
        var d1 = value(1);
        var d2 = value(1);
        var count = 0;
        effectWhen(d1, function() {
            count++;
            d2.val;
        });
        assert.equal(count, 1);
        d2.val++;
        assert.equal(count, 1);
    });

    it("accepts an array of dependencies", function() {
        var d1 = value(1);
        var d2 = value(1);
        var count = 0;
        effectWhen([d1, d2], function() {
            count++;
        });
        assert.equal(count, 1);
        d1.val++;
        assert.equal(count, 2);
        d2.val++;
        assert.equal(count, 3);
    });

    it("provides source val as fourth argument", function() {
        var d1 = value(1);
        effectWhen(d1, function(a, b, c, sourceVal) {
            assert.equal(d1.val, sourceVal);
        });
        d1.val++;
    });

    it("provides source val as fourth argument when using an array of dependencies", function() {
        var d1 = value(1);
        var d2 = value(1);
        effectWhen([d1, d2], function(a, b, c, sourceVal) {
            assert.equal(d1.val, sourceVal[0]);
            assert.equal(d2.val, sourceVal[1]);
        });
        d1.val++;
    });

    it("does not evaluate source val when not used", function() {
        var d1 = value(1);
        effectWhen(d1, function() {
            assert.equal(arguments[3], void 0);
        });
        d1.val++;
    });
});