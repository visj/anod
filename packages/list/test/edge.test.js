import { describe, test, expect } from "#test-runner";

import { list } from "#list";

/**
 * Edge case tests: verify that reactive list methods match native
 * Array behaviour for boundary inputs, omitted parameters, type
 * coercion, single-element arrays, empty arrays, etc.
 */

// ─── at ────────────────────────────────────────────────────────────────────

describe("at edge cases", () => {
    test("negative index wraps from end", () => {
        const l = list([10, 20, 30]);
        expect(l.at(-2).get()).toBe(20);
        expect(l.at(-3).get()).toBe(10);
    });

    test("negative index beyond length returns undefined", () => {
        const l = list([1, 2]);
        expect(l.at(-5).get()).toBeUndefined();
    });

    test("index 0 on empty array returns undefined", () => {
        const l = list([]);
        expect(l.at(0).get()).toBeUndefined();
    });

    test("reacts to mutation (push then at)", () => {
        const l = list([1]);
        const r = l.at(-1);
        expect(r.get()).toBe(1);
        l.push(99);
        expect(r.get()).toBe(99);
    });
});

// ─── concat ────────────────────────────────────────────────────────────────

describe("concat edge cases", () => {
    test("concat with no arguments returns shallow copy", () => {
        const l = list([1, 2]);
        const r = l.concat();
        expect(r.get()).toEqual([1, 2]);
    });

    test("concat with empty arrays", () => {
        const l = list([1]);
        const r = l.concat([], [], []);
        expect(r.get()).toEqual([1]);
    });

    test("concat with non-array values (native spreads them)", () => {
        const l = list([1]);
        const r = l.concat(2, 3);
        expect(r.get()).toEqual([1, 2, 3]);
    });

    test("concat on empty list", () => {
        const l = list([]);
        const r = l.concat([1, 2]);
        expect(r.get()).toEqual([1, 2]);
    });
});

// ─── every / some ──────────────────────────────────────────────────────────

describe("every edge cases", () => {
    test("single element true", () => {
        const l = list([1]);
        expect(l.every((x) => x === 1).get()).toBe(true);
    });

    test("single element false", () => {
        const l = list([1]);
        expect(l.every((x) => x === 2).get()).toBe(false);
    });

    test("callback receives (element, index)", () => {
        const l = list(["a", "b"]);
        const indices = [];
        const r = l.every((_, i) => { indices.push(i); return true; });
        r.get();
        expect(indices).toEqual([0, 1]);
    });

    test("reacts to push making it false", () => {
        const l = list([2, 4]);
        const r = l.every((x) => x % 2 === 0);
        expect(r.get()).toBe(true);
        l.push(3);
        expect(r.get()).toBe(false);
    });
});

describe("some edge cases", () => {
    test("single element true", () => {
        const l = list([5]);
        expect(l.some((x) => x === 5).get()).toBe(true);
    });

    test("single element false", () => {
        const l = list([5]);
        expect(l.some((x) => x === 6).get()).toBe(false);
    });

    test("callback receives (element, index)", () => {
        const l = list(["a", "b"]);
        const indices = [];
        const r = l.some((_, i) => { indices.push(i); return false; });
        r.get();
        expect(indices).toEqual([0, 1]);
    });

    test("reacts to push making it true", () => {
        const l = list([1, 2]);
        const r = l.some((x) => x > 5);
        expect(r.get()).toBe(false);
        l.push(10);
        expect(r.get()).toBe(true);
    });
});

// ─── filter ────────────────────────────────────────────────────────────────

describe("filter edge cases", () => {
    test("all elements match", () => {
        const l = list([1, 2, 3]);
        expect(l.filter(() => true).get()).toEqual([1, 2, 3]);
    });

    test("empty array", () => {
        const l = list([]);
        expect(l.filter(() => true).get()).toEqual([]);
    });

    test("reacts to splice removing matching elements", () => {
        const l = list([1, 2, 3, 4, 5]);
        const r = l.filter((x) => x > 2);
        expect(r.get()).toEqual([3, 4, 5]);
        l.splice(2, 3);
        expect(r.get()).toEqual([]);
    });

    test("preserves order", () => {
        const l = list([5, 1, 4, 2, 3]);
        const r = l.filter((x) => x > 2);
        expect(r.get()).toEqual([5, 4, 3]);
    });
});

// ─── find / findIndex ──────────────────────────────────────────────────────

