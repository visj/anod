import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { root, signal, compute, effect } from "./_helper.js";

describe("root", () => {
    it("allows subcomputations to escape their parents via nested scope", () => {
        root((r) => {
            const s1 = signal(0);
            const s2 = signal(0);
            let count = 0;
            r.effect((e) => {
                e.read(s1);
                root((r2) => {
                    r2.effect((e2) => {
                        e2.read(s2);
                        count++;
                    });
                });
            });
            assert.strictEqual(count, 1);
            s1.set(1);
            s1.set(2);
            assert.strictEqual(count, 3);
            count = 0;
            s2.set(1);
            assert.strictEqual(count, 3);
        });
    });

    it("does not batch updates within scope", () => {
        root((r) => {
            const s1 = signal(1);
            const c1 = r.compute((c) => c.read(s1));
            assert.strictEqual(c1.val(), 1);
            s1.set(2);
            assert.strictEqual(c1.val(), 2);
            s1.set(3);
            assert.strictEqual(c1.val(), 3);
        });
    });
});
