import { describe, test, expect } from "#test-runner";
import { list } from "../src/list.js";
import { c } from "@fyren/core";

// ─── at ─────────────────────────────────────────────────────────────────────

describe("at", () => {
    test("returns element at given index", () => {
        const l = list(["a", "b", "c"]);
        const c = l.at(1);
        expect(c.get()).toBe("b");
    });

    test("supports negative index", () => {
        const l = list(["a", "b", "c"]);
        const c = l.at(-1);
        expect(c.get()).toBe("c");
    });

    test("reacts when the source array changes", () => {
        const l = list(["a", "b", "c"]);
        const c = l.at(0);
        expect(c.get()).toBe("a");
        l.set(["x", "y", "z"]);
        expect(c.get()).toBe("x");
    });

    test("returns undefined for out-of-bounds index", () => {
        const l = list(["a"]);
        const c = l.at(5);
        expect(c.get()).toBeUndefined();
    });
});

// ─── concat ─────────────────────────────────────────────────────────────────

describe("concat", () => {
    test("concatenates with a plain array", () => {
        const l = list([1, 2]);
        const c = l.concat([3, 4]);
        expect(c.get()).toEqual([1, 2, 3, 4]);
    });

    test("concatenates with multiple arrays", () => {
        const l = list([1]);
        const c = l.concat([2], [3, 4]);
        expect(c.get()).toEqual([1, 2, 3, 4]);
    });

    test("reacts when source changes", () => {
        const l = list([1]);
        const c = l.concat([2]);
        expect(c.get()).toEqual([1, 2]);
        l.set([10]);
        expect(c.get()).toEqual([10, 2]);
    });

});

// ─── entries ────────────────────────────────────────────────────────────────

describe("entries", () => {
    test("returns an iterator of [index, value] pairs", () => {
        const l = list(["a", "b"]);
        const c = l.entries();
        expect([...c.get()]).toEqual([[0, "a"], [1, "b"]]);
    });

    test("reacts when source changes", () => {
        const l = list(["a"]);
        const c = l.entries();
        expect([...c.get()]).toEqual([[0, "a"]]);
        l.set(["x", "y"]);
        expect([...c.get()]).toEqual([[0, "x"], [1, "y"]]);
    });
});

// ─── every ──────────────────────────────────────────────────────────────────

describe("every", () => {
    test("returns true when all elements pass the test", () => {
        const l = list([2, 4, 6]);
        const c = l.every((x) => x % 2 === 0);
        expect(c.get()).toBe(true);
    });

    test("returns false when any element fails the test", () => {
        const l = list([2, 3, 6]);
        const c = l.every((x) => x % 2 === 0);
        expect(c.get()).toBe(false);
    });

    test("reacts when source changes", () => {
        const l = list([2, 4]);
        const c = l.every((x) => x % 2 === 0);
        expect(c.get()).toBe(true);
        l.set([2, 3]);
        expect(c.get()).toBe(false);
    });

    test("returns true for empty array", () => {
        const l = list([]);
        const c = l.every(() => false);
        expect(c.get()).toBe(true);
    });
});

// ─── filter ─────────────────────────────────────────────────────────────────

describe("filter", () => {
    test("filters elements by predicate", () => {
        const l = list([1, 2, 3, 4, 5]);
        const c = l.filter((x) => x > 3);
        expect(c.get()).toEqual([4, 5]);
    });

    test("reacts when source changes", () => {
        const l = list([1, 2, 3]);
        const c = l.filter((x) => x > 1);
        expect(c.get()).toEqual([2, 3]);
        l.set([5, 6, 7]);
        expect(c.get()).toEqual([5, 6, 7]);
    });

    test("callback receives index", () => {
        const l = list(["a", "b", "c"]);
        const c = l.filter((_, i) => i !== 1);
        expect(c.get()).toEqual(["a", "c"]);
    });

    test("returns empty array when nothing matches", () => {
        const l = list([1, 2, 3]);
        const c = l.filter(() => false);
        expect(c.get()).toEqual([]);
    });
});