describe("find edge cases", () => {
    test("finds first of duplicates", () => {
        const l = list([1, 2, 2, 3]);
        expect(l.find((x) => x === 2).get()).toBe(2);
    });

    test("empty array returns undefined", () => {
        const l = list([]);
        expect(l.find(() => true).get()).toBeUndefined();
    });

    test("callback receives index", () => {
        const l = list(["a", "b", "c"]);
        expect(l.find((_, i) => i === 2).get()).toBe("c");
    });

    test("reacts to unshift", () => {
        const l = list([3, 4]);
        const r = l.find((x) => x < 3);
        expect(r.get()).toBeUndefined();
        l.unshift(1);
        expect(r.get()).toBe(1);
    });
});

describe("findIndex edge cases", () => {
    test("empty array returns -1", () => {
        const l = list([]);
        expect(l.findIndex(() => true).get()).toBe(-1);
    });

    test("returns first matching index with duplicates", () => {
        const l = list([1, 5, 5, 3]);
        expect(l.findIndex((x) => x === 5).get()).toBe(1);
    });

    test("reacts to reverse", () => {
        const l = list([1, 2, 3]);
        const r = l.findIndex((x) => x === 3);
        expect(r.get()).toBe(2);
        l.reverse();
        expect(r.get()).toBe(0);
    });
});

// ─── findLast / findLastIndex ──────────────────────────────────────────────

describe("findLast edge cases", () => {
    test("empty array returns undefined", () => {
        const l = list([]);
        expect(l.findLast(() => true).get()).toBeUndefined();
    });

    test("single element match", () => {
        const l = list([42]);
        expect(l.findLast((x) => x === 42).get()).toBe(42);
    });

    test("single element no match", () => {
        const l = list([42]);
        expect(l.findLast((x) => x === 0).get()).toBeUndefined();
    });
});

describe("findLastIndex edge cases", () => {
    test("empty array returns -1", () => {
        const l = list([]);
        expect(l.findLastIndex(() => true).get()).toBe(-1);
    });

    test("all elements match returns last index", () => {
        const l = list([1, 1, 1]);
        expect(l.findLastIndex((x) => x === 1).get()).toBe(2);
    });
});

// ─── flat / flatMap ────────────────────────────────────────────────────────

describe("flat edge cases", () => {
    test("already flat array is unchanged", () => {
        const l = list([1, 2, 3]);
        expect(l.flat().get()).toEqual([1, 2, 3]);
    });

    test("empty nested arrays", () => {
        const l = list([[], [], []]);
        expect(l.flat().get()).toEqual([]);
    });

    test("mixed nested and flat", () => {
        const l = list([1, [2, 3], 4]);
        expect(l.flat().get()).toEqual([1, 2, 3, 4]);
    });

    test("depth 0 does not flatten", () => {
        const l = list([[1], [2]]);
        expect(l.flat(0).get()).toEqual([[1], [2]]);
    });

    test("empty array", () => {
        const l = list([]);
        expect(l.flat().get()).toEqual([]);
    });

    test("deeply nested with depth 1 only flattens one level", () => {
        const l = list([[[1, 2]], [[3]]]);
        expect(l.flat(1).get()).toEqual([[1, 2], [3]]);
    });
});

describe("flatMap edge cases", () => {
    test("callback returning empty array removes element", () => {
        const l = list([1, 2, 3]);
        const r = l.flatMap((x) => x === 2 ? [] : [x]);
        expect(r.get()).toEqual([1, 3]);
    });

    test("callback returning single element (not array)", () => {
        const l = list([1, 2]);
        const r = l.flatMap((x) => x * 10);
        expect(r.get()).toEqual([10, 20]);
    });

    test("empty list", () => {
        const l = list([]);
        const r = l.flatMap((x) => [x, x]);
        expect(r.get()).toEqual([]);
    });

    test("does not flatten deeper than one level", () => {
        const l = list([1]);
        const r = l.flatMap(() => [[1, 2]]);
        expect(r.get()).toEqual([[1, 2]]);
    });
});

// ─── includes ──────────────────────────────────────────────────────────────

describe("includes edge cases", () => {
    test("empty array always false", () => {
        const l = list([]);
        expect(l.includes(1).get()).toBe(false);
    });

    test("NaN handling matches native (uses SameValueZero)", () => {
        const l = list([1, NaN, 3]);
        expect(l.includes(NaN).get()).toBe([1, NaN, 3].includes(NaN));
    });

    test("undefined in array", () => {
        const l = list([1, undefined, 3]);
        expect(l.includes(undefined).get()).toBe(true);
    });

    test("null vs undefined", () => {
        const l = list([null]);
        expect(l.includes(undefined).get()).toBe(false);
        expect(l.includes(null).get()).toBe(true);
    });

    test("reacts to pop removing the included element", () => {
        const l = list([1, 2, 3]);
        const r = l.includes(3);
        expect(r.get()).toBe(true);
        l.pop();
        expect(r.get()).toBe(false);
    });
});

