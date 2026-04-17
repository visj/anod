import { describe, test, expect } from "bun:test";
import { root, signal, compute, effect } from "../src/index.js";

describe("root", () => {
    test("allows subcomputations to escape their parents via nested scope", () => {
        root(() => {
            const s1 = signal(0);
            const s2 = signal(0);
            let count = 0;

            effect(() => {
                s1.val();
                root(() => {
                    effect(() => {
                        s2.val();
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
        root(() => {
            const s1 = signal(1);
            const c1 = compute(() => s1.val());

            expect(c1.val()).toBe(1);
            s1.set(2);
            expect(c1.val()).toBe(2);
            s1.set(3);
            expect(c1.val()).toBe(3);
        });
    });
});
