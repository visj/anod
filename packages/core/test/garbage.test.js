import { describe, test, expect, collect } from "#test-runner";
import { signal, root } from "#fyren";

describe("garbage collection", () => {
    test("should not be collected when referenced", async () => {
        const s1 = signal(1);
        let ref;
        root((_c) => {
            ref = new WeakRef(_c.compute(c => c.val(s1)));
        });

        // Bind dependencies to ensure bidirectional link exists.
        ref.deref()?.get();

        await new Promise((resolve) => {
            collect(() => {
                expect(ref.deref() !== undefined).toBe(true); // "Active compute should remain"
                resolve();
            });
        });
    });

    test("should be collected when disposed", async () => {
        const s1 = signal(1);
        let c1;
        const r = root((_c) => {
            c1 = new WeakRef(_c.compute(c => c.val(s1)));
        });

        c1.deref()?.get();

        // Severing the hard link back to c1.
        s1.dispose();
        r.dispose();

        await new Promise((resolve) => {
            collect(() => {
                expect(c1.deref()).toBeUndefined(); // "Disposed compute should be GCed"
                resolve();
            });
        });
    });
});
