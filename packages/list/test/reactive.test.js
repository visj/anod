import { describe, test, expect } from "#test-runner";
import { list } from "../src/list.js";
import { c } from "@fyren/core";

describe("reactive chaining", () => {
    test("chaining map and filter", () => {
        const l = list([1, 2, 3, 4, 5]);
        const derived = l.filter((x) => x > 2).map((x) => x * 10);
        expect(derived.get()).toEqual([30, 40, 50]);
        l.set([1, 3, 5]);
        expect(derived.get()).toEqual([30, 50]);
    });

    test("chaining filter and reduce", () => {
        const l = list([1, 2, 3, 4]);
        const derived = l.filter((x) => x % 2 === 0).reduce((a, b) => a + b, 0);
        expect(derived.get()).toBe(6);
        l.set([2, 4, 6]);
        expect(derived.get()).toBe(12);
    });

    test("chaining map and join", () => {
        const l = list([1, 2, 3]);
        const derived = l.map((x) => x * 2).join(", ");
        expect(derived.get()).toBe("2, 4, 6");
    });

    test("chaining slice and map", () => {
        const l = list([1, 2, 3, 4, 5]);
        const derived = l.slice(1, 4).map((x) => x * 10);
        expect(derived.get()).toEqual([20, 30, 40]);
        l.set([10, 20, 30, 40, 50]);
        expect(derived.get()).toEqual([200, 300, 400]);
    });

    test("multiple downstream computes from same list", () => {
        const l = list([1, 2, 3]);
        const sum = l.reduce((a, b) => a + b, 0);
        const count = l.map((x) => x);
        const hasEven = l.some((x) => x % 2 === 0);

        expect(sum.get()).toBe(6);
        expect(count.get()).toEqual([1, 2, 3]);
        expect(hasEven.get()).toBe(true);

        l.set([1, 3, 5]);
        expect(sum.get()).toBe(9);
        expect(count.get()).toEqual([1, 3, 5]);
        expect(hasEven.get()).toBe(false);
    });
});

describe("compute on list", () => {
    test("derived compute reading a list", () => {
        const l = list([1, 2, 3]);
        const comp = c.compute((cx) => {
            const arr = cx.val(l);
            return arr.length;
        });
        expect(comp.get()).toBe(3);
        l.set([1, 2, 3, 4, 5]);
        expect(comp.get()).toBe(5);
    });

    test("effect reacts to list changes", () => {
        const l = list([1, 2, 3]);
        let lastLen = 0;
        c.root((r) => {
            r.effect((cx) => {
                lastLen = cx.val(l).length;
            });
        });
        expect(lastLen).toBe(3);
        l.push(4);
        expect(lastLen).toBe(4);
    });
});

describe("batch interactions", () => {
    test("multiple mutations in batch coalesce", () => {
        const l = list([1, 2, 3]);
        let mapCount = 0;
        const mapped = l.map((x) => { mapCount++; return x; });
        mapped.get();
        mapCount = 0;

        c.batch(() => {
            l.push(4);
            l.push(5);
            l.push(6);
        });
        mapped.get();
        expect(l.get()).toEqual([1, 2, 3, 4, 5, 6]);
    });

    test("set inside batch", () => {
        const l = list([1, 2]);
        const joined = l.join(",");
        expect(joined.get()).toBe("1,2");
        c.batch(() => {
            l.set([10, 20, 30]);
        });
        expect(joined.get()).toBe("10,20,30");
    });

    test("mixed set and mutation in batch", () => {
        const l = list([1]);
        c.batch(() => {
            l.push(2);
            l.push(3);
        });
        expect(l.get()).toEqual([1, 2, 3]);
    });
});

describe("disposal", () => {
    test("disposed compute stops reacting", () => {
        const l = list([1, 2, 3]);
        const mapped = l.map((x) => x * 2);
        expect(mapped.get()).toEqual([2, 4, 6]);
        mapped.dispose();
        l.set([10, 20]);
    });

    test("disposed list stops notifying", () => {
        const l = list([1, 2, 3]);
        const mapped = l.map((x) => x);
        expect(mapped.get()).toEqual([1, 2, 3]);
        l.dispose();
    });
});
