import { describe, test, expect } from "bun:test";
import { root, signal, compute, effect, cleanup } from "../";

describe("update", () => {
    test("does not register a dependency on the subcomputation", () => {
        root(() => {
            const s1 = signal(1);
            let outerCount = 0;
            let innerCount = 0;

            effect(() => {
                outerCount++;
                effect(() => {
                    innerCount++;
                    s1.val();
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
            const c1 = compute(() => {
                order += "c1";
                return s1.val() > 0;
            });
            const c2 = compute(() => {
                order += "c2";
                return c1.val();
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

            const c1 = compute(() => {
                order += "c1";
                return s1.val() === 0;
            });

            root(() => {
                effect(() => {
                    c1.val();
                    order += "e1";
                    effect(() => {
                        order += "e2";
                        s2.val();
                        cleanup(() => { order += "cl1"; });
                    });
                });
            });

            order = "";
            s1.set(1);
            expect(order).toBe("c1cl1e1e2"); // "c1 pulled by scope, cleanup runs, then re-execution"
        });
    });
});