// ─── indexOf ───────────────────────────────────────────────────────────────

describe("indexOf edge cases", () => {
    test("empty array returns -1", () => {
        const l = list([]);
        expect(l.indexOf(1).get()).toBe(-1);
    });

    test("returns first occurrence with duplicates", () => {
        const l = list([1, 2, 1, 2]);
        expect(l.indexOf(2).get()).toBe(1);
    });

    test("strict equality (no type coercion)", () => {
        const l = list([0, false, "", null]);
        expect(l.indexOf(false).get()).toBe(1);
        expect(l.indexOf(0).get()).toBe(0);
        expect(l.indexOf("").get()).toBe(2);
        expect(l.indexOf(null).get()).toBe(3);
    });

    test("NaN is not found (matches native indexOf)", () => {
        const l = list([NaN]);
        expect(l.indexOf(NaN).get()).toBe([NaN].indexOf(NaN));
    });

    test("reacts to shift changing indices", () => {
        const l = list(["a", "b", "c"]);
        const r = l.indexOf("b");
        expect(r.get()).toBe(1);
        l.shift();
        expect(r.get()).toBe(0);
    });
});

// ─── join ──────────────────────────────────────────────────────────────────

describe("join edge cases", () => {
    test("empty array returns empty string", () => {
        const l = list([]);
        expect(l.join(",").get()).toBe("");
    });

    test("single element, no separator visible", () => {
        const l = list([42]);
        expect(l.join("-").get()).toBe("42");
    });

    test("null and undefined become empty strings (native behaviour)", () => {
        const l = list([1, null, undefined, 2]);
        const native = [1, null, undefined, 2].join(",");
        expect(l.join(",").get()).toBe(native);
    });

    test("empty string separator", () => {
        const l = list(["a", "b", "c"]);
        expect(l.join("").get()).toBe("abc");
    });
});

// ─── map ───────────────────────────────────────────────────────────────────

describe("map edge cases", () => {
    test("empty array", () => {
        const l = list([]);
        expect(l.map((x) => x * 2).get()).toEqual([]);
    });

    test("single element", () => {
        const l = list([5]);
        expect(l.map((x) => x * 3).get()).toEqual([15]);
    });

    test("callback returning undefined", () => {
        const l = list([1, 2, 3]);
        const r = l.map(() => undefined);
        expect(r.get()).toEqual([undefined, undefined, undefined]);
    });

    test("callback returning mixed types", () => {
        const l = list([1, 2, 3]);
        const r = l.map((x) => x > 1 ? "yes" : 0);
        expect(r.get()).toEqual([0, "yes", "yes"]);
    });

    test("reacts to sort", () => {
        const l = list([3, 1, 2]);
        const r = l.map((x) => x * 10);
        expect(r.get()).toEqual([30, 10, 20]);
        l.sort();
        expect(r.get()).toEqual([10, 20, 30]);
    });
});

// ─── reduce / reduceRight ──────────────────────────────────────────────────

describe("reduce edge cases", () => {
    test("single element without initial value returns that element", () => {
        const l = list([42]);
        expect(l.reduce((a, b) => a + b).get()).toBe(42);
    });

    test("single element with initial value", () => {
        const l = list([3]);
        expect(l.reduce((a, b) => a + b, 10).get()).toBe(13);
    });

    test("empty array with initial value returns initial", () => {
        const l = list([]);
        expect(l.reduce((a, b) => a + b, 99).get()).toBe(99);
    });

    test("callback receives (acc, element, index)", () => {
        const l = list(["a", "b", "c"]);
        const r = l.reduce((acc, val, i) => acc + val + i, "");
        expect(r.get()).toBe("a0b1c2");
    });

    test("reacts to reverse", () => {
        const l = list(["a", "b", "c"]);
        const r = l.reduce((acc, x) => acc + x, "");
        expect(r.get()).toBe("abc");
        l.reverse();
        expect(r.get()).toBe("cba");
    });
});

describe("reduceRight edge cases", () => {
    test("single element without initial value", () => {
        const l = list([42]);
        expect(l.reduceRight((a, b) => a + b).get()).toBe(42);
    });

    test("empty array with initial value returns initial", () => {
        const l = list([]);
        expect(l.reduceRight((a, b) => a + b, 99).get()).toBe(99);
    });

    test("processes elements right to left", () => {
        const l = list([1, 2, 3]);
        const r = l.reduceRight((acc, x) => acc + String(x), "");
        expect(r.get()).toBe("321");
    });
});

