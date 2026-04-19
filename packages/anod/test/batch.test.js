import { describe, test, expect } from "bun:test";
import { c } from "../";

describe("batch", () => {
    test("batches changes until end", () => {
        const s1 = c.signal(1);
        c.batch(() => {
            s1.set(2);
            expect(s1.peek()).toBe(1);
        });
        expect(s1.peek()).toBe(2);
    });

    test("stops propagation within batch scope", () => {
        const s1 = c.signal(1);
        const c1 = c.compute(c => c.val(s1));

        c.batch(() => {
            s1.set(2);
            expect(c1.peek()).toBe(1);
        });
        expect(c1.peek()).toBe(2);
    });
});
