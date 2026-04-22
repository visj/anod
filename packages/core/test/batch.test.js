import { describe, test, expect } from "#test-runner";
import { signal, root, batch } from "#fyren";

let c; root((_c) => { c = _c; });

describe("batch", () => {
    test("batches changes until end", () => {
        const s1 = signal(1);
        batch(() => {
            s1.set(2);
            expect(s1.get()).toBe(1);
        });
        expect(s1.get()).toBe(2);
    });

    test("stops propagation within batch scope", () => {
        const s1 = signal(1);
        const c1 = c.compute(c => c.val(s1));

        batch(() => {
            s1.set(2);
            expect(c1.get()).toBe(1);
        });
        expect(c1.get()).toBe(2);
    });
});
