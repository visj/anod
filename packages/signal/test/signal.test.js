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

        const c1 = compute((c) => {
            c.read(s1);
            return ++count;
        });

        expect(c1.val()).toBe(1);
        s1.set(1);
        expect(c1.val()).toBe(1); // "Compute count should remain 1"
    });

    test("propagates if set to unequal value", () => {
        const s1 = signal(1);
        let count = 0;

        const c1 = compute((c) => {
            c.read(s1);
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

        test("does not track a dependency", () => {
            const s1 = signal(1);
            const s2 = signal(2);
            const s3 = signal(3);
            let count = 0;

            const c1 = compute((c) => {
                count++;
                c.read(s1);
                s2.val(); // Should not track
                c.read(s3);
            });

            c1.val();
            expect(count).toBe(1); // "Initial execution"

            s1.set(5);
            expect(count).toBe(2); // "Propagates on s1 change"

            s2.set(4);
            expect(count).toBe(2); // "Does not propagate on s2 (peek) change"

            s3.set(6);
            expect(count).toBe(3); // "Propagates on s3 change"
        });
    });
});