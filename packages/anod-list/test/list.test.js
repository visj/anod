import { describe, test, expect } from "bun:test";
import { list } from "..";
import { signal, compute, effect, batch, root } from "anod";

describe("list", () => {
    test("creates a signal holding an array", () => {
        const l = list([1, 2, 3]);
        expect(l.val()).toEqual([1, 2, 3]);
    });

    test("setting a new array replaces the value", () => {
        const l = list([1, 2, 3]);
        l.set([4, 5]);
        expect(l.val()).toEqual([4, 5]);
    });

    test("propagates changes to downstream computes", () => {
        const l = list([1, 2, 3]);
        let count = 0;
        const c = compute((c) => {
            count++;
            return c.read(l);
        });
        expect(c.val()).toEqual([1, 2, 3]);
        expect(count).toBe(1);

        l.set([4, 5]);
        expect(c.val()).toEqual([4, 5]);
        expect(count).toBe(2);
    });

    test("works with an empty array", () => {
        const l = list([]);
        expect(l.val()).toEqual([]);
    });
});
