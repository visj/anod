import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { root, signal, compute, effect, batch } from "./_helper.js";

describe("effect", () => {
    describe("modifies signals", () => {
        it("batches data while executing", () => {
            const s1 = signal(false);
            const s2 = signal(0);
            let v1;
            effect((e) => {
                if (e.read(s1)) {
                    s2.set(1);
                    v1 = s2.val();
                    s1.set(false);
                }
            });
            s1.set(true);
            assert.strictEqual(s2.val(), 1);
            assert.strictEqual(v1, 0);
        });

        it("throws when continually setting a direct dependency", () => {
            const s1 = signal(1);
            assert.throws(() => {
                effect((e) => {
                    e.read(s1);
                    s1.set(s1.val() + 1);
                });
            });
        });

        it("throws when continually setting an indirect dependency", () => {
            const s1 = signal(1);
            const c1 = compute((c) => c.read(s1));
            const c2 = compute((c) => c.read(c1));
            const c3 = compute((c) => c.read(c2));
            assert.throws(() => {
                effect((e) => {
                    e.read(c3);
                    s1.set(s1.val() + 1);
                });
            });
        });

        it("throws on error inside batch", () => {
            const s1 = signal(false);
            const s2 = signal(1);
            effect((e) => {
                if (e.read(s1)) {
                    throw new Error("Intentional Error");
                }
            });
            effect((e) => { e.read(s2); });
            assert.throws(() => {
                batch(() => {
                    s1.set(true);
                    s2.set(2);
                });
            });
            assert.strictEqual(s2.val(), 2);
        });
    });

    it("propagates changes topologically", () => {
        let seq = "";
        const s1 = signal(0);
        const s2 = signal(0);
        const c1 = compute((c) => { seq += "c1"; return c.read(s1); });
        effect((e) => {
            seq += "e1";
            s2.set(e.read(s1));
        });
        const c2 = compute((c) => { seq += "c2"; return c.read(s2); });
        effect((e) => {
            seq += "e2s2{" + e.read(s2) + "}";
            e.read(c1);
        });
        effect((e) => {
            seq += "e3s2{" + e.read(s2) + "}";
            e.read(c2);
        });
        seq = "";
        s1.set(1);
        assert.strictEqual(seq, "c1e2s2{0}e1e3s2{1}c2e2s2{1}");
    });

    describe("cleanup", () => {
        it("is called when effect is updated", () => {
            const s1 = signal(1);
            let count = 0;
            effect((e) => {
                e.read(s1);
                e.cleanup(() => { count++; });
            });
            assert.strictEqual(count, 0);
            s1.set(2);
            assert.strictEqual(count, 1);
        });

        it("can be called from within a subcomputation", () => {
            const s1 = signal(1);
            let calls = 0;
            effect((s) => {
                s.read(s1);
                s.effect((e) => {
                    e.cleanup(() => { calls++; });
                });
            });
            assert.strictEqual(calls, 0);
            s1.set(2);
            assert.strictEqual(calls, 1);
        });

        it("is run only once when a effect scope is disposed", () => {
            const s1 = signal(1);
            let calls = 0;
            const r1 = root((r) => {
                r.effect((e) => {
                    e.read(s1);
                    e.cleanup(() => { calls++; });
                });
                assert.strictEqual(calls, 0);
                s1.set(s1.val() + 1);
                assert.strictEqual(calls, 1);
            });
            r1.dispose();
            assert.strictEqual(calls, 2);
            s1.set(s1.val() + 1);
            assert.strictEqual(calls, 2);
        });
    });
});
