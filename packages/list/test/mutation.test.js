import { describe, test, expect } from "bun:test";
import { list } from "..";
import { signal, compute, effect, batch, root } from "anod";

// ─── push ───────────────────────────────────────────────────────────────────

describe("push", () => {
    test("appends a single element", () => {
        const l = list([1, 2]);
        l.push(3);
        expect(l.val()).toEqual([1, 2, 3]);
    });

    test("appends multiple elements", () => {
        const l = list([1]);
        l.push(2, 3, 4);
        expect(l.val()).toEqual([1, 2, 3, 4]);
    });

    test("triggers reactive updates", () => {
        const l = list([1]);
        const c = l.map((x) => x * 10);
        expect(c.val()).toEqual([10]);
        l.push(2);
        expect(c.val()).toEqual([10, 20]);
    });

    test("does nothing when called with no arguments", () => {
        const l = list([1, 2]);
        let count = 0;
        const c = l.map((x) => { count++; return x; });
        c.val();
        count = 0;
        l.push();
        // Should not trigger an update
        expect(l.val()).toEqual([1, 2]);
    });

    test("works inside a batch", () => {
        const l = list([1]);
        const c = l.map((x) => x * 2);
        expect(c.val()).toEqual([2]);
        batch(() => {
            l.push(2);
            l.push(3);
        });
        expect(c.val()).toEqual([2, 4, 6]);
    });
});

// ─── pop ────────────────────────────────────────────────────────────────────

describe("pop", () => {
    test("removes the last element", () => {
        const l = list([1, 2, 3]);
        l.pop();
        expect(l.val()).toEqual([1, 2]);
    });

    test("triggers reactive updates", () => {
        const l = list([1, 2, 3]);
        const c = l.map((x) => x);
        expect(c.val()).toEqual([1, 2, 3]);
        l.pop();
        expect(c.val()).toEqual([1, 2]);
    });

    test("works on a single-element array", () => {
        const l = list([1]);
        l.pop();
        expect(l.val()).toEqual([]);
    });

    test("works inside a batch", () => {
        const l = list([1, 2, 3]);
        batch(() => {
            l.pop();
            l.pop();
        });
        expect(l.val()).toEqual([1]);
    });
});

// ─── shift ──────────────────────────────────────────────────────────────────

describe("shift", () => {
    test("removes the first element", () => {
        const l = list([1, 2, 3]);
        l.shift();
        expect(l.val()).toEqual([2, 3]);
    });

    test("triggers reactive updates", () => {
        const l = list(["a", "b", "c"]);
        const c = l.join("-");
        expect(c.val()).toBe("a-b-c");
        l.shift();
        expect(c.val()).toBe("b-c");
    });

    test("works inside a batch", () => {
        const l = list([1, 2, 3, 4]);
        batch(() => {
            l.shift();
            l.shift();
        });
        expect(l.val()).toEqual([3, 4]);
    });
});

// ─── unshift ────────────────────────────────────────────────────────────────

describe("unshift", () => {
    test("prepends a single element", () => {
        const l = list([2, 3]);
        l.unshift(1);
        expect(l.val()).toEqual([1, 2, 3]);
    });

    test("prepends multiple elements", () => {
        const l = list([3]);
        l.unshift(1, 2);
        expect(l.val()).toEqual([1, 2, 3]);
    });

    test("triggers reactive updates", () => {
        const l = list([2]);
        const c = l.map((x) => x);
        expect(c.val()).toEqual([2]);
        l.unshift(1);
        expect(c.val()).toEqual([1, 2]);
    });

    test("does nothing when called with no arguments", () => {
        const l = list([1]);
        l.unshift();
        expect(l.val()).toEqual([1]);
    });

    test("works inside a batch", () => {
        const l = list([3]);
        batch(() => {
            l.unshift(2);
            l.unshift(1);
        });
        expect(l.val()).toEqual([1, 2, 3]);
    });
});

// ─── splice ─────────────────────────────────────────────────────────────────