// ─── slice ─────────────────────────────────────────────────────────────────

describe("slice edge cases", () => {
    test("start beyond length returns empty", () => {
        const l = list([1, 2, 3]);
        expect(l.slice(10).get()).toEqual([]);
    });

    test("negative start and end", () => {
        const l = list([1, 2, 3, 4, 5]);
        expect(l.slice(-3, -1).get()).toEqual([3, 4]);
    });

    test("end before start returns empty", () => {
        const l = list([1, 2, 3]);
        expect(l.slice(2, 1).get()).toEqual([]);
    });

    test("empty array", () => {
        const l = list([]);
        expect(l.slice().get()).toEqual([]);
    });

    test("start 0 end 0 returns empty", () => {
        const l = list([1, 2, 3]);
        expect(l.slice(0, 0).get()).toEqual([]);
    });

    test("negative start beyond length clamps to 0", () => {
        const l = list([1, 2, 3]);
        expect(l.slice(-100).get()).toEqual([1, 2, 3]);
    });

    test("reacts to fill", () => {
        const l = list([1, 2, 3, 4]);
        const r = l.slice(1, 3);
        expect(r.get()).toEqual([2, 3]);
        l.fill(0);
        expect(r.get()).toEqual([0, 0]);
    });
});

// ─── splice (read method edge cases) ───────────────────────────────────────

describe("splice edge cases", () => {
    test("negative start index", () => {
        const l = list([1, 2, 3, 4]);
        l.splice(-2, 1);
        expect(l.get()).toEqual([1, 2, 4]);
    });

    test("deleteCount larger than remaining elements", () => {
        const l = list([1, 2, 3]);
        l.splice(1, 100);
        expect(l.get()).toEqual([1]);
    });

    test("start beyond length appends", () => {
        const l = list([1, 2]);
        l.splice(10, 0, 3);
        expect(l.get()).toEqual([1, 2, 3]);
    });

    test("deleteCount 0 with inserts", () => {
        const l = list([1, 4]);
        l.splice(1, 0, 2, 3);
        expect(l.get()).toEqual([1, 2, 3, 4]);
    });

    test("empty array splice inserts at 0", () => {
        const l = list([]);
        l.splice(0, 0, 1, 2);
        expect(l.get()).toEqual([1, 2]);
    });

    test("negative start beyond length clamps to 0", () => {
        const l = list([1, 2, 3]);
        l.splice(-100, 1);
        expect(l.get()).toEqual([2, 3]);
    });
});

// ─── sort ──────────────────────────────────────────────────────────────────

describe("sort edge cases", () => {
    test("empty array", () => {
        const l = list([]);
        l.sort();
        expect(l.get()).toEqual([]);
    });

    test("single element", () => {
        const l = list([1]);
        l.sort();
        expect(l.get()).toEqual([1]);
    });

    test("already sorted", () => {
        const l = list([1, 2, 3]);
        l.sort();
        expect(l.get()).toEqual([1, 2, 3]);
    });

    test("default sort is lexicographic (matches native)", () => {
        const l = list([10, 9, 2, 1, 100]);
        l.sort();
        const native = [10, 9, 2, 1, 100].sort();
        expect(l.get()).toEqual(native);
    });

    test("sort stability with equal elements", () => {
        const l = list([3, 1, 2, 1, 3]);
        l.sort((a, b) => a - b);
        expect(l.get()).toEqual([1, 1, 2, 3, 3]);
    });
});

// ─── fill ──────────────────────────────────────────────────────────────────

describe("fill edge cases", () => {
    test("fill with no start/end fills entire array", () => {
        const l = list([1, 2, 3]);
        l.fill(0);
        expect(l.get()).toEqual([0, 0, 0]);
    });

    test("negative start", () => {
        const l = list([1, 2, 3, 4]);
        l.fill(0, -2);
        expect(l.get()).toEqual([1, 2, 0, 0]);
    });

    test("negative end", () => {
        const l = list([1, 2, 3, 4]);
        l.fill(0, 1, -1);
        expect(l.get()).toEqual([1, 0, 0, 4]);
    });

    test("start equals end does nothing", () => {
        const l = list([1, 2, 3]);
        l.fill(0, 1, 1);
        expect(l.get()).toEqual([1, 2, 3]);
    });

    test("empty array", () => {
        const l = list([]);
        l.fill(0);
        expect(l.get()).toEqual([]);
    });

    test("start beyond length does nothing", () => {
        const l = list([1, 2]);
        l.fill(0, 10);
        expect(l.get()).toEqual([1, 2]);
    });
});