// ─── find ───────────────────────────────────────────────────────────────────

describe("find", () => {
    test("finds the first matching element", () => {
        const l = list([1, 2, 3]);
        const c = l.find((x) => x > 1);
        expect(c.get()).toBe(2);
    });

    test("returns undefined when no match", () => {
        const l = list([1, 2, 3]);
        const c = l.find((x) => x > 10);
        expect(c.get()).toBeUndefined();
    });

    test("reacts when source changes", () => {
        const l = list([1, 2, 3]);
        const c = l.find((x) => x > 2);
        expect(c.get()).toBe(3);
        l.set([10, 20]);
        expect(c.get()).toBe(10);
    });
});

// ─── findIndex ──────────────────────────────────────────────────────────────

describe("findIndex", () => {
    test("returns index of first matching element", () => {
        const l = list([1, 2, 3]);
        const c = l.findIndex((x) => x === 2);
        expect(c.get()).toBe(1);
    });

    test("returns -1 when no match", () => {
        const l = list([1, 2, 3]);
        const c = l.findIndex((x) => x === 99);
        expect(c.get()).toBe(-1);
    });

    test("reacts when source changes", () => {
        const l = list([1, 2, 3]);
        const c = l.findIndex((x) => x === 3);
        expect(c.get()).toBe(2);
        l.set([3, 2, 1]);
        expect(c.get()).toBe(0);
    });
});

// ─── findLast ───────────────────────────────────────────────────────────────

describe("findLast", () => {
    test("finds the last matching element", () => {
        const l = list([1, 2, 3, 2]);
        const c = l.findLast((x) => x === 2);
        expect(c.get()).toBe(2);
    });

    test("returns undefined when no match", () => {
        const l = list([1, 2, 3]);
        const c = l.findLast((x) => x > 10);
        expect(c.get()).toBeUndefined();
    });

    test("reacts when source changes", () => {
        const l = list([1, 2, 3]);
        const c = l.findLast((x) => x > 1);
        expect(c.get()).toBe(3);
        l.set([10, 20, 5]);
        expect(c.get()).toBe(5);
    });
});

// ─── findLastIndex ──────────────────────────────────────────────────────────

describe("findLastIndex", () => {
    test("returns index of last matching element", () => {
        const l = list([1, 2, 3, 2]);
        const c = l.findLastIndex((x) => x === 2);
        expect(c.get()).toBe(3);
    });

    test("returns -1 when no match", () => {
        const l = list([1, 2, 3]);
        const c = l.findLastIndex((x) => x === 99);
        expect(c.get()).toBe(-1);
    });

    test("reacts when source changes", () => {
        const l = list([1, 2, 3]);
        const c = l.findLastIndex((x) => x > 1);
        expect(c.get()).toBe(2);
        l.set([10, 5, 1]);
        expect(c.get()).toBe(1);
    });
});

// ─── flat ───────────────────────────────────────────────────────────────────

describe("flat", () => {
    test("flattens one level by default", () => {
        const l = list([[1, 2], [3, 4]]);
        const c = l.flat();
        expect(c.get()).toEqual([1, 2, 3, 4]);
    });

    test("flattens to specified depth", () => {
        const l = list([[[1]], [[2]]]);
        const c = l.flat(2);
        expect(c.get()).toEqual([1, 2]);
    });

    test("reacts when source changes", () => {
        const l = list([[1], [2]]);
        const c = l.flat();
        expect(c.get()).toEqual([1, 2]);
        l.set([[3, 4], [5]]);
        expect(c.get()).toEqual([3, 4, 5]);
    });

});

// ─── flatMap ────────────────────────────────────────────────────────────────

