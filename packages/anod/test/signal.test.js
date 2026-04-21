import { describe, test, expect } from "#test-runner";
import { c } from "#anod";

describe("signal", () => {
    test("takes and returns an initial value", () => {
        const s1 = c.signal(1);
        expect(s1.peek()).toBe(1); // "Initial value should match"
    });

    test("can be set by passing in a new value", () => {
        const s1 = c.signal(1);
        s1.set(2);
        expect(s1.peek()).toBe(2); // "Value should update"
    });

    test("does not propagate if set to equal value", () => {
        const s1 = c.signal(1);
        let count = 0;

        const c1 = c.compute(c => {
            c.val(s1);
            return ++count;
        });

        expect(c1.peek()).toBe(1);
        s1.set(1);
        expect(c1.peek()).toBe(1); // "Compute count should remain 1"
    });

    test("propagates if set to unequal value", () => {
        const s1 = c.signal(1);
        let count = 0;

        const c1 = c.compute(c => {
            c.val(s1);
            return ++count;
        });

        expect(c1.peek()).toBe(1);
        s1.set(2);
        expect(c1.peek()).toBe(2); // "Compute count should increment"
    });

    describe("val", () => {
        test("returns the value of a signal", () => {
            const s1 = c.signal(1);
            expect(s1.peek()).toBe(1); // "val should return current value"
        });

        test("tracks all val() calls as dependencies", () => {
            const s1 = c.signal(1);
            const s2 = c.signal(2);
            const s3 = c.signal(3);
            let count = 0;

            const c1 = c.compute(c => {
                count++;
                c.val(s1);
                c.val(s2);
                c.val(s3);
            });

            expect(count).toBe(1, "initial"); // "Initial execution"

            s1.set(5);
            c1.peek();
            expect(count).toBe(2, "s1"); // "Propagates on s1 change"

            s2.set(4);
            c1.peek();
            expect(count).toBe(3, "s2"); // "Propagates on s2 change"

            s3.set(6);
            c1.peek();
            expect(count).toBe(4, "s3"); // "Propagates on s3 change"
        });
    });
});
