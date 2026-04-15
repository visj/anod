import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { signal, compute } from "./_helper.js";

describe("signal", () => {
    it("takes and returns an initial value", () => {
        const s1 = signal(1);
        assert.strictEqual(s1.val(), 1);
    });

    it("can be set by passing in a new value", () => {
        const s1 = signal(1);
        s1.set(2);
        assert.strictEqual(s1.val(), 2);
    });

    it("does not propagate if set to equal value", () => {
        const s1 = signal(1);
        let count = 0;
        const c1 = compute((c) => {
            c.read(s1);
            return ++count;
        });
        assert.strictEqual(c1.val(), 1);
        s1.set(1);
        assert.strictEqual(c1.val(), 1);
    });

    it("propagates if set to unequal value", () => {
        const s1 = signal(1);
        let count = 0;
        const c1 = compute((c) => {
            c.read(s1);
            return ++count;
        });
        assert.strictEqual(c1.val(), 1);
        s1.set(2);
        assert.strictEqual(c1.val(), 2);
    });

    describe("val", () => {
        it("returns the value of a signal", () => {
            const s1 = signal(1);
            assert.strictEqual(s1.val(), 1);
        });

        it("does not track a dependency", () => {
            const s1 = signal(1);
            const s2 = signal(2);
            const s3 = signal(3);
            let count = 0;
            const c1 = compute((c) => {
                count++;
                c.read(s1);
                s2.val();
                c.read(s3);
            });
            assert.strictEqual(count, 1);
            s1.set(5);
            c1.val();
            assert.strictEqual(count, 2);
            s2.set(4);
            c1.val();
            assert.strictEqual(count, 2);
            s3.set(6);
            c1.val();
            assert.strictEqual(count, 3);
        });
    });
});
