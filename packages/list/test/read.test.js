import { describe, test, expect } from "#test-runner";
import "#list";
import { c } from "@fyren/core";

// ─── at ─────────────────────────────────────────────────────────────────────

describe("at", () => {
    test("returns element at given index", () => {
        const l = c.list(["a", "b", "c"]);
        const r = l.at(1);
        expect(r.get()).toBe("b");
    });

    test("supports negative index", () => {
        const l = c.list(["a", "b", "c"]);
        const r = l.at(-1);
        expect(r.get()).toBe("c");
    });

    test("reacts when the source array changes", () => {
        const l = c.list(["a", "b", "c"]);
        const r = l.at(0);
        expect(r.get()).toBe("a");
        l.set(["x", "y", "z"]);
        expect(r.get()).toBe("x");
    });

    test("returns undefined for out-of-bounds index", () => {
        const l = c.list(["a"]);
        const r = l.at(5);
        expect(r.get()).toBeUndefined();
    });
});

// ─── concat ─────────────────────────────────────────────────────────────────

describe("concat", () => {
    test("concatenates with a plain array", () => {
        const l = c.list([1, 2]);
        const r = l.concat([3, 4]);
        expect(r.get()).toEqual([1, 2, 3, 4]);
    });

    test("concatenates with multiple arrays", () => {
        const l = c.list([1]);
        const r = l.concat([2], [3, 4]);
        expect(r.get()).toEqual([1, 2, 3, 4]);
    });

    test("reacts when source changes", () => {
        const l = c.list([1]);
        const r = l.concat([2]);
        expect(r.get()).toEqual([1, 2]);
        l.set([10]);
        expect(r.get()).toEqual([10, 2]);
    });

});

// ─── entries ────────────────────────────────────────────────────────────────

describe("entries", () => {
    test("returns an iterator of [index, value] pairs", () => {
        const l = c.list(["a", "b"]);
        const r = l.entries();
        expect([...r.get()]).toEqual([[0, "a"], [1, "b"]]);
    });

    test("reacts when source changes", () => {
        const l = c.list(["a"]);
        const r = l.entries();
        expect([...r.get()]).toEqual([[0, "a"]]);
        l.set(["x", "y"]);
        expect([...r.get()]).toEqual([[0, "x"], [1, "y"]]);
    });
});

// ─── every ──────────────────────────────────────────────────────────────────

describe("every", () => {
    test("returns true when all elements pass the test", () => {
        const l = c.list([2, 4, 6]);
        const r = l.every((x) => x % 2 === 0);
        expect(r.get()).toBe(true);
    });

    test("returns false when any element fails the test", () => {
        const l = c.list([2, 3, 6]);
        const r = l.every((x) => x % 2 === 0);
        expect(r.get()).toBe(false);
    });

    test("reacts when source changes", () => {
        const l = c.list([2, 4]);
        const r = l.every((x) => x % 2 === 0);
        expect(r.get()).toBe(true);
        l.set([2, 3]);
        expect(r.get()).toBe(false);
    });

    test("returns true for empty array", () => {
        const l = c.list([]);
        const r = l.every(() => false);
        expect(r.get()).toBe(true);
    });
});

// ─── filter ─────────────────────────────────────────────────────────────────

describe("filter", () => {
    test("filters elements by predicate", () => {
        const l = c.list([1, 2, 3, 4, 5]);
        const r = l.filter((x) => x > 3);
        expect(r.get()).toEqual([4, 5]);
    });

    test("reacts when source changes", () => {
        const l = c.list([1, 2, 3]);
        const r = l.filter((x) => x > 1);
        expect(r.get()).toEqual([2, 3]);
        l.set([5, 6, 7]);
        expect(r.get()).toEqual([5, 6, 7]);
    });

    test("callback receives index", () => {
        const l = c.list(["a", "b", "c"]);
        const r = l.filter((_, i) => i !== 1);
        expect(r.get()).toEqual(["a", "c"]);
    });

    test("returns empty array when nothing matches", () => {
        const l = c.list([1, 2, 3]);
        const r = l.filter(() => false);
        expect(r.get()).toEqual([]);
    });
});

