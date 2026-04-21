import { describe, test, expect } from "#test-runner";
import { c } from "#anod";

describe("effect", () => {
    describe("modifies signals", () => {
        test("batches data while executing", () => {
            const s1 = c.signal(false);
            const s2 = c.signal(0);
            let v1;

            c.effect(c => {
                if (c.val(s1)) {
                    s2.set(1);
                    v1 = s2.peek();
                    s1.set(false);
                }
            });

            s1.set(true);
            expect(s2.peek()).toBe(1); // "Outer state should update"
            expect(v1).toBe(0); // "Inner state should read previous value until batch ends"
        });

        test("throws when continually setting a direct dependency", () => {
            const s1 = c.signal(1);
            expect(() => {
                c.effect(c => {
                    c.val(s1);
                    s1.set(s1.peek() + 1); // Triggers runaway cycle
                });
            }).toThrow(); // "Should throw runaway cycle"
        });

        test("throws when continually setting an indirect dependency", () => {
            const s1 = c.signal(1);
            const c1 = c.compute(c => c.val(s1));
            const c2 = c.compute(c => c.val(c1));
            const c3 = c.compute(c => c.val(c2));

            expect(() => {
                c.effect(c => {
                    c.val(c3);
                    s1.set(s1.peek() + 1); // Triggers runaway cycle
                });
            }).toThrow(); // "Should throw runaway cycle through computes"
        });

        test("throws on error inside batch", () => {
            const s1 = c.signal(false);
            const s2 = c.signal(1);

            c.effect(c => {
                if (c.val(s1)) {
                    throw new Error("Intentional Error");
                }
            });
            c.effect(c => { c.val(s2); });

            expect(() => {
                c.batch(() => {
                    s1.set(true);
                    s2.set(2);
                });
            }).toThrow(); // "Batch should surface the thrown error"

            expect(s2.peek()).toBe(2); // "Other mutations in batch should still apply"
        });
    });

    test("propagates changes topologically", () => {
        let seq = "";
        const s1 = c.signal(0);
        const s2 = c.signal(0);
        const c1 = c.compute(c => { seq += "c1"; return c.val(s1); });

        c.effect(c => {
            seq += "e1";
            s2.set(c.val(s1));
        });

        const c2 = c.compute(c => { seq += "c2"; return c.val(s2); });

        c.effect(c => {
            seq += "e2s2{" + c.val(s2) + "}";
            c.val(c1);
        });

        c.effect(c => {
            seq += "e3s2{" + c.val(s2) + "}";
            c.val(c2);
        });
        seq = "";
        s1.set(1);
        expect(seq).toBe("c1e2s2{0}e1e3s2{1}c2e2s2{1}"); // "Pull: effects pull computes lazily"
    });

    describe("cleanup", () => {
        test("is called when effect is updated", () => {
            const s1 = c.signal(1);
            let count = 0;

            c.effect(c => {
                c.val(s1);
                c.cleanup(() => { count++; });
            });

            expect(count).toBe(0);
            s1.set(2);
            expect(count).toBe(1); // "Cleanup triggered on update"
        });

        test("can be called from within a subcomputation", () => {
            const s1 = c.signal(1);
            let calls = 0;

            c.root(r => {
                r.effect(c => {
                    c.val(s1);
                    c.effect(c2 => {
                        c2.cleanup(() => { calls++; });
                    });
                });
            });

            expect(calls).toBe(0);
            s1.set(2);
            expect(calls).toBe(1); // "Nested effect cleanup triggered"
        });

        test("is run only once when a scope is disposed", () => {
            const s1 = c.signal(1);
            let calls = 0;

            const r1 = c.root(r => {
                r.effect(c => {
                    c.val(s1);
                    c.cleanup(() => { calls++; });
                });

                expect(calls).toBe(0);
                s1.set(s1.peek() + 1);
                expect(calls).toBe(1); // "Update causes 1 cleanup"
            });

            r1.dispose();
            expect(calls).toBe(2); // "Dispose triggers final cleanup"

            s1.set(s1.peek() + 1);
            expect(calls).toBe(2); // "Subsequent sets do nothing because node is dead"
        });
    });
});
