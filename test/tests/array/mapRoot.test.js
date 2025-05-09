import { test } from "../../helper/index.js";
import { array, cleanup } from "../../../build/index.js";
import { shallowEq } from "../../helper/array.js";

test("map", function (t) {
  test("create", function (t) {
    var s1 = array([1, 2, 3]);
    var count = 0;
    var c1 = s1.mapRoot(function (val) {
      count++;
      return val.toString();
    });
    t.assert(shallowEq(c1.val(), ["1", "2", "3"]));
    t.equal(count, 3);
  });

  test("update from empty", function (t) {
    var s1 = array([]);
    var c1 = s1.mapRoot(function (val) { return val.toString(); });
    t.assert(shallowEq(c1.val(), []));
    s1.set([1, 2, 3]);
    t.assert(shallowEq(c1.val(), ["1", "2", "3"]));
  });

  test("clear", function (t) {
    var s1 = array([1, 2, 3]);
    var disposes = 0;
    var c1 = s1.mapRoot(function (val) {
      cleanup(function() { disposes++; });
      return val.toString();
    });
    t.assert(shallowEq(c1.val(), ["1", "2", "3"]));
    s1.set([]);
    t.assert(shallowEq(c1.val(), []));
    t.equal(disposes, 3);
  });

  test("reorder preserves reuse", function (t) {
    var s1 = array([1, 2, 3, 4]);
    var count = 0;
    var c1 = s1.mapRoot(function (val) { count++; return val * 2; });
    t.assert(shallowEq(c1.val(), [2, 4, 6, 8]));
    count = 0;
    s1.set([3, 1, 4, 2]);
    t.assert(shallowEq(c1.val(), [6, 2, 8, 4]));
    t.equal(count, 0);
  });

  test("add items only creates new roots", function (t) {
    var s1 = array([1, 2]);
    var count = 0;
    var c1 = s1.mapRoot(function (val) { count++; return val; });
    c1.val();
    t.equal(count, 2);
    count = 0;
    s1.set([1, 2, 3]);
    t.assert(shallowEq(c1.val(), [1, 2, 3]));
    t.equal(count, 1);
  });

  test("remove items triggers cleanup", function (t) {
    var s1 = array([1, 2, 3]);
    var disposes = 0;
    var c1 = s1.mapRoot(function (val) {
      cleanup(function () { disposes++; });
      return val;
    });
    t.assert(shallowEq(c1.val(), [1, 2, 3]));
    s1.set([1]);
    t.assert(shallowEq(c1.val(), [1]));
    t.equal(disposes, 2);
  });

  test("duplicates are matched correctly", function (t) {
    var s1 = array([1, 2, 1, 2]);
    var count = 0;
    var disposes = 0;
    var c1 = s1.mapRoot(function (val) { 
      cleanup(function() { disposes++; });
      count++; return val; 
    });
    t.assert(shallowEq(c1.val(), [1, 2, 1, 2]));
    t.equal(count, 4);
    count = 0;
    s1.set([2, 1, 2, 1]);
    t.assert(shallowEq(c1.val(), [2, 1, 2, 1]));
    t.equal(count, 0);
    t.equal(disposes, 0);
  });

  test("large array >32 uses fallback path", function (t) {
    var arr = [];
    for (var i = 0; i < 35; i++) {
      arr.push(i);
    }
    var s1 = array(arr);
    var count = 0;
    var disposes = 0;
    var c1 = s1.mapRoot(function (val) { 
      cleanup(function() { disposes++; });
      count++; return val * 10;
    });
    c1.val();
    t.equal(count, 35);
    count = 0;
    // reverse to force reuse detection in large case
    s1.set(arr.slice().reverse());
    // check values
    var expected = arr.slice().reverse().map(function (x) { return x * 10 });
    t.assert(shallowEq(c1.val(), expected));
    t.equal(count, 0);
    t.equal(disposes, 0);
  });

  test("partial reuse with overshoot", function (t) {
    var s1 = array([1, 2]);
    var count = 0;
    var c1 = s1.mapRoot(function (val) { count++; return val * 10; });
    t.assert(shallowEq(c1.val(), [10, 20]));
    count = 0;
    s1.set([1, 2, 3, 4]);
    t.assert(shallowEq(c1.val(), [10, 20, 30, 40]));
    t.equal(count, 2, "Only new items should trigger map");
  });

  test("partial reuse with undershoot", function (t) {
    var s1 = array([1, 2, 3, 4]);
    var count = 0;
    var disposes = [];
    var c1 = s1.mapRoot(function (val) { 
      cleanup(function() { disposes.push(val); });
      count++; return val * 10;
    });
    t.assert(shallowEq(c1.val(), [10, 20, 30, 40]));
    count = 0;
    s1.set([1, 2]);
    t.assert(shallowEq(c1.val(), [10, 20]));
    t.equal(count, 0, "No new items, just removal");
    t.assert(shallowEq(disposes, [3, 4]));
  });

  test("middle splice (insert)", function (t) {
    var s1 = array([1, 2, 5, 6]);
    var count = 0;
    var c1 = s1.mapRoot(function (val) { count++; return val * 10; });
    t.assert(shallowEq(c1.val(), [10, 20, 50, 60]));
    count = 0;
    s1.set([1, 2, 3, 4, 5, 6]);
    t.assert(shallowEq(c1.val(), [10, 20, 30, 40, 50, 60]));
    t.equal(count, 2, "Inserted 3,4 triggers map twice");
  });

  test("middle splice (remove)", function (t) {
    var s1 = array([1, 2, 3, 4, 5, 6]);
    var count = 0;
    var c1 = s1.mapRoot(function (val) { count++; return val * 10; });
    t.assert(shallowEq(c1.val(), [10, 20, 30, 40, 50, 60]));
    count = 0;
    s1.set([1, 2, 5, 6]);
    t.assert(shallowEq(c1.val(), [10, 20, 50, 60]));
    t.equal(count, 0, "No new items, just removal");
  });

  test("reuse with identity change (objects)", function (t) {
    var obj1 = { x: 1 }, obj2 = { x: 2 }, obj3 = { x: 3 };
    var s1 = array([obj1, obj2]);
    var seen = [];
    var c1 = s1.mapRoot(function (val) { seen.push(val); return val.x; });
    t.assert(shallowEq(c1.val(), [1, 2]));
    seen = [];
    // New objects with same values
    s1.set([{ x: 1 }, { x: 2 }, obj3]);
    t.assert(shallowEq(c1.val(), [1, 2, 3]));
    t.equal(seen.length, 3, "All new objects should trigger map");
  });

  test("all items replaced", function (t) {
    var s1 = array([1, 2, 3]);
    var count = 0;
    var disposes = 0;
    var c1 = s1.mapRoot(function (val) {
      cleanup(function() { disposes++; });
      count++; return val;
    });
    t.assert(shallowEq(c1.val(), [1, 2, 3]));
    count = 0;
    s1.set([4, 5, 6]);
    t.assert(shallowEq(c1.val(), [4, 5, 6]));
    t.equal(count, 3, "All new items should trigger map");
    t.equal(disposes, 3);
  });

  test("alternating reuse and new", function (t) {
    var s1 = array([1, 2, 3, 4]);
    var count = 0;
    var c1 = s1.mapRoot(function (val) { count++; return val; });
    t.assert(shallowEq(c1.val(), [1, 2, 3, 4]));
    count = 0;
    s1.set([1, 5, 3, 6]);
    t.assert(shallowEq(c1.val(), [1, 5, 3, 6]));
    t.equal(count, 2, "Only new items (5,6) should trigger map");
  });

  test("splice with both removal and addition", function (t) {
    var s1 = array([1, 2, 3, 4, 5]);
    var count = 0;
    var c1 = s1.mapRoot(function (val) { count++; return val; });
    t.assert(shallowEq(c1.val(), [1, 2, 3, 4, 5]));
    count = 0;
    s1.set([1, 9, 10, 4, 5]);
    t.assert(shallowEq(c1.val(), [1, 9, 10, 4, 5]));
    t.equal(count, 2, "Inserted 9,10 triggers map twice");
  });

  test("no common prefix/suffix small", function (t) {
    var s1 = array([1,2,3,4]);
    var count = 0;
    var c1 = s1.mapRoot(function (val) { count++; return val; });
    t.assert(shallowEq(c1.val(), [1,2,3,4]));
    count = 0;
    s1.set([4,3,2,1]);
    t.assert(shallowEq(c1.val(), [4,3,2,1]));
    t.equal(count, 0, "all reused");
  });

  test("prefix only small", function (t) {
    var s1 = array([1,2,3,4]);
    var count = 0;
    var c1 = s1.mapRoot(function (val) { count++; return val; });
    t.assert(shallowEq(c1.val(), [1,2,3,4]));
    count = 0;
    s1.set([1,4,3,2]);
    t.assert(shallowEq(c1.val(), [1,4,3,2]));
    t.equal(count, 0, "prefix 1 reused, rest reordered");
  });

  test("suffix only small", function (t) {
    var s1 = array([1,2,3,4]);
    var count = 0;
    var c1 = s1.mapRoot(function (val) { count++; return val; });
    t.assert(shallowEq(c1.val(), [1,2,3,4]));
    count = 0;
    s1.set([9,2,3,4]);
    t.assert(shallowEq(c1.val(), [9,2,3,4]));
    t.equal(count, 1, "only new first element");
  });

  test("mixed in-place same length small", function (t) {
    var s1 = array([1,2,3,4]);
    var count = 0;
    var c1 = s1.mapRoot(function (val) { count++; return val; });
    t.assert(shallowEq(c1.val(), [1,2,3,4]));
    count = 0;
    s1.set([3,5,2,1]);
    t.assert(shallowEq(c1.val(), [3,5,2,1]));
    t.equal(count, 1, "only new value 5 triggers map");
  });

  test("mostly additions small", function (t) {
    var s1 = array([1,2]);
    var count = 0;
    var c1 = s1.mapRoot(function (val) { count++; return val; });
    t.assert(shallowEq(c1.val(), [1,2]));
    count = 0;
    s1.set([3,4,1,2]);
    t.assert(shallowEq(c1.val(), [3,4,1,2]));
    t.equal(count, 2, "elements 3,4 are new");
  });

  // Large-array (>32) variants

  test("no common prefix/suffix large", function (t) {
    var arr = [];
    for (var i = 0; i < 35; i++) { arr.push(i); }
    var s1 = array(arr);
    var count = 0;
    var c1 = s1.mapRoot(function (val) { count++; return val; });
    t.assert(shallowEq(c1.val(), arr));
    count = 0;
    var newArr = arr.slice(20).concat(arr.slice(0,20));
    s1.set(newArr);
    t.assert(shallowEq(c1.val(), newArr));
    t.equal(count, 0, "all reused under large case");
  });

  test("prefix only large", function (t) {
    var arr = [];
    for (var i = 0; i < 35; i++) { arr.push(i); }
    var s1 = array(arr);
    var count = 0;
    var c1 = s1.mapRoot(function (val) { count++; return val; });
    t.assert(shallowEq(c1.val(), arr));
    count = 0;
    var newArr = arr.slice(0,10).concat(arr.slice(20,35)).concat(arr.slice(10,20));
    s1.set(newArr);
    t.assert(shallowEq(c1.val(), newArr));
    t.equal(count, 0, "prefix preserved only");
  });

  test("suffix only large", function (t) {
    var arr = [];
    for (var i = 0; i < 35; i++) { arr.push(i); }
    var s1 = array(arr);
    var count = 0;
    var c1 = s1.mapRoot(function (val) { count++; return val; });
    t.assert(shallowEq(c1.val(), arr));
    count = 0;
    var newArr = [99].concat(arr.slice(1,35));
    s1.set(newArr);
    t.assert(shallowEq(c1.val(), newArr));
    t.equal(count, 1, "only new head element");
  });

  test("mixed in-place same length large", function (t) {
    var arr = [];
    for (var i = 0; i < 35; i++) { arr.push(i); }
    var s1 = array(arr);
    var count = 0;
    var c1 = s1.mapRoot(function (val) { count++; return val; });
    t.assert(shallowEq(c1.val(), arr));
    count = 0;
    var newArr = arr.slice();
    newArr[5] = 100;
    newArr[10] = 101;
    s1.set(newArr);
    t.assert(shallowEq(c1.val(), newArr));
    t.equal(count, 2, "two new values in place");
  });

  test("mostly additions large", function (t) {
    var arr = [];
    for (var i = 0; i < 35; i++) { arr.push(i); }
    var s1 = array(arr);
    var count = 0;
    var c1 = s1.mapRoot(function (val) { count++; return val; });
    t.assert(shallowEq(c1.val(), arr));
    count = 0;
    var newArr = arr.concat([100,101,102]);
    s1.set(newArr);
    t.assert(shallowEq(c1.val(), newArr));
    t.equal(count, 3, "three new tail elements");
  });
});