// ─── find ───────────────────────────────────────────────────────────────────

describe("find", () => {
    test("finds the first matching element", () => {
        const l = c.list([1, 2, 3]);
        const r = l.find((x) => x > 1);
        expect(r.get()).toBe(2);
    });

    test("returns undefined when no match", () => {
        const l = c.list([1, 2, 3]);
        const r = l.find((x) => x > 10);
        expect(r.get()).toBeUndefined();
    });

    test("reacts when source changes", () => {
        const l = c.list([1, 2, 3]);
        const r = l.find((x) => x > 2);
        expect(r.get()).toBe(3);
        l.set([10, 20]);
        expect(r.get()).toBe(10);
    });
});

// ─── findIndex ──────────────────────────────────────────────────────────────

describe("findIndex", () => {
    test("returns index of first matching element", () => {
        const l = c.list([1, 2, 3]);
        const r = l.findIndex((x) => x === 2);
        expect(r.get()).toBe(1);
    });

    test("returns -1 when no match", () => {
        const l = c.list([1, 2, 3]);
        const r = l.findIndex((x) => x === 99);
        expect(r.get()).toBe(-1);
    });

    test("reacts when source changes", () => {
        const l = c.list([1, 2, 3]);
        const r = l.findIndex((x) => x === 3);
        expect(r.get()).toBe(2);
        l.set([3, 2, 1]);
        expect(r.get()).toBe(0);
    });
});

// ─── findLast ───────────────────────────────────────────────────────────────

describe("findLast", () => {
    test("finds the last matching element", () => {
        const l = c.list([1, 2, 3, 2]);
        const r = l.findLast((x) => x === 2);
        expect(r.get()).toBe(2);
    });

    test("returns undefined when no match", () => {
        const l = c.list([1, 2, 3]);
        const r = l.findLast((x) => x > 10);
        expect(r.get()).toBeUndefined();
    });

    test("reacts when source changes", () => {
        const l = c.list([1, 2, 3]);
        const r = l.findLast((x) => x > 1);
        expect(r.get()).toBe(3);
        l.set([10, 20, 5]);
        expect(r.get()).toBe(5);
    });
});

// ─── findLastIndex ──────────────────────────────────────────────────────────

describe("findLastIndex", () => {
    test("returns index of last matching element", () => {
        const l = c.list([1, 2, 3, 2]);
        const r = l.findLastIndex((x) => x === 2);
        expect(r.get()).toBe(3);
    });

    test("returns -1 when no match", () => {
        const l = c.list([1, 2, 3]);
        const r = l.findLastIndex((x) => x === 99);
        expect(r.get()).toBe(-1);
    });

    test("reacts when source changes", () => {
        const l = c.list([1, 2, 3]);
        const r = l.findLastIndex((x) => x > 1);
        expect(r.get()).toBe(2);
        l.set([10, 5, 1]);
        expect(r.get()).toBe(1);
    });
});

// ─── flat ───────────────────────────────────────────────────────────────────

describe("flat", () => {
    test("flattens one level by default", () => {
        const l = c.list([[1, 2], [3, 4]]);
        const r = l.flat();
        expect(r.get()).toEqual([1, 2, 3, 4]);
    });

    test("flattens to specified depth", () => {
        const l = c.list([[[1]], [[2]]]);
        const r = l.flat(2);
        expect(r.get()).toEqual([1, 2]);
    });

    test("reacts when source changes", () => {
        const l = c.list([[1], [2]]);
        const r = l.flat();
        expect(r.get()).toEqual([1, 2]);
        l.set([[3, 4], [5]]);
        expect(r.get()).toEqual([3, 4, 5]);
    });

});

// ─── flatMap ────────────────────────────────────────────────────────────────

