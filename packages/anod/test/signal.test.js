import { describe, test, expect } from "bun:test";
import { signal, compute } from "../";

describe("signal", () => {
    test("takes and returns an initial value", () => {
        const s1 = signal(1);
        expect(s1.val()).toBe(1); // "Initial value should match"
    });

    test("can be set by passing in a new value", () => {
        const s1 = signal(1);
        s1.set(2);
        expect(s1.val()).toBe(2); // "Value should update"
    });

    test("does not propagate if set to equal value", () => {
        const s1 = signal(1);
        let count = 0;

        const c1 = compute(() => {
            s1.val();
            return ++count;
        });

        expect(c1.val()).toBe(1);
        s1.set(1);
        expect(c1.val()).toBe(1); // "Compute count should remain 1"
    });

    test("propagates if set to unequal value", () => {
        const s1 = signal(1);
        let count = 0;

        const c1 = compute(() => {
            s1.val();
            return ++count;
        });

        expect(c1.val()).toBe(1);
        s1.set(2);
        expect(c1.val()).toBe(2); // "Compute count should increment"
    });

    describe("val", () => {
        test("returns the value of a signal", () => {
            const s1 = signal(1);
            expect(s1.val()).toBe(1); // "val should return current value"
        });

        test("tracks every val() call inside a compute", () => {
            const s1 = signal(1);
            const s2 = signal(2);
            const s3 = signal(3);
            let count = 0;

            const c1 = compute(() => {
                count++;
                s1.val();
                s2.val();
                s3.val();
            });

            expect(count).toBe(1); // initial run

            s1.set(5);
            c1.val();
            expect(count).toBe(2); // s1 change propagates

            s2.set(4);
            c1.val();
            expect(count).toBe(3); // s2 change now also propagates

            s3.set(6);
            c1.val();
            expect(count).toBe(4); // s3 change propagates
        });
    });
});
