import { describe, test, expect } from "#test-runner";
import { c } from "@fyren/core";
import { list } from "../src/list.js";

describe("push", () => {
    test("appends a single element", () => {
        const l = list([1, 2]);
        l.push(3);
        expect(l.get()).toEqual([1, 2, 3]);
    });

    test("appends multiple elements", () => {
        const l = list([1]);
        l.push(2, 3, 4);
        expect(l.get()).toEqual([1, 2, 3, 4]);
    });

    test("triggers reactive updates", () => {
        const l = list([1]);
        const m = l.map((x) => x * 10);
        expect(m.get()).toEqual([10]);
        l.push(2);
        expect(m.get()).toEqual([10, 20]);
    });

    test("does nothing when called with no arguments", () => {
        const l = list([1, 2]);
        l.push();
        expect(l.get()).toEqual([1, 2]);
    });

    test("works inside a batch", () => {
        const l = list([1]);
        const m = l.map((x) => x * 2);
        expect(m.get()).toEqual([2]);
        c.batch(() => {
            l.push(2);
            l.push(3);
        });
        expect(m.get()).toEqual([2, 4, 6]);
    });
});

describe("pop", () => {
    test("removes the last element", () => {
        const l = list([1, 2, 3]);
        l.pop();
        expect(l.get()).toEqual([1, 2]);
    });

    test("triggers reactive updates", () => {
        const l = list([1, 2, 3]);
        const m = l.map((x) => x);
        expect(m.get()).toEqual([1, 2, 3]);
        l.pop();
        expect(m.get()).toEqual([1, 2]);
    });

    test("works on a single-element array", () => {
        const l = list([1]);
        l.pop();
        expect(l.get()).toEqual([]);
    });

    test("works inside a batch", () => {
        const l = list([1, 2, 3]);
        c.batch(() => {
            l.pop();
            l.pop();
        });
        expect(l.get()).toEqual([1]);
    });
});

describe("shift", () => {
    test("removes the first element", () => {
        const l = list([1, 2, 3]);
        l.shift();
        expect(l.get()).toEqual([2, 3]);
    });

    test("triggers reactive updates", () => {
        const l = list(["a", "b", "c"]);
        const j = l.join("-");
        expect(j.get()).toBe("a-b-c");
        l.shift();
        expect(j.get()).toBe("b-c");
    });

    test("works inside a batch", () => {
        const l = list([1, 2, 3, 4]);
        c.batch(() => {
            l.shift();
            l.shift();
        });
        expect(l.get()).toEqual([3, 4]);
    });
});

describe("unshift", () => {
    test("prepends a single element", () => {
        const l = list([2, 3]);
        l.unshift(1);
        expect(l.get()).toEqual([1, 2, 3]);
    });

    test("prepends multiple elements", () => {
        const l = list([3]);
        l.unshift(1, 2);
        expect(l.get()).toEqual([1, 2, 3]);
    });

    test("triggers reactive updates", () => {
        const l = list([2]);
        const m = l.map((x) => x);
        expect(m.get()).toEqual([2]);
        l.unshift(1);
        expect(m.get()).toEqual([1, 2]);
    });

    test("does nothing when called with no arguments", () => {
        const l = list([1]);
        l.unshift();
        expect(l.get()).toEqual([1]);
    });

    test("works inside a batch", () => {
        const l = list([3]);
        c.batch(() => {
            l.unshift(2);
            l.unshift(1);
        });
        expect(l.get()).toEqual([1, 2, 3]);
    });
});