describe("flatMap", () => {
    test("maps and flattens one level", () => {
        const l = c.list([1, 2, 3]);
        const r = l.flatMap((x) => [x, x * 2]);
        expect(r.get()).toEqual([1, 2, 2, 4, 3, 6]);
    });

    test("reacts when source changes", () => {
        const l = c.list([1, 2]);
        const r = l.flatMap((x) => [x, -x]);
        expect(r.get()).toEqual([1, -1, 2, -2]);
        l.set([10]);
        expect(r.get()).toEqual([10, -10]);
    });
});

// ─── includes ───────────────────────────────────────────────────────────────

describe("includes", () => {
    test("returns true when element is present", () => {
        const l = c.list([1, 2, 3]);
        const r = l.includes(2);
        expect(r.get()).toBe(true);
    });

    test("returns false when element is absent", () => {
        const l = c.list([1, 2, 3]);
        const r = l.includes(99);
        expect(r.get()).toBe(false);
    });

    test("reacts when source changes", () => {
        const l = c.list([1, 2, 3]);
        const r = l.includes(3);
        expect(r.get()).toBe(true);
        l.set([1, 2]);
        expect(r.get()).toBe(false);
    });

});

// ─── indexOf ────────────────────────────────────────────────────────────────

describe("indexOf", () => {
    test("returns first index of element", () => {
        const l = c.list([1, 2, 3, 2]);
        const r = l.indexOf(2);
        expect(r.get()).toBe(1);
    });

    test("returns -1 when element is absent", () => {
        const l = c.list([1, 2, 3]);
        const r = l.indexOf(99);
        expect(r.get()).toBe(-1);
    });

    test("reacts when source changes", () => {
        const l = c.list(["a", "b", "c"]);
        const r = l.indexOf("b");
        expect(r.get()).toBe(1);
        l.set(["b", "a"]);
        expect(r.get()).toBe(0);
    });

});

// ─── join ───────────────────────────────────────────────────────────────────

describe("join", () => {
    test("joins with default comma separator", () => {
        const l = c.list([1, 2, 3]);
        const r = l.join();
        expect(r.get()).toBe("1,2,3");
    });

    test("joins with custom separator", () => {
        const l = c.list(["a", "b", "c"]);
        const r = l.join("-");
        expect(r.get()).toBe("a-b-c");
    });

    test("reacts when source changes", () => {
        const l = c.list([1, 2]);
        const r = l.join("+");
        expect(r.get()).toBe("1+2");
        l.set([3, 4, 5]);
        expect(r.get()).toBe("3+4+5");
    });

});

// ─── keys ───────────────────────────────────────────────────────────────────

describe("keys", () => {
    test("returns an iterator of indices", () => {
        const l = c.list(["a", "b", "c"]);
        const r = l.keys();
        expect([...r.get()]).toEqual([0, 1, 2]);
    });

    test("reacts when source changes", () => {
        const l = c.list(["a"]);
        const r = l.keys();
        expect([...r.get()]).toEqual([0]);
        l.set(["x", "y", "z"]);
        expect([...r.get()]).toEqual([0, 1, 2]);
    });
});

// ─── map ────────────────────────────────────────────────────────────────────

describe("map", () => {
    test("maps each element through a callback", () => {
        const l = c.list([1, 2, 3]);
        const r = l.map((x) => x * 2);
        expect(r.get()).toEqual([2, 4, 6]);
    });

    test("callback receives index as second argument", () => {
        const l = c.list(["a", "b", "c"]);
        const r = l.map((_, i) => i);
        expect(r.get()).toEqual([0, 1, 2]);
    });

    test("reacts when source changes", () => {
        const l = c.list([1, 2]);
        const r = l.map((x) => x + 10);
        expect(r.get()).toEqual([11, 12]);
        l.set([3]);
        expect(r.get()).toEqual([13]);
    });

    test("recomputes fully on each change", () => {
        const l = c.list([1, 2, 3]);
        let callCount = 0;
        const r = l.map((x) => {
            callCount++;
            return x;
        });
        expect(r.get()).toEqual([1, 2, 3]);
        expect(callCount).toBe(3);

        callCount = 0;
        l.set([4, 5]);
        expect(r.get()).toEqual([4, 5]);
        expect(callCount).toBe(2);
    });
});