describe("splice", () => {
    test("removes elements at a position", () => {
        const l = list([1, 2, 3, 4]);
        l.splice(1, 2);
        expect(l.val()).toEqual([1, 4]);
    });

    test("inserts elements at a position", () => {
        const l = list([1, 4]);
        l.splice(1, 0, 2, 3);
        expect(l.val()).toEqual([1, 2, 3, 4]);
    });

    test("replaces elements", () => {
        const l = list([1, 2, 3]);
        l.splice(1, 1, 20);
        expect(l.val()).toEqual([1, 20, 3]);
    });

    test("removes all elements from start when no deleteCount", () => {
        const l = list([1, 2, 3, 4]);
        l.splice(2);
        expect(l.val()).toEqual([1, 2]);
    });

    test("triggers reactive updates", () => {
        const l = list([1, 2, 3]);
        const c = l.map((x) => x);
        expect(c.val()).toEqual([1, 2, 3]);
        l.splice(1, 1, 20);
        expect(c.val()).toEqual([1, 20, 3]);
    });

    test("works inside a batch", () => {
        const l = list([1, 2, 3]);
        batch(() => {
            l.splice(0, 1);
            l.splice(1, 1);
        });
        expect(l.val()).toEqual([2]);
    });
});

// ─── reverse ────────────────────────────────────────────────────────────────

describe("reverse", () => {
    test("reverses the array in place", () => {
        const l = list([1, 2, 3]);
        l.reverse();
        expect(l.val()).toEqual([3, 2, 1]);
    });

    test("triggers reactive updates", () => {
        const l = list(["a", "b", "c"]);
        const c = l.join("");
        expect(c.val()).toBe("abc");
        l.reverse();
        expect(c.val()).toBe("cba");
    });

    test("works inside a batch", () => {
        const l = list([1, 2, 3]);
        batch(() => {
            l.reverse();
            l.push(4);
        });
        expect(l.val()).toEqual([3, 2, 1, 4]);
    });
});

// ─── sort ───────────────────────────────────────────────────────────────────

describe("sort", () => {
    test("sorts with default comparison", () => {
        const l = list([3, 1, 2]);
        l.sort();
        expect(l.val()).toEqual([1, 2, 3]);
    });

    test("sorts with custom comparator", () => {
        const l = list([3, 1, 2]);
        l.sort((a, b) => b - a);
        expect(l.val()).toEqual([3, 2, 1]);
    });

    test("triggers reactive updates", () => {
        const l = list([3, 1, 2]);
        const c = l.join(",");
        expect(c.val()).toBe("3,1,2");
        l.sort();
        expect(c.val()).toBe("1,2,3");
    });

    test("works inside a batch", () => {
        const l = list([3, 1, 2]);
        batch(() => {
            l.push(0);
            l.sort();
        });
        expect(l.val()).toEqual([0, 1, 2, 3]);
    });
});

// ─── fill ───────────────────────────────────────────────────────────────────

describe("fill", () => {
    test("fills entire array with value", () => {
        const l = list([1, 2, 3]);
        l.fill(0);
        expect(l.val()).toEqual([0, 0, 0]);
    });

    test("fills from start to end", () => {
        const l = list([1, 2, 3, 4]);
        l.fill(0, 1, 3);
        expect(l.val()).toEqual([1, 0, 0, 4]);
    });

    test("fills from start to array end", () => {
        const l = list([1, 2, 3]);
        l.fill(0, 1);
        expect(l.val()).toEqual([1, 0, 0]);
    });

    test("triggers reactive updates", () => {
        const l = list([1, 2, 3]);
        const c = l.every((x) => x === 0);
        expect(c.val()).toBe(false);
        l.fill(0);
        expect(c.val()).toBe(true);
    });

    test("works inside a batch", () => {
        const l = list([1, 2, 3]);
        batch(() => {
            l.fill(0);
            l.fill(5, 0, 1);
        });
        expect(l.val()).toEqual([5, 0, 0]);
    });
});

// ─── copyWithin ─────────────────────────────────────────────────────────────

describe("copyWithin", () => {
    test("copies within the array", () => {
        const l = list([1, 2, 3, 4, 5]);
        l.copyWithin(0, 3);
        expect(l.val()).toEqual([4, 5, 3, 4, 5]);
    });

    test("copies with end parameter", () => {
        const l = list([1, 2, 3, 4, 5]);
        l.copyWithin(1, 3, 4);
        expect(l.val()).toEqual([1, 4, 3, 4, 5]);
    });

    test("triggers reactive updates", () => {
        const l = list([1, 2, 3, 4]);
        const c = l.join(",");
        expect(c.val()).toBe("1,2,3,4");
        l.copyWithin(0, 2);
        expect(c.val()).toBe("3,4,3,4");
    });

    test("works inside a batch", () => {
        const l = list([1, 2, 3, 4]);
        batch(() => {
            l.copyWithin(0, 2);
        });
        expect(l.val()).toEqual([3, 4, 3, 4]);
    });
});