// ─── copyWithin ────────────────────────────────────────────────────────────

describe("copyWithin edge cases", () => {
    test("negative target", () => {
        const l = list([1, 2, 3, 4, 5]);
        l.copyWithin(-2, 0);
        const native = [1, 2, 3, 4, 5];
        native.copyWithin(-2, 0);
        expect(l.get()).toEqual(native);
    });

    test("overlapping forward copy", () => {
        const l = list([1, 2, 3, 4, 5]);
        l.copyWithin(1, 0, 3);
        const native = [1, 2, 3, 4, 5];
        native.copyWithin(1, 0, 3);
        expect(l.get()).toEqual(native);
    });

    test("target beyond length does nothing", () => {
        const l = list([1, 2, 3]);
        l.copyWithin(10, 0);
        expect(l.get()).toEqual([1, 2, 3]);
    });

    test("empty array", () => {
        const l = list([]);
        l.copyWithin(0, 0);
        expect(l.get()).toEqual([]);
    });

    test("single element", () => {
        const l = list([1]);
        l.copyWithin(0, 0);
        expect(l.get()).toEqual([1]);
    });
});

// ─── reverse ───────────────────────────────────────────────────────────────

describe("reverse edge cases", () => {
    test("empty array", () => {
        const l = list([]);
        l.reverse();
        expect(l.get()).toEqual([]);
    });

    test("single element", () => {
        const l = list([1]);
        l.reverse();
        expect(l.get()).toEqual([1]);
    });

    test("two elements", () => {
        const l = list([1, 2]);
        l.reverse();
        expect(l.get()).toEqual([2, 1]);
    });

    test("double reverse restores original", () => {
        const l = list([1, 2, 3]);
        l.reverse();
        l.reverse();
        expect(l.get()).toEqual([1, 2, 3]);
    });
});

// ─── pop / shift on empty ──────────────────────────────────────────────────

describe("pop edge cases", () => {
    test("pop on empty array", () => {
        const l = list([]);
        l.pop();
        expect(l.get()).toEqual([]);
    });

    test("pop all elements one by one", () => {
        const l = list([1, 2, 3]);
        l.pop();
        l.pop();
        l.pop();
        expect(l.get()).toEqual([]);
    });

    test("pop beyond empty is safe", () => {
        const l = list([1]);
        l.pop();
        l.pop();
        l.pop();
        expect(l.get()).toEqual([]);
    });
});

describe("shift edge cases", () => {
    test("shift on empty array", () => {
        const l = list([]);
        l.shift();
        expect(l.get()).toEqual([]);
    });

    test("shift all elements one by one", () => {
        const l = list([1, 2, 3]);
        l.shift();
        l.shift();
        l.shift();
        expect(l.get()).toEqual([]);
    });

    test("shift beyond empty is safe", () => {
        const l = list([1]);
        l.shift();
        l.shift();
        expect(l.get()).toEqual([]);
    });
});

// ─── mixed mutations and reads ─────────────────────────────────────────────

describe("mutation + read consistency", () => {
    test("push then map reflects new element", () => {
        const l = list([1, 2]);
        const r = l.map((x) => x * 10);
        expect(r.get()).toEqual([10, 20]);
        l.push(3);
        expect(r.get()).toEqual([10, 20, 30]);
    });

    test("splice then filter", () => {
        const l = list([1, 2, 3, 4, 5]);
        const r = l.filter((x) => x % 2 === 1);
        expect(r.get()).toEqual([1, 3, 5]);
        l.splice(0, 2);
        expect(r.get()).toEqual([3, 5]);
    });

    test("reverse then reduce", () => {
        const l = list(["a", "b", "c"]);
        const r = l.reduce((acc, x) => acc + x, "");
        expect(r.get()).toBe("abc");
        l.reverse();
        expect(r.get()).toBe("cba");
    });

    test("fill then every", () => {
        const l = list([1, 2, 3]);
        const r = l.every((x) => x === 0);
        expect(r.get()).toBe(false);
        l.fill(0);
        expect(r.get()).toBe(true);
    });

    test("sort then indexOf", () => {
        const l = list([3, 1, 2]);
        const r = l.indexOf(1);
        expect(r.get()).toBe(1);
        l.sort();
        expect(r.get()).toBe(0);
    });

    test("multiple mutations then read", () => {
        const l = list([1, 2, 3]);
        const r = l.join(",");
        l.push(4);
        l.shift();
        l.reverse();
        expect(r.get()).toBe("4,3,2");
    });
});
