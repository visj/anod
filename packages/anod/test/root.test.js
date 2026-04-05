import { describe, test, expect } from "bun:test";
import { root, signal, compute, effect } from "../";

describe("root", () => {
    test("allows subcomputations to escape their parents via nested scope", () => {
        root((r) => {
            const s1 = signal(0);
            const s2 = signal(0);
            let count = 0;

            r.effect((e) => {
                e.read(s1);
                root((r2) => {
                    r2.effect((e2) => {
                        e2.read(s2);
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
        root((r) => {
            const s1 = signal(1);
            const c1 = r.compute((c) => c.read(s1));

            expect(c1.val()).toBe(1);
            s1.set(2);
            expect(c1.val()).toBe(2);
            s1.set(3);
            expect(c1.val()).toBe(3);
        });
    });
});
