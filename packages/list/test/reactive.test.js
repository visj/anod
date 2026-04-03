import { describe, test, expect } from "bun:test";
import { list } from "../";
import { signal, compute, effect, batch, root } from "@anod/signal";

describe("reactive chaining", () => {
    test("chaining map and filter", () => {
        const l = list([1, 2, 3, 4, 5]);
        const c = l.filter((x) => x > 2).map((x) => x * 10);
        expect(c.val()).toEqual([30, 40, 50]);
        l.set([1, 3, 5]);
        expect(c.val()).toEqual([30, 50]);
    });

    test("chaining filter and reduce", () => {
        const l = list([1, 2, 3, 4]);
        const c = l.filter((x) => x % 2 === 0).reduce((a, b) => a + b, 0);
        expect(c.val()).toBe(6);
        l.set([2, 4, 6]);
        expect(c.val()).toBe(12);
    });

    test("chaining map and join", () => {
        const l = list([1, 2, 3]);
        const c = l.map((x) => x * 2).join(", ");
        expect(c.val()).toBe("2, 4, 6");
    });

    test("chaining slice and map", () => {
        const l = list([1, 2, 3, 4, 5]);
        const c = l.slice(1, 4).map((x) => x * 10);
        expect(c.val()).toEqual([20, 30, 40]);
        l.set([10, 20, 30, 40, 50]);
        expect(c.val()).toEqual([200, 300, 400]);
    });

    test("multiple downstream computes from same list", () => {
        const l = list([1, 2, 3]);
        const sum = l.reduce((a, b) => a + b, 0);
        const count = l.map((x) => x);
        const hasEven = l.some((x) => x % 2 === 0);

        expect(sum.val()).toBe(6);
        expect(count.val()).toEqual([1, 2, 3]);
        expect(hasEven.val()).toBe(true);

        l.set([1, 3, 5]);
        expect(sum.val()).toBe(9);
        expect(count.val()).toEqual([1, 3, 5]);
        expect(hasEven.val()).toBe(false);
    });
});

describe("compute on list", () => {
    test("derived compute reading a list", () => {
        const l = list([1, 2, 3]);
        const c = compute((c) => {
            const arr = c.read(l);
            return arr.length;
        });
        expect(c.val()).toBe(3);
        l.set([1, 2, 3, 4, 5]);
        expect(c.val()).toBe(5);
    });

    test("effect reacts to list changes", () => {
        const l = list([1, 2, 3]);
        let lastLen = 0;
        root(() => {
            effect((c) => {
                lastLen = c.read(l).length;
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
        const c = l.map((x) => { mapCount++; return x; });
        c.val();
        mapCount = 0;

        batch(() => {
            l.push(4);
            l.push(5);
            l.push(6);
        });
        c.val();
        // Should only recompute once after the batch
        expect(l.val()).toEqual([1, 2, 3, 4, 5, 6]);
    });

    test("set inside batch", () => {
        const l = list([1, 2]);
        const c = l.join(",");
        expect(c.val()).toBe("1,2");
        batch(() => {
            l.set([10, 20, 30]);
        });
        expect(c.val()).toBe("10,20,30");
    });

    test("mixed set and mutation in batch", () => {
        const l = list([1]);
        batch(() => {
            l.push(2);
            l.push(3);
        });
        expect(l.val()).toEqual([1, 2, 3]);
    });
});

describe("disposal", () => {
    test("disposed compute stops reacting", () => {
        const l = list([1, 2, 3]);
        const c = l.map((x) => x * 2);
        expect(c.val()).toEqual([2, 4, 6]);
        c.dispose();
        l.set([10, 20]);
        // After dispose, compute should not update
    });

    test("disposed list stops notifying", () => {
        const l = list([1, 2, 3]);
        const c = l.map((x) => x);
        expect(c.val()).toEqual([1, 2, 3]);
        l.dispose();
    });
});
