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

    describe("some", function() {
        it("behaves like Array#some", function() {
            var d1 = array([1, 2, 3]);
            var c1 = d1.some(function(x) { return x > 2; });
            test.ok(c1.val === true);
            d1.set([1, 2, 1]);
            test.ok(c1.val === false);
        });

        it("uses mutation information to avoid re-evaluating", function() {
            var d1 = array([1, 2, 3]);
            var count = 0;
            d1.some(function(x) { 
                count++;
                return x > 2;
            });
            test.ok(count === 3);
            d1.push(4);
            test.ok(count === 3);
        });

        it("re-evaluates if necessary", function() {
            var d1 = array([1, 2, 3, 4, 5]);
            var count = 0;
            d1.some(function(x) { 
                count++;
                return x > 3;
            });
            test.ok(count === 4);
            d1.push(6);
            // Array is now [1, 2, 3, 4, 5, 6]
            //                index --^
            test.ok(count === 4);
            d1.splice(2, 1, 5);
            // Array is now [1, 2, 5, 4, 5, 6]
            //             index --^
            test.ok(count === 5);
            d1.unshift(3);
            // Array is now [3, 1, 2, 5, 4, 5, 6]
            //       start --^        ^-- index
            test.ok(count === 9);
        });

        it("does not re-evaluate removals when previously not found", function() {
            var d1 = array([1, 2, 3]);
            var count = 0;
            d1.some(function(x) { 
                count++;
                return x > 3;
            });
            test.ok(count === 3);
            d1.splice(1, 1);
            test.ok(count === 3);
        });

        it("works when emptying array", function() {
            var d1 = array([1, 2, 3]);
            var count = 0;
            d1.some(function(x) { 
                count++;
                return x > 3;
            });
            test.ok(count === 3);
            d1.splice(0, 3);
            test.ok(count === 3);
        });

        it ("works when emptying array and previously was true", function() {
            var d1 = array([1, 2, 3]);
            var count = 0;
            var c1 = d1.some(function(x) { 
                count++;
                return x > 2;
            });
            test.ok(count === 3);
            test.ok(c1.val);
            d1.splice(0, 3);
            test.ok(count === 3);
            test.ok(!c1.val);
        });
    });
});