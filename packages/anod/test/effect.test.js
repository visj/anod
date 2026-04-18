import { describe, test, expect } from "bun:test";
import { root, signal, compute, effect, batch, cleanup } from "../src/core/signal.js";

describe("effect", () => {
    describe("modifies signals", () => {
        test("batches data while executing", () => {
            const s1 = signal(false);
            const s2 = signal(0);
            let v1;

            effect(() => {
                if (s1.val()) {
                    s2.set(1);
                    v1 = s2.val();
                    s1.set(false);
                }
            });

            s1.set(true);
            expect(s2.val()).toBe(1); // "Outer state should update"
            expect(v1).toBe(0); // "Inner state should read previous value until batch ends"
        });

        test("throws when continually setting a direct dependency", () => {
            const s1 = signal(1);
            expect(() => {
                effect(() => {
                    s1.val();
                    s1.set(s1.val() + 1); // Triggers runaway cycle
                });
            }).toThrow(); // "Should throw runaway cycle"
        });

        test("throws when continually setting an indirect dependency", () => {
            const s1 = signal(1);
            const c1 = compute(() => s1.val());
            const c2 = compute(() => c1.val());
            const c3 = compute(() => c2.val());

            expect(() => {
                effect(() => {
                    c3.val();
                    s1.set(s1.val() + 1); // Triggers runaway cycle
                });
            }).toThrow(); // "Should throw runaway cycle through computes"
        });

        test("throws on error inside batch", () => {
            const s1 = signal(false);
            const s2 = signal(1);

            effect(() => {
                if (s1.val()) throw new Error("Intentional Error");
            });
            effect(() => { s2.val(); });

            expect(() => {
                batch(() => {
                    s1.set(true);
                    s2.set(2);
                });
            }).toThrow(); // "Batch should surface the thrown error"

            expect(s2.val()).toBe(2); // "Other mutations in batch should still apply"
        });
    });

    test("propagates changes topologically", () => {
        let seq = "";
        const s1 = signal(0);
        const s2 = signal(0);
        const c1 = compute(() => { seq += "c1"; return s1.val(); });

        effect(() => {
            seq += "e1";
            s2.set(s1.val());
        });

        const c2 = compute(() => { seq += "c2"; return s2.val(); });

        effect(() => {
            seq += "e2s2{" + s2.val() + "}";
            c1.val();
        });

        effect(() => {
            seq += "e3s2{" + s2.val() + "}";
            c2.val();
        });
        seq = "";
        s1.set(1);
        expect(seq).toBe("c1e2s2{0}e1e3s2{1}c2e2s2{1}"); // "Pull: effects pull computes lazily"
    });

    describe("cleanup", () => {
        test("is called when effect is updated", () => {
            const s1 = signal(1);
            let count = 0;

            effect(() => {
                s1.val();
                cleanup(() => { count++; });
            });

            expect(count).toBe(0);
            s1.set(2);
            expect(count).toBe(1); // "Cleanup triggered on update"
        });

        test("can be called from within a subcomputation", () => {
            const s1 = signal(1);
            let calls = 0;

            root(() => {
                effect(() => {
                    s1.val();
                    effect(() => {
                        cleanup(() => { calls++; });
                    });
                });
            });

            expect(calls).toBe(0);
            s1.set(2);
            expect(calls).toBe(1); // "Nested effect cleanup triggered"
        });

        test("is run only once when a scope is disposed", () => {
            const s1 = signal(1);
            let calls = 0;

            const r1 = root((r) => {
                effect(() => {
                    s1.val();
                    cleanup(() => { calls++; });
                });

                expect(calls).toBe(0);
                s1.set(s1.val() + 1);
                expect(calls).toBe(1); // "Update causes 1 cleanup"
            });

            r1.dispose();
            expect(calls).toBe(2); // "Dispose triggers final cleanup"

            s1.set(s1.val() + 1);
            expect(calls).toBe(2); // "Subsequent sets do nothing because node is dead"
        });
    });
});