// ─── reduce ─────────────────────────────────────────────────────────────────

describe("reduce", () => {
    test("reduces without initial value", () => {
        const l = c.list([1, 2, 3]);
        const r = l.reduce((acc, x) => acc + x);
        expect(r.get()).toBe(6);
    });

    test("reduces with initial value", () => {
        const l = c.list([1, 2, 3]);
        const r = l.reduce((acc, x) => acc + x, 10);
        expect(r.get()).toBe(16);
    });

    test("reacts when source changes", () => {
        const l = c.list([1, 2, 3]);
        const r = l.reduce((acc, x) => acc + x, 0);
        expect(r.get()).toBe(6);
        l.set([10, 20]);
        expect(r.get()).toBe(30);
    });

});

// ─── reduceRight ────────────────────────────────────────────────────────────

describe("reduceRight", () => {
    test("reduces from right without initial value", () => {
        const l = c.list(["a", "b", "c"]);
        const r = l.reduceRight((acc, x) => acc + x);
        expect(r.get()).toBe("cba");
    });

    test("reduces from right with initial value", () => {
        const l = c.list(["a", "b"]);
        const r = l.reduceRight((acc, x) => acc + x, "z");
        expect(r.get()).toBe("zba");
    });

    test("reacts when source changes", () => {
        const l = c.list([1, 2, 3]);
        const r = l.reduceRight((acc, x) => acc + x, 0);
        expect(r.get()).toBe(6);
        l.set([10, 20]);
        expect(r.get()).toBe(30);
    });
});

// ─── slice ──────────────────────────────────────────────────────────────────

describe("slice", () => {
    test("slices without arguments (shallow copy)", () => {
        const l = c.list([1, 2, 3]);
        const r = l.slice();
        expect(r.get()).toEqual([1, 2, 3]);
    });

    test("slices with start only", () => {
        const l = c.list([1, 2, 3, 4]);
        const r = l.slice(1);
        expect(r.get()).toEqual([2, 3, 4]);
    });

    test("slices with start and end", () => {
        const l = c.list([1, 2, 3, 4, 5]);
        const r = l.slice(1, 4);
        expect(r.get()).toEqual([2, 3, 4]);
    });

    test("supports negative indices", () => {
        const l = c.list([1, 2, 3, 4, 5]);
        const r = l.slice(-2);
        expect(r.get()).toEqual([4, 5]);
    });

    test("reacts when source changes", () => {
        const l = c.list([1, 2, 3]);
        const r = l.slice(0, 2);
        expect(r.get()).toEqual([1, 2]);
        l.set([10, 20, 30, 40]);
        expect(r.get()).toEqual([10, 20]);
    });

});

// ─── some ───────────────────────────────────────────────────────────────────

describe("some", () => {
    test("returns true when any element passes", () => {
        const l = c.list([1, 2, 3]);
        const r = l.some((x) => x > 2);
        expect(r.get()).toBe(true);
    });

    test("returns false when no element passes", () => {
        const l = c.list([1, 2, 3]);
        const r = l.some((x) => x > 10);
        expect(r.get()).toBe(false);
    });

    test("reacts when source changes", () => {
        const l = c.list([1, 2]);
        const r = l.some((x) => x > 5);
        expect(r.get()).toBe(false);
        l.set([1, 10]);
        expect(r.get()).toBe(true);
    });

    test("returns false for empty array", () => {
        const l = c.list([]);
        const r = l.some(() => true);
        expect(r.get()).toBe(false);
    });
});

// ─── values ─────────────────────────────────────────────────────────────────

describe("values", () => {
    test("returns an iterator of values", () => {
        const l = c.list([10, 20, 30]);
        const r = l.values();
        expect([...r.get()]).toEqual([10, 20, 30]);
    });

    test("reacts when source changes", () => {
        const l = c.list([1]);
        const r = l.values();
        expect([...r.get()]).toEqual([1]);
        l.set([5, 6]);
        expect([...r.get()]).toEqual([5, 6]);
    });
});
