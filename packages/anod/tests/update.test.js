import { describe, test, expect } from "bun:test";
import { root, signal, compute, effect } from "../";

describe("update", () => {
    test("does not register a dependency on the subcomputation", () => {
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

            expect(innerCount).toBe(1); // "Inner effect should re-run"
            expect(outerCount).toBe(0); // "Outer effect should not re-run"
        });
    });

    describe("may update", () => {
        test("does not trigger downstream computations unless changed", () => {
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
            expect(order).toBe("c1"); // "c1 runs, but c2 should be skipped as value is same"

            order = "";
            s1.set(-1);
            c2.val();
            expect(order).toBe("c1c2"); // "c2 runs because value changed"
        });

        test("updates downstream pending nodes", () => {
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
            expect(order).toBe("c1cl1e1e2"); // "c1 pulled by effect, cleanup runs, then re-execution"
        });
    });
});
