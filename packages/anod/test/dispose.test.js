import { describe, test, expect } from "bun:test";
import { root, signal, compute, effect, Signal, Compute } from "../";

describe("dispose", () => {
    describe("scope", () => {
        test("disables updates and clears computation's value", () => {
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
            root((r) => {
                const s1 = signal(0);
                const c1 = r.compute((c) => c.read(s1));
                let count = 0;

                r.effect((e) => {
                    e.effect((e2) => {
                        if (e2.read(s1) > 0) {
                            c1.dispose();
                        }
                    });
                    e.effect((e3) => {
                        count += (e3.read(c1) || 0);
                    });
                });

                s1.set(s1.val() + 1);
                s1.set(s1.val() + 1);
                /** e3 runs once before c1 is disposed (adds 1), then
                 *  subsequent cycles skip c1 reads since its dep was cleared
                 *  on dispose. Assertion proves dispose-during-cycle didn't
                 *  crash — the original scope-based test relied on IDLE=false
                 *  inside scope, which queued sets so the expect fired before
                 *  any effect re-ran. */
                expect(count).toBe(1);
            });
        });
    });
});
