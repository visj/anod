// import { test, root, data, array, dispose, cleanup, effect, compute, value } from './helper/zorn.js';


// describe("collection", function () {

//     describe("length", function () {
//         it("returns a readonly signal when accessed", function () {
//             var d1 = array([1, 2, 3]);
//             var c1 = d1.length;
//             test.equals(c1.val , 3);
//             d1.set([4]);
//             test.equals(c1.val , 1);
//         });

//         it("works like a computation", function () {
//             var d1 = array([1, 2, 3]);
//             var c1 = d1.length;
//             var c2 = compute(function () {
//                 return c1.val;
//             });
//             test.equals(c2.val , 3);
//             d1.set([4]);
//             test.equals(c2.val , 1);
//         });

//         it("does not evaluate unless changed", function () {
//             var d1 = array([1, 2, 3]);
//             var c1 = d1.length;
//             var count = 0;
//             var c2 = compute(function () {
//                 return c1.val;
//             });
//             effect(function () {
//                 count++;
//                 c2.val;
//             });
//             test.equals(count , 1);
//             d1.set([4, 5, 6]);
//             test.equals(count , 1);
//             d1.set([4, 5, 6, 7]);
//             test.equals(count , 2);
//         });

//         it("does not cause array signal to be read", function () {
//             var d1 = array([1, 2, 3]);
//             var c1;
//             var count = 0;
//             effect(function () {
//                 count++;
//                 c1 = d1.length;
//             });
//             effect(function () {
//                 count++;
//                 c1.val;
//             });
//             test.equals(count , 2);
//             d1.set([4, 5, 6]);
//             test.equals(count , 2);
//             d1.set([4, 5, 6, 7]);
//             test.equals(count , 3);
//         });
//     });

//     describe("join", function() {
//         it("behaves like Array#join", function () {
//             var d1 = array([1, 2, 3]);
//             var c1 = d1.join();
//             test.equals(c1.val, d1.peek.join());
//             d1.set([4, 5, 6]);
//             test.equals(c1.val, d1.peek.join());
//         });

//         it("works with a separator", function () {
//             var d1 = array([1, 2, 3]);
//             var c1 = d1.join(",");
//             test.equals(c1.val, d1.peek.join(","));
//             d1.set([4, 5, 6]);
//             test.equals(c1.val, d1.peek.join(","));
//         });

//         it("accepts a signal as a separator", function () {
//             var d1 = array([1, 2, 3]);
//             var d2 = value(",");
//             var c1 = d1.join(d2);
//             test.equals(c1.val, d1.peek.join(","));
//             d1.set([4, 5, 6]);
//             test.equals(c1.val, d1.peek.join(","));
//             d2.set("-");
//             test.equals(c1.val, d1.peek.join("-"));
//         });

//         it("does not evaluate unless changed", function () {
//             var d1 = array([1, 2, 3]);
//             var d2 = value(",");
//             var count = 0;
//             var c1 = d1.join(d2);
//             effect(function () {
//                 count++;
//                 c1.val;
//             });
//             test.equals(count , 1);
//             d1.set([1, 2, 3]);
//             test.equals(count , 1);
//             d2.set("-");
//             test.equals(count , 2);
//         });
//     });

//     describe("slice", function () {
//         it("behaves like Array#slice", function () {
//             var d1 = array([1, 2, 3]);
//             var c1 = d1.slice(1);
//             test.equals(c1.val, d1.peek.slice(1));
//             d1.set([4, 5, 6]);
//             test.equals(c1.val, d1.peek.slice(1));
//         });

//         it("works without arguments", function () {
//             var d1 = array([1, 2, 3]);
//             var c1 = d1.slice();
//             test.equals(c1.val, d1.peek.slice());
//             d1.set([4, 5, 6]);
//             test.equals(c1.val, d1.peek.slice());
//         });

//         it("works for subsequent mutations when copying", function () {
//             var d1 = array([1, 2, 3]);
//             var c1 = d1.slice();
//             d1.splice(2, 0, 4, 5, 6);
//             test.equals(c1.val, d1.peek.slice());
//             d1.unshift(7, 8, 9);
//             test.equals(c1.val, d1.peek.slice());
//             d1.splice(4, 3, 10, 11, 12);
//             test.equals(c1.val, d1.peek.slice());
//             d1.push(13, 14, 15);
//             test.equals(c1.val, d1.peek.slice());
//         });

//         it("returns a copy of the array", function () {
//             var d1 = array([1, 2, 3]);
//             var c1 = d1.slice();
//             test.ok(c1.val !== d1.peek);
//         });

//         it("reuses the same array on changes", function () {
//             var d1 = array([1, 2, 3]);
//             var c1 = d1.slice();
//             var s1 = c1.val;
//             d1.set([4, 5, 6]);
//             test.equals(c1.val , s1);
//             d1.splice(1, 1, 7);
//             test.equals(c1.val , s1);
//         });

