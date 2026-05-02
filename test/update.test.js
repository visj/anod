import { describe, test, expect } from "#test-runner";
import { signal, root, c } from "#anod";

describe("update", () => {
    test("does not register a dependency on the subcomputation", () => {
        root(r => {
            const s1 = signal(1);
            let outerCount = 0;
            let innerCount = 0;

            r.effect(c => {
                outerCount++;
                c.effect(c2 => {
                    innerCount++;
                    c2.val(s1);
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
            const c1 = c.compute(c => {
                order += "c1";
                return c.val(s1) > 0;
            });
            const c2 = c.compute(c => {
                order += "c2";
                return c.val(c1);
            });

            order = "";
            s1.set(2);
            c2.get();
            expect(order).toBe("c1"); // "c1 runs, but c2 should be skipped as value is same"

            order = "";
            s1.set(-1);
            c2.get();
            expect(order).toBe("c1c2"); // "c2 runs because value changed"
        });

        test("updates downstream pending nodes", () => {
            const s1 = signal(0);
            const s2 = signal(0);
            let order = "";

            const c1 = c.compute(c => {
                order += "c1";
                return c.val(s1) === 0;
            });

            root(r => {
                r.effect(c => {
                    c.val(c1);
                    order += "e1";
                    c.effect(c2 => {
                        order += "e2";
                        c2.val(s2);
                        c2.cleanup(() => { order += "cl1"; });
                    });
                });
            });

            order = "";
            s1.set(1);
            expect(order).toBe("c1cl1e1e2"); // "c1 pulled by scope, cleanup runs, then re-execution"
        });
    });
});
