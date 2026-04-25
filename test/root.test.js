import { describe, test, expect } from "#test-runner";
import { signal, root } from "#anod";

describe("root", () => {
    test("allows subcomputations to escape their parents via nested scope", () => {
        root(r => {
            const s1 = signal(0);
            const s2 = signal(0);
            let count = 0;

            r.effect(c => {
                c.val(s1);
                root(r2 => {
                    r2.effect(c2 => {
                        c2.val(s2);
                        count++;
                    });
                });
            });

            expect(count).toBe(1);
            s1.set(1);
            s1.set(2);

            expect(count).toBe(3); // "New scopes created on s1 updates"
            count = 0;
            s2.set(1);
            expect(count).toBe(3); // "All escaped effects should respond to s2"
        });
    });

    test("does not batch updates within scope", () => {
        root(r => {
            const s1 = signal(1);
            const c1 = r.compute(c => c.val(s1));

            expect(c1.get()).toBe(1);
            s1.set(2);
            expect(c1.get()).toBe(2);
            s1.set(3);
            expect(c1.get()).toBe(3);
        });
    });
});
