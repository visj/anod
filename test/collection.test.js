import { test, root, array, dispose, cleanup, effect, compute, value } from './helper/zorn.js';


describe("collection", function () {

    it("should re-evaluate when an array element is changed", function () {
        var d1 = array([1, 2, 3]);
        var s1 = d1.slice(1);
        var s2 = s1.slice(1);
        var count = 0;
        effect(function () {
            count++;
            test.equals(s1.val, d1.peek.slice(1));
            test.equals(s2.val, s1.peek.slice(1));
        });
        d1.set([4, 5, 6]);
        d1.set([7, 8, 9]);
        test.ok(count === 3);
    });

    describe("length", function() {
        it("returns a readonly signal when accessed", function() {
            var d1 = array([1, 2, 3]);
            var c1 = d1.length;
            test.ok(c1.val === 3);
            d1.set([4]);
            test.ok(c1.val === 1);
        });

        it("works like a computation", function() {
            var d1 = array([1, 2, 3]);
            var c1 = d1.length;
            var c2 = compute(function() {
                return c1.val;
            });
            test.ok(c2.val === 3);
            d1.set([4]);
            test.ok(c2.val === 1);
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
            test.ok(count === 1);
            d1.set([4,5,6]);
            test.ok(count === 1);
            d1.set([4,5,6,7]);
            test.ok(count === 2);
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
            test.ok(count === 2);
            d1.set([4,5,6]);
            test.ok(count === 2);
            d1.set([4,5,6,7]);
            test.ok(count === 3);
        });
    });
});