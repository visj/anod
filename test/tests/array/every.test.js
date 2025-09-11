import { test } from "../../helper/index.js";
import { array, value } from "../../../build/index.js";
import { shallowEq } from "../../helper/array.js";

test("every", function (t) {
    t.test("behaves like native", function (t) {
        t.test("basic every", function (t) {
            var s1 = array([1, 2, 3, 4, 5]);
            var s2 = s1.every(function (item) {
                return item > 0;
            });
            t.assert(s2.val() === true);
        });

        t.test("with index", function (t) {
            var s1 = array(['a', 'b', 'c']);
            var s2 = s1.every(function (item, index) {
                return index < 3;
            });
            t.assert(s2.val() === true);
        });

        t.test("empty array", function (t) {
            var s1 = array([]);
            var s2 = s1.every(function (item) {
                return item > 3;
            });
            t.assert(s2.val() === true);
        });

        t.test("no match", function (t) {
            var s1 = array([1, 2, 3]);
            var s2 = s1.every(function (item) {
                return item > 3;
            });
            t.assert(s2.val() === false);
        });
    });

    t.test("additional mutation edge cases", function (t) {
        t.test("insert at head", function (t) {
            var s1 = array([2, 3, 4]);
            var s2 = s1.every(function (item) { return item > 1; });
            t.assert(s2.val() === true);
            s1.unshift(1);
            t.assert(shallowEq(s1.val(), [1, 2, 3, 4]));
            t.assert(s2.val() === false);
            s1.unshift(0);
            t.assert(shallowEq(s1.val(), [0, 1, 2, 3, 4]));
            t.assert(s2.val() === false);
        });
        t.test("insert at tail", function (t) {
            var s1 = array([1, 2, 3]);
            var s2 = s1.every(function (item) { return item < 4; });
            t.assert(s2.val() === true);
            s1.push(4);
            t.assert(shallowEq(s1.val(), [1, 2, 3, 4]));
            t.assert(s2.val() === false);
        });
        t.test("multiple insertions/removals", function (t) {
            var s1 = array([1, 2, 3]);
            var s2 = s1.every(function (item) { return item < 10; });
            t.assert(s2.val() === true);
            s1.splice(1, 2, 8, 9, 10);
            t.assert(shallowEq(s1.val(), [1, 8, 9, 10]));
            t.assert(s2.val() === false);
            s1.splice(0, 3, 20, 30);
            t.assert(shallowEq(s1.val(), [20, 30, 10]));
            t.assert(s2.val() === false);
        });
        t.test("sort mutation", function (t) {
            var s1 = array([3, 2, 1]);
            var s2 = s1.every(function (item, idx) { return item <= 3; });
            t.assert(s2.val() === true);
            s1.sort(function (a, b) { return a - b; });
            t.assert(shallowEq(s1.val(), [1, 2, 3]));
            t.assert(s2.val() === true);
        });
        t.test("callback mutates array", function (t) {
            var s1 = array([1, 2, 3]);
            var count = 0;
            var s2 = s1.every(function (item, idx) {
                count++;
                if (idx === 0) s1.push(4);
                return item < 5;
            });
            t.assert(s2.val() === true);
            t.assert(count === 3, "should not iterate over newly pushed element");
        });
        t.test("callback always false after mutation", function (t) {
            var s1 = array([1, 2, 3]);
            var s2 = s1.every(function (item) { return false; });
            t.assert(s2.val() === false);
            s1.push(4);
            t.assert(s2.val() === false);
            s1.set([10, 11]);
            t.assert(s2.val() === false);
        });
        t.test("callback always true after mutation", function (t) {
            var s1 = array([1, 2, 3]);
            var s2 = s1.every(function (item) { return true; });
            t.assert(s2.val() === true);
            s1.push(4);
            t.assert(s2.val() === true);
            s1.set([]);
            t.assert(s2.val() === true);
        });
    });

    t.test("when modified", function (t) {
        t.test("works on mutations", function (t) {
            var s1 = array([1, 2, 3, 4, 5]);
            var s2 = s1.every(function (item) {
                return item > 0;
            });
            t.assert(s2.val() === true);

            s1.pop();
            t.assert(shallowEq(s1.val(), [1, 2, 3, 4]));
            t.assert(s2.val() === true);

            s1.push(0);
            t.assert(shallowEq(s1.val(), [1, 2, 3, 4, 0]));
            t.assert(s2.val() === false);

            s1.pop();
            t.assert(shallowEq(s1.val(), [1, 2, 3, 4]));
            t.assert(s2.val() === true);

            s1.splice(1, 1, 0);
            t.assert(shallowEq(s1.val(), [1, 0, 3, 4]));
            t.assert(s2.val() === false);

            s1.reverse();
            t.assert(shallowEq(s1.val(), [4, 3, 0, 1]));
            t.assert(s2.val() === false);
        });
    });

    t.test("edge cases", function (t) {
        t.test("null/undefined values", function (t) {
            var s1 = array([null, undefined, 1, 2]);
            var s2 = s1.every(function (item) {
                return item === null || item === undefined;
            });
            t.assert(s2.val() === false);

            var s3 = array([null, null, null]);
            var s4 = s3.every(function (item) {
                return item === null;
            });
            t.assert(s4.val() === true);
        });

        t.test("sparse arrays", function (t) {
            var s1 = array([1, , 3, , 5]);
            var s2 = s1.every(function (item) {
                return item === undefined;
            });
            t.assert(s2.val() === false);
        });

        t.test("large arrays", function (t) {
            var size = 10000;
            var s1 = array(new Array(size).fill(0).map(function (_, i) { return i; }));
            var s2 = s1.every(function (item) {
                return item >= 0;
            });
            t.assert(s2.val() === true);
        });
    });

    t.test("state creep and mutation edge cases", function (t) {
        t.test("multiple mutations causing state creep", function (t) {
            var s1 = array([1, 2, 3, 4, 5]);
            var s2 = s1.every(function (item) { return item > 0; });
            t.assert(s2.val() === true);

            // First mutation: insert at beginning
            s1.unshift(0);
            t.assert(s2.val() === false);

            // Second mutation: remove the problematic element
            s1.shift();
            t.assert(s2.val() === true);

            // Third mutation: insert at end
            s1.push(6);
            t.assert(s2.val() === true);

            // Fourth mutation: insert problematic element in middle
            s1.splice(2, 0, 0);
            t.assert(s2.val() === false);

            // Fifth mutation: remove problematic element
            s1.splice(2, 1);
            t.assert(s2.val() === true);
        });

        t.test("complex reorder scenarios", function (t) {
            var s1 = array([1, 2, 3, 4, 5]);
            var s2 = s1.every(function (item) { return item > 0; });
            t.assert(s2.val() === true);

            // Reverse should maintain true
            s1.reverse();
            t.assert(s2.val() === true);

            // Sort should maintain true
            s1.sort(function(a, b) { return b - a; });
            t.assert(s2.val() === true);

            // Insert problematic element and reorder
            s1.push(0);
            t.assert(s2.val() === false);
            s1.sort(function(a, b) { return a - b; });
            t.assert(s2.val() === false);
        });

        t.test("rapid successive mutations", function (t) {
            var s1 = array([1, 2, 3]);
            var s2 = s1.every(function (item) { return item > 0; });
            t.assert(s2.val() === true);

            // Rapid mutations
            s1.push(4);
            s1.push(5);
            s1.push(0);
            t.assert(s2.val() === false);

            s1.pop();
            t.assert(s2.val() === true);

            s1.unshift(0);
            s1.unshift(1);
            t.assert(s2.val() === false);
        });

        t.test("mutation at exact failure point", function (t) {
            var s1 = array([1, 2, 3, 4, 5]);
            var s2 = s1.every(function (item) { return item < 4; });
            t.assert(s2.val() === false);

            // Remove the element that caused failure
            s1.splice(3, 1);
            t.assert(s2.val() === true);

            // Add it back
            s1.splice(3, 0, 4);
            t.assert(s2.val() === false);
        });

        t.test("empty array edge cases", function (t) {
            var s1 = array([]);
            var s2 = s1.every(function (item) { return item > 0; });
            t.assert(s2.val() === true);

            // Add elements
            s1.push(1, 2, 3);
            t.assert(s2.val() === true);

            // Add problematic element
            s1.push(0);
            t.assert(s2.val() === false);

            // Clear array
            s1.set([]);
            t.assert(s2.val() === true);
        });

        t.test("callback that changes during iteration", function (t) {
            var s1 = array([1, 2, 3, 4, 5]);
            var threshold = 3;
            var s2 = s1.every(function (item) { return item < threshold; });
            t.assert(s2.val() === false);

            // Change threshold
            threshold = 6;
            t.assert(s2.val() === true);

            // Change back
            threshold = 3;
            t.assert(s2.val() === false);
        });

        t.test("multiple every calls on same array", function (t) {
            var s1 = array([1, 2, 3, 4, 5]);
            var s2 = s1.every(function (item) { return item > 0; });
            var s3 = s1.every(function (item) { return item < 10; });
            var s4 = s1.every(function (item) { return item % 2 === 0; });

            t.assert(s2.val() === true);
            t.assert(s3.val() === true);
            t.assert(s4.val() === false);

            // Mutate array
            s1.push(6);
            t.assert(s2.val() === true);
            t.assert(s3.val() === true);
            t.assert(s4.val() === false);

            s1.push(0);
            t.assert(s2.val() === false);
            t.assert(s3.val() === true);
            t.assert(s4.val() === false);
        });

        t.test("splice with complex indices", function (t) {
            var s1 = array([1, 2, 3, 4, 5]);
            var s2 = s1.every(function (item) { return item > 0; });
            t.assert(s2.val() === true);

            // Splice at beginning
            s1.splice(0, 1, 0);
            t.assert(s2.val() === false);

            // Splice at end
            s1.splice(4, 0, 6);
            t.assert(s2.val() === false);

            // Splice in middle
            s1.splice(2, 1, 7);
            t.assert(s2.val() === false);

            // Reset to all positive
            s1.set([1, 2, 3, 4, 5]);
            t.assert(s2.val() === true);
        });

        t.test("modify callback edge cases", function (t) {
            var s1 = array([1, 2, 3, 4, 5]);
            var s2 = s1.every(function (item) { return item > 0; });
            t.assert(s2.val() === true);

            // Use modify to change array
            s1.modify(function(arr) {
                arr[2] = 0;
                return arr;
            });
            t.assert(s2.val() === false);

            // Modify back
            s1.modify(function(arr) {
                arr[2] = 3;
                return arr;
            });
            t.assert(s2.val() === true);
        });

        t.test("set operation edge cases", function (t) {
            var s1 = array([1, 2, 3, 4, 5]);
            var s2 = s1.every(function (item) { return item > 0; });
            t.assert(s2.val() === true);

            // Set to empty array
            s1.set([]);
            t.assert(s2.val() === true);

            // Set to array with problematic element
            s1.set([1, 2, 0, 4, 5]);
            t.assert(s2.val() === false);

            // Set to all positive
            s1.set([1, 2, 3, 4, 5]);
            t.assert(s2.val() === true);
        });

        t.test("callback that throws", function (t) {
            var s1 = array([1, 2, 3]);
            var s2 = s1.every(function (item) {
                if (item === 2) throw new Error("Test error");
                return item > 0;
            });
            
            t.throws(function() {
                s2.val();
            });
        });

        t.test("callback that modifies array during iteration", function (t) {
            var s1 = array([1, 2, 3]);
            var s2 = s1.every(function (item, index) {
                if (index === 1) {
                    s1.push(4);
                }
                return item < 5;
            });
            t.assert(s2.val() === true);
        });
    });
}); 