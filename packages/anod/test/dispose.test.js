import { describe, test, expect } from "bun:test";
import { c } from "../";

describe("dispose", () => {
    describe("scope", () => {
        test("disables updates and clears computation's value", () => {
            let count = 0;
            let s1;
            let c1;

            const r1 = c.root(r => {
                count = 0;
                s1 = c.signal(0);
                c1 = r.compute(c => {
                    count++;
                    return c.val(s1);
                });

                expect(c1.peek()).toBe(0);
                expect(count).toBe(1);

                s1.set(1);
                expect(c1.peek()).toBe(1);
                expect(count).toBe(2);
            });

            r1.dispose();
            s1.set(2);

            expect(count).toBe(2); // "Compute should not execute after disposal"
            expect(c1.peek()).toBeNull(); // "Disposed compute value should be null"
        });
    });

    describe("computations", () => {
        test("persists through cycle when manually disposed", () => {
            c.root(r => {
                const s1 = c.signal(0);
                const c1 = c.compute(c => c.val(s1));
                let count = 0;

                r.effect(c => {
                    c.effect(c2 => {
                        if (c2.val(s1) > 0) {
                            c1.dispose();
                        }
                    });
                    c.effect(c2 => {
                        count += (c2.val(c1) || 0);
                    });
                });

                s1.set(s1.peek() + 1);
                s1.set(s1.peek() + 1);
                /** e3 runs once before c1 is disposed (adds 1), then
                 *  subsequent cycles skip c1 reads since its dep was cleared
                 *  on dispose. Assertion proves dispose-during-cycle didn't
                 *  crash -- the original scope-based test relied on IDLE=false
                 *  inside scope, which queued sets so the expect fired before
                 *  any effect re-ran. */
                expect(count).toBe(1);
            });
        });
    });
});
