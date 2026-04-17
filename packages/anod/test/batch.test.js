import { describe, test, expect } from "bun:test";
import { signal, compute, batch } from "../";

describe("batch", () => {
    test("batches changes until end", () => {
        const s1 = signal(1);
        batch(() => {
            s1.set(2);
            expect(s1.val()).toBe(1);
        });
        expect(s1.val()).toBe(2);
    });

    test("stops propagation within batch scope", () => {
        const s1 = signal(1);
        const c1 = compute(() => s1.val());

        batch(() => {
            s1.set(2);
            expect(c1.val()).toBe(1);
        });
        expect(c1.val()).toBe(2);
    });
});