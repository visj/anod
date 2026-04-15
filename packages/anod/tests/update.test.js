import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { root, signal, compute, effect } from "./_helper.js";

describe("update", () => {
    it("does not register a dependency on the subcomputation", () => {
        root((r) => {
            const s1 = signal(1);
            let outerCount = 0;
            let innerCount = 0;
            r.effect((s) => {
                outerCount++;
                s.effect((e) => {
                    innerCount++;
                    e.read(s1);
                });
            });
            outerCount = innerCount = 0;
            s1.set(2);
            assert.strictEqual(innerCount, 1);
            assert.strictEqual(outerCount, 0);
        });
    });

    describe("may update", () => {
        it("does not trigger downstream computations unless changed", () => {
            const s1 = signal(1);
            let order = "";
            const c1 = compute((c) => {
                order += "c1";
                return c.read(s1) > 0;
            });
            const c2 = compute((c) => {
                order += "c2";
                return c.read(c1);
            });
            order = "";
            s1.set(2);
            c2.val();
            assert.strictEqual(order, "c1");
            order = "";
            s1.set(-1);
            c2.val();
            assert.strictEqual(order, "c1c2");
        });

        it("updates downstream pending nodes", () => {
            const s1 = signal(0);
            const s2 = signal(0);
            let order = "";
            const c1 = compute((c) => {
                order += "c1";
                return c.read(s1) === 0;
            });
            effect((s) => {
                s.read(c1);
                order += "e1";
                s.effect((e) => {
                    order += "e2";
                    e.read(s2);
                    e.cleanup(() => { order += "cl1"; });
                });
            });
            order = "";
            s1.set(1);
            assert.strictEqual(order, "c1cl1e1e2");
        });
    });
});
