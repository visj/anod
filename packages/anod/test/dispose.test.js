import { describe, test, expect } from "bun:test";
import { root, signal, compute, effect, scope, Signal, Compute } from "../";

describe("dispose", () => {
    describe("scope", () => {
        test("disables updates and clears computation's value", () => {
            let count = 0;
            let s1;
            let c1;

            const r1 = root(() => {
                count = 0;
                s1 = signal(0);
                c1 = compute(() => {
                    count++;
                    return s1.val();
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
            scope(() => {
                const s1 = signal(0);
                const c1 = compute(() => s1.val());
                let count = 0;

                effect(() => {
                    effect(() => {
                        if (s1.val() > 0) {
                            c1.dispose();
                        }
                    });
                    effect(() => {
                        count += (c1.val() || 0);
                    });
                });

                s1.set(s1.val() + 1);
                s1.set(s1.val() + 1);
                expect(count).toBe(0); // "Disposed node should not contribute to count"
            });
        });
    });
});
