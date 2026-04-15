import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { signal, compute, batch } from "./_helper.js";

describe("batch", () => {
    it("batches changes until end", () => {
        const s1 = signal(1);
        batch(() => {
            s1.set(2);
            assert.strictEqual(s1.val(), 1);
        });
        assert.strictEqual(s1.val(), 2);
    });

    it("stops propagation within batch scope", () => {
        const s1 = signal(1);
        const c1 = compute((c) => c.read(s1));
        batch(() => {
            s1.set(2);
            assert.strictEqual(c1.val(), 1);
        });
        assert.strictEqual(c1.val(), 2);
    });
});