describe("splice", () => {
    test("removes elements at a position", () => {
        const l = list([1, 2, 3, 4]);
        l.splice(1, 2);
        expect(l.get()).toEqual([1, 4]);
    });

    test("inserts elements at a position", () => {
        const l = list([1, 4]);
        l.splice(1, 0, 2, 3);
        expect(l.get()).toEqual([1, 2, 3, 4]);
    });

    test("replaces elements", () => {
        const l = list([1, 2, 3]);
        l.splice(1, 1, 20);
        expect(l.get()).toEqual([1, 20, 3]);
    });

    test("removes all elements from start when no deleteCount", () => {
        const l = list([1, 2, 3, 4]);
        l.splice(2);
        expect(l.get()).toEqual([1, 2]);
    });

    test("triggers reactive updates", () => {
        const l = list([1, 2, 3]);
        const m = l.map((x) => x);
        expect(m.get()).toEqual([1, 2, 3]);
        l.splice(1, 1, 20);
        expect(m.get()).toEqual([1, 20, 3]);
    });

    test("works inside a batch", () => {
        const l = list([1, 2, 3]);
        c.batch(() => {
            l.splice(0, 1);
            l.splice(1, 1);
        });
        expect(l.get()).toEqual([2]);
    });
});

describe("reverse", () => {
    test("reverses the array in place", () => {
        const l = list([1, 2, 3]);
        l.reverse();
        expect(l.get()).toEqual([3, 2, 1]);
    });

    test("triggers reactive updates", () => {
        const l = list(["a", "b", "c"]);
        const j = l.join("");
        expect(j.get()).toBe("abc");
        l.reverse();
        expect(j.get()).toBe("cba");
    });

    test("works inside a batch", () => {
        const l = list([1, 2, 3]);
        c.batch(() => {
            l.reverse();
            l.push(4);
        });
        expect(l.get()).toEqual([3, 2, 1, 4]);
    });
});

describe("sort", () => {
    test("sorts with default comparison", () => {
        const l = list([3, 1, 2]);
        l.sort();
        expect(l.get()).toEqual([1, 2, 3]);
    });

    test("sorts with custom comparator", () => {
        const l = list([3, 1, 2]);
        l.sort((a, b) => b - a);
        expect(l.get()).toEqual([3, 2, 1]);
    });

    test("triggers reactive updates", () => {
        const l = list([3, 1, 2]);
        const j = l.join(",");
        expect(j.get()).toBe("3,1,2");
        l.sort();
        expect(j.get()).toBe("1,2,3");
    });

    test("works inside a batch", () => {
        const l = list([3, 1, 2]);
        c.batch(() => {
            l.push(0);
            l.sort();
        });
        expect(l.get()).toEqual([0, 1, 2, 3]);
    });
});

describe("fill", () => {
    test("fills entire array with value", () => {
        const l = list([1, 2, 3]);
        l.fill(0);
        expect(l.get()).toEqual([0, 0, 0]);
    });

    test("fills from start to end", () => {
        const l = list([1, 2, 3, 4]);
        l.fill(0, 1, 3);
        expect(l.get()).toEqual([1, 0, 0, 4]);
    });

    test("triggers reactive updates", () => {
        const l = list([1, 2, 3]);
        const ev = l.every((x) => x === 0);
        expect(ev.get()).toBe(false);
        l.fill(0);
        expect(ev.get()).toBe(true);
    });

    test("works inside a batch", () => {
        const l = list([1, 2, 3]);
        c.batch(() => {
            l.fill(0);
            l.fill(5, 0, 1);
        });
        expect(l.get()).toEqual([5, 0, 0]);
    });
});

describe("copyWithin", () => {
    test("copies within the array", () => {
        const l = list([1, 2, 3, 4, 5]);
        l.copyWithin(0, 3);
        expect(l.get()).toEqual([4, 5, 3, 4, 5]);
    });

    test("copies with end parameter", () => {
        const l = list([1, 2, 3, 4, 5]);
        l.copyWithin(1, 3, 4);
        expect(l.get()).toEqual([1, 4, 3, 4, 5]);
    });

    test("triggers reactive updates", () => {
        const l = list([1, 2, 3, 4]);
        const j = l.join(",");
        expect(j.get()).toBe("1,2,3,4");
        l.copyWithin(0, 2);
        expect(j.get()).toBe("3,4,3,4");
    });

    test("works inside a batch", () => {
        const l = list([1, 2, 3, 4]);
        c.batch(() => {
            l.copyWithin(0, 2);
        });
        expect(l.get()).toEqual([3, 4, 3, 4]);
    });
});