describe("flatMap", () => {
    test("maps and flattens one level", () => {
        const l = list([1, 2, 3]);
        const c = l.flatMap((x) => [x, x * 2]);
        expect(c.get()).toEqual([1, 2, 2, 4, 3, 6]);
    });

    test("reacts when source changes", () => {
        const l = list([1, 2]);
        const c = l.flatMap((x) => [x, -x]);
        expect(c.get()).toEqual([1, -1, 2, -2]);
        l.set([10]);
        expect(c.get()).toEqual([10, -10]);
    });
});

// ─── includes ───────────────────────────────────────────────────────────────

describe("includes", () => {
    test("returns true when element is present", () => {
        const l = list([1, 2, 3]);
        const c = l.includes(2);
        expect(c.get()).toBe(true);
    });

    test("returns false when element is absent", () => {
        const l = list([1, 2, 3]);
        const c = l.includes(99);
        expect(c.get()).toBe(false);
    });

    test("reacts when source changes", () => {
        const l = list([1, 2, 3]);
        const c = l.includes(3);
        expect(c.get()).toBe(true);
        l.set([1, 2]);
        expect(c.get()).toBe(false);
    });

});

// ─── indexOf ────────────────────────────────────────────────────────────────

describe("indexOf", () => {
    test("returns first index of element", () => {
        const l = list([1, 2, 3, 2]);
        const c = l.indexOf(2);
        expect(c.get()).toBe(1);
    });

    test("returns -1 when element is absent", () => {
        const l = list([1, 2, 3]);
        const c = l.indexOf(99);
        expect(c.get()).toBe(-1);
    });

    test("reacts when source changes", () => {
        const l = list(["a", "b", "c"]);
        const c = l.indexOf("b");
        expect(c.get()).toBe(1);
        l.set(["b", "a"]);
        expect(c.get()).toBe(0);
    });

});

// ─── join ───────────────────────────────────────────────────────────────────

describe("join", () => {
    test("joins with default comma separator", () => {
        const l = list([1, 2, 3]);
        const c = l.join();
        expect(c.get()).toBe("1,2,3");
    });

    test("joins with custom separator", () => {
        const l = list(["a", "b", "c"]);
        const c = l.join("-");
        expect(c.get()).toBe("a-b-c");
    });

    test("reacts when source changes", () => {
        const l = list([1, 2]);
        const c = l.join("+");
        expect(c.get()).toBe("1+2");
        l.set([3, 4, 5]);
        expect(c.get()).toBe("3+4+5");
    });

});

// ─── keys ───────────────────────────────────────────────────────────────────

describe("keys", () => {
    test("returns an iterator of indices", () => {
        const l = list(["a", "b", "c"]);
        const c = l.keys();
        expect([...c.get()]).toEqual([0, 1, 2]);
    });

    test("reacts when source changes", () => {
        const l = list(["a"]);
        const c = l.keys();
        expect([...c.get()]).toEqual([0]);
        l.set(["x", "y", "z"]);
        expect([...c.get()]).toEqual([0, 1, 2]);
    });
});

// ─── map ────────────────────────────────────────────────────────────────────

describe("map", () => {
    test("maps each element through a callback", () => {
        const l = list([1, 2, 3]);
        const c = l.map((x) => x * 2);
        expect(c.get()).toEqual([2, 4, 6]);
    });

    test("callback receives index as second argument", () => {
        const l = list(["a", "b", "c"]);
        const c = l.map((_, i) => i);
        expect(c.get()).toEqual([0, 1, 2]);
    });

    test("reacts when source changes", () => {
        const l = list([1, 2]);
        const c = l.map((x) => x + 10);
        expect(c.get()).toEqual([11, 12]);
        l.set([3]);
        expect(c.get()).toEqual([13]);
    });

    test("recomputes fully on each change", () => {
        const l = list([1, 2, 3]);
        let callCount = 0;
        const c = l.map((x) => {
            callCount++;
            return x;
        });
        expect(c.get()).toEqual([1, 2, 3]);
        expect(callCount).toBe(3);

        callCount = 0;
        l.set([4, 5]);
        expect(c.get()).toEqual([4, 5]);
        expect(callCount).toBe(2);
    });
});

