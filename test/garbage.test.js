import { describe, test, expect, collect, expectCollected } from "#test-runner";
import { signal, root } from "#anod";

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

        // Disposing c1 unlinks it from s1, which then holds no reference to it.
        r.dispose();

        /** Polls, like the other GC tests: one pass under Bun's conservative
         *  stack scan can still see a stale pointer, depending on what ran
         *  before. A real leak fails either way. */
        await expectCollected([c1]);
    });
});
