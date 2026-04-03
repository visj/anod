import { describe, test, expect } from "bun:test";
import { root, signal, compute, effect, scope, Signal, Compute } from "../";

describe("dispose", () => {
    describe("scope", () => {
        test("disables updates and clears computation's value", () => {
            let count = 0;
            let s1;
            let c1;

            const r1 = root((r) => {
                count = 0;
                s1 = signal(0);
                c1 = compute((c) => {
                    count++;
                    return c.read(s1);
                });

                expect(c1.val()).toBe(0);
                expect(count).toBe(1);

                s1.set(1);
                expect(c1.val()).toBe(1);
                expect(count).toBe(2);
            });

            r1.dispose();
            s1.set(2);

            expect(count).toBe(2); // "Compute should not execute after disposal"
            expect(c1.val()).toBeNull(); // "Disposed compute value should be null"
        });
    });

    describe("computations", () => {
        test("persists through cycle when manually disposed", () => {
            scope((s) => {
                const s1 = signal(0);
                const c1 = compute((c) => c.read(s1));
                let count = 0;

                effect((e) => {
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
                expect(count).toBe(0); // "Disposed node should not contribute to count"
            });
        });
    });
});