// ─── reduce ─────────────────────────────────────────────────────────────────

describe("reduce", () => {
    test("reduces without initial value", () => {
        const l = list([1, 2, 3]);
        const c = l.reduce((acc, x) => acc + x);
        expect(c.get()).toBe(6);
    });

    test("reduces with initial value", () => {
        const l = list([1, 2, 3]);
        const c = l.reduce((acc, x) => acc + x, 10);
        expect(c.get()).toBe(16);
    });

    test("reacts when source changes", () => {
        const l = list([1, 2, 3]);
        const c = l.reduce((acc, x) => acc + x, 0);
        expect(c.get()).toBe(6);
        l.set([10, 20]);
        expect(c.get()).toBe(30);
    });

});

// ─── reduceRight ────────────────────────────────────────────────────────────

describe("reduceRight", () => {
    test("reduces from right without initial value", () => {
        const l = list(["a", "b", "c"]);
        const c = l.reduceRight((acc, x) => acc + x);
        expect(c.get()).toBe("cba");
    });

    test("reduces from right with initial value", () => {
        const l = list(["a", "b"]);
        const c = l.reduceRight((acc, x) => acc + x, "z");
        expect(c.get()).toBe("zba");
    });

    test("reacts when source changes", () => {
        const l = list([1, 2, 3]);
        const c = l.reduceRight((acc, x) => acc + x, 0);
        expect(c.get()).toBe(6);
        l.set([10, 20]);
        expect(c.get()).toBe(30);
    });
});

// ─── slice ──────────────────────────────────────────────────────────────────

describe("slice", () => {
    test("slices without arguments (shallow copy)", () => {
        const l = list([1, 2, 3]);
        const c = l.slice();
        expect(c.get()).toEqual([1, 2, 3]);
    });

    test("slices with start only", () => {
        const l = list([1, 2, 3, 4]);
        const c = l.slice(1);
        expect(c.get()).toEqual([2, 3, 4]);
    });

    test("slices with start and end", () => {
        const l = list([1, 2, 3, 4, 5]);
        const c = l.slice(1, 4);
        expect(c.get()).toEqual([2, 3, 4]);
    });

    test("supports negative indices", () => {
        const l = list([1, 2, 3, 4, 5]);
        const c = l.slice(-2);
        expect(c.get()).toEqual([4, 5]);
    });

    test("reacts when source changes", () => {
        const l = list([1, 2, 3]);
        const c = l.slice(0, 2);
        expect(c.get()).toEqual([1, 2]);
        l.set([10, 20, 30, 40]);
        expect(c.get()).toEqual([10, 20]);
    });

});

// ─── some ───────────────────────────────────────────────────────────────────

describe("some", () => {
    test("returns true when any element passes", () => {
        const l = list([1, 2, 3]);
        const c = l.some((x) => x > 2);
        expect(c.get()).toBe(true);
    });

    test("returns false when no element passes", () => {
        const l = list([1, 2, 3]);
        const c = l.some((x) => x > 10);
        expect(c.get()).toBe(false);
    });

    test("reacts when source changes", () => {
        const l = list([1, 2]);
        const c = l.some((x) => x > 5);
        expect(c.get()).toBe(false);
        l.set([1, 10]);
        expect(c.get()).toBe(true);
    });

    test("returns false for empty array", () => {
        const l = list([]);
        const c = l.some(() => true);
        expect(c.get()).toBe(false);
    });
});

// ─── values ─────────────────────────────────────────────────────────────────

describe("values", () => {
    test("returns an iterator of values", () => {
        const l = list([10, 20, 30]);
        const c = l.values();
        expect([...c.get()]).toEqual([10, 20, 30]);
    });

    test("reacts when source changes", () => {
        const l = list([1]);
        const c = l.values();
        expect([...c.get()]).toEqual([1]);
        l.set([5, 6]);
        expect([...c.get()]).toEqual([5, 6]);
    });
});
