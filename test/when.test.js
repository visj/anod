import { test, root, effect, effectWhen, compute, $compute, value } from './helper/zorn.js';

describe("when", function () {

    it("should record provided dependencies", function() {
        var d1 = value(1);
        var count = 0;
        effectWhen(d1, function() {
            count++;
        });
        test.ok(count === 1);
        d1.set(d1.peek + 1);
        test.ok(count === 2);
    });
    
    it("should not record values when reading", function() {
        var d1 = value(1);
        var d2 = value(1);
        var count = 0;
        effectWhen(d1, function() {
            count++;
            d2.val;
        });
        test.ok(count === 1);
        d2.set(d2.peek + 1);
        test.ok(count === 1);
    });

    it("accepts an array of dependencies", function() {
        var d1 = value(1);
        var d2 = value(1);
        var count = 0;
        effectWhen([d1, d2], function() {
            count++;
        });
        test.ok(count === 1);
        d1.set(d1.peek + 1);
        test.ok(count === 2);
        d2.set(d2.peek + 1);
        test.ok(count === 3);
    });
});
