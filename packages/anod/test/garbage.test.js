import { describe, test, expect } from "bun:test";
import { c } from "../";

function collect(callback) {
    // We use a small timeout to allow the event loop to turn
    // and clear any temporary microtask references.
    setTimeout(() => {
        Bun.gc(true); // Call Bun's native GC
        callback();
    }, 10);
}

describe("garbage collection", () => {
    test("should not be collected when referenced", async () => {
        const s1 = c.signal(1);
        const ref = new WeakRef(c.compute(c => c.val(s1)));

        // Bind dependencies to ensure bidirectional link exists.
        ref.deref()?.peek();

        await new Promise((resolve) => {
            collect(() => {
                expect(ref.deref() !== undefined).toBe(true); // "Active compute should remain"
                resolve();
            });
        });
    });

    test("should be collected when disposed", async () => {
        const s1 = c.signal(1);
        const c1 = new WeakRef(c.compute(c => c.val(s1)));

        c1.deref()?.peek();

        // Severing the hard link back to c1.
        s1.dispose();

        await new Promise((resolve) => {
            collect(() => {
                expect(c1.deref()).toBeUndefined(); // "Disposed compute should be GCed"
                resolve();
            });
        });
    });
});