//         it("should re-evaluate when an array element is changed", function () {
//             var d1 = array([1, 2, 3]);
//             var s1 = d1.slice(1);
//             var s2 = s1.slice(1);
//             var count = 0;
//             effect(function () {
//                 count++;
//                 s2.val;
//             });
//             d1.set([4, 5, 6]);
//             test.equals(s1.val, d1.peek.slice(1));
//             test.equals(s2.val, s1.peek.slice(1));
//             d1.set([7, 8, 9]);
//             test.equals(s1.val, d1.peek.slice(1));
//             test.equals(s2.val, s1.peek.slice(1));
//             test.equals(count , 3);
//         });

//         it("accepts signals as arguments", function () {
//             var d1 = array([1, 2, 3]);
//             var d2 = data(1);
//             var c1 = d1.slice(d2);
//             test.equals(c1.val, d1.peek.slice(d2.peek));
//             d1.set([4, 5, 6]);
//             test.equals(c1.val, d1.peek.slice(d2.peek));
//             d2.set(2);
//             test.equals(c1.val, d1.peek.slice(d2.peek));
//         });

//         it("works when splicing beyond the range of the previous slice", function() {
//             var d1 = array([1, 2, 3]);
//             var s1 = d1.slice(1, 3);
//             var s2 = s1.slice(1, 3);
//             d1.splice(1, 1, 4, 5, 6);
//             /*
//              * d1 is here [1, 4, 5, 6, 3]
//              * s1 is here [4, 5]
//              * s2 is here [5]
//              */
//             test.equals(s1.val, d1.peek.slice(1, 3));
//             test.equals(s2.val, s1.peek.slice(1, 3));
//         });
//     });

//     describe("some", function () {
//         it("behaves like Array#some", function () {
//             var d1 = array([1, 2, 3]);
//             var c1 = d1.some(function (x) { return x > 2; });
//             test.equals(c1.val, true);
//             d1.set([1, 2, 1]);
//             test.equals(c1.val, false);
//         });

//         it("uses mutation information to avoid re-evaluating", function () {
//             var d1 = array([1, 2, 3]);
//             var count = 0;
//             d1.some(function (x) {
//                 count++;
//                 return x > 2;
//             });
//             test.equals(count, 3);
//             d1.push(4);
//             test.equals(count , 3);
//         });

//         it("re-evaluates if necessary", function () {
//             var d1 = array([1, 2, 3, 4, 5]);
//             var count = 0;
//             d1.some(function (x) {
//                 count++;
//                 return x > 3;
//             });
//             test.equals(count, 4);
//             d1.push(6);
//             // Array is now [1, 2, 3, 4, 5, 6]
//             //                index --^
//             test.equals(count, 4);
//             d1.splice(2, 1, 5);
//             // Array is now [1, 2, 5, 4, 5, 6]
//             //             index --^
//             test.equals(count, 5);
//             d1.unshift(3);
//             // Array is now [3, 1, 2, 5, 4, 5, 6]
//             //       start --^        ^-- index
//             test.equals(count, 9);
//         });

//         it("does not re-evaluate removals when previously not found", function () {
//             var d1 = array([1, 2, 3]);
//             var count = 0;
//             d1.some(function (x) {
//                 count++;
//                 return x > 3;
//             });
//             test.equals(count , 3);
//             d1.splice(1, 1);
//             test.equals(count , 3);
//         });

//         it("re-evaluates removals when previously found", function () {
//             var d1 = array([1, 2, 3]);
//             var count = 0;
//             d1.some(function (x) {
//                 count++;
//                 return x > 2;
//             });
//             test.equals(count, 3);
//             d1.splice(1, 1);
//             // Since the found value last round was after the removed index,
//             // starting from where we removed, since we didn't find anything before that.
//             test.equals(count , 4);
//         });

//         it("re-evaluates when both inserting and removing", function() {
//             var d1 = array([1, 2, 3]);
//             var count = 0;
//             d1.some(function (x) {
//                 count++;
//                 return x > 2;
//             });
//             test.equals(count, 3);
//             d1.splice(1, 1, 4);
//             test.equals(count, 4);
//         });

//         it("traverses to the end of the array when previous found value was removed", function () {
//             var d1 = array([1, 2, 3, 4, 5, 6]);
//             var count = 0;
//             var c1 = d1.some(function (x) {
//                 count++;
//                 return x > 2;
//             });
//             test.equals(count, 3);
//             d1.splice(2, 2, 1, 1, 1, 1);
//             /*
//              * Array is now [1, 2, 1, 1, 1, 1, 5, 6]
//                 *          index --^
//              */
//             test.equals(count, 8);
//             test.equals(c1.val, true);
//         });

//         it("works when emptying array", function () {
//             var d1 = array([1, 2, 3]);
//             var count = 0;
//             d1.some(function (x) {
//                 count++;
//                 return x > 3;
//             });
//             test.equals(count , 3);
//             d1.splice(0, 3);
//             test.equals(count , 3);
//         });

//         it("works when emptying array and previously was true", function () {
//             var d1 = array([1, 2, 3]);
//             var count = 0;
//             var c1 = d1.some(function (x) {
//                 count++;
//                 return x > 2;
//             });
//             test.equals(count , 3);
//             test.ok(c1.val);
//             d1.splice(0, 3);
//             test.equals(count , 3);
//             test.ok(!c1.val);
//         });
//     });
// });