import { describe, test, expect } from "#test-runner";
import { c } from "@fyren/core";
import "../src/list.js";

describe("list", () => {
    test("creates a signal holding an array", () => {
        const l = c.list([1, 2, 3]);
        expect(l.get()).toEqual([1, 2, 3]);
    });

    test("setting a new array replaces the value", () => {
        const l = c.list([1, 2, 3]);
        l.set([4, 5]);
        expect(l.get()).toEqual([4, 5]);
    });

    test("propagates changes to downstream computes", () => {
        const l = c.list([1, 2, 3]);
        let count = 0;
        const comp = c.compute((cx) => {
            count++;
            return cx.val(l);
        });
        expect(comp.get()).toEqual([1, 2, 3]);
        expect(count).toBe(1);

        l.set([4, 5]);
        expect(comp.get()).toEqual([4, 5]);
        expect(count).toBe(2);
    });

    test("works with an empty array", () => {
        const l = c.list([]);
        expect(l.get()).toEqual([]);
    });
});
