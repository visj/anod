import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { root, signal, compute, effect, Signal, Compute } from "./_helper.js";

describe("dispose", () => {
    describe("effect scope", () => {
        it("disables updates and clears computation's value", () => {
            let count = 0;
            let s1;
            let c1;
            const r1 = root((r) => {
                count = 0;
                s1 = signal(0);
                c1 = r.compute((c) => {
                    count++;
                    return c.read(s1);
                });
                assert.strictEqual(c1.val(), 0);
                assert.strictEqual(count, 1);
                s1.set(1);
                assert.strictEqual(c1.val(), 1);
                assert.strictEqual(count, 2);
            });
            r1.dispose();
            s1.set(2);
            assert.strictEqual(count, 2);
            assert.strictEqual(c1.val(), null);
        });
    });

    describe("computations", () => {
        it("persists through cycle when manually disposed", () => {
            effect((s) => {
                const s1 = signal(0);
                const c1 = s.compute((c) => c.read(s1));
                let count = 0;
                s.effect((e) => {
                    effect((e2) => {
                        if (e2.read(s1) > 0) {
                            c1.dispose();
                        }
                    });
                    effect((e3) => {
                        count += (e3.read(c1) || 0);
                    });
                });
                s1.set(s1.val() + 1);
                s1.set(s1.val() + 1);
                assert.strictEqual(count, 0);
            });
        });
    });
});
