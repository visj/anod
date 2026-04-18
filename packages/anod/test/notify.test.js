import { describe, test, expect } from "bun:test";
import { root, signal, compute, effect, batch, equal } from "../";

describe("equal()", () => {
    test("equal(true) suppresses notification when value changes", () => {
        const s1 = signal(1);
        let runs = 0;
        const c1 = compute(() => {
            equal(true);
            return s1.val();
        });
        const c2 = compute(() => {
            runs++;
            return c1.val();
        });

        runs = 0;
        s1.set(2);
        expect(c1.val()).toBe(2);
        /** c2 should not have re-run because c1 declared itself equal */
        expect(runs).toBe(0);
    });

    test("equal(false) forces notification when value stays the same", () => {
        const s1 = signal(1);
        let runs = 0;
        const c1 = compute(() => {
            equal(false);
            s1.val();
            return 42;
        });
        const c2 = compute(() => {
            runs++;
            return c1.val();
        });

        expect(c1.val()).toBe(42);
        runs = 0;
        /** Value stays 42, but equal(false) forces notification */
        s1.set(2);
        c2.val();
        expect(runs).toBe(1);
    });

    test("equal(false) forces notification on effects", () => {
        const s1 = signal(1);
        let runs = 0;
        const c1 = compute(() => {
            equal(false);
            s1.val();
            return 42;
        });
        effect(() => {
            runs++;
            c1.val();
        });

        runs = 0;
        s1.set(2);
        expect(runs).toBe(1);
    });

    test("default behavior: no notification when value stays the same", () => {
        const s1 = signal(1);
        let runs = 0;
        const c1 = compute(() => {
            s1.val();
            return 42;
        });
        const c2 = compute(() => {
            runs++;
            return c1.val();
        });

        runs = 0;
        s1.set(2);
        c2.val();
        /** c1 returns 42 both times, so c2 should not re-run */
        expect(runs).toBe(0);
    });

    test("default behavior: notifies when value changes", () => {
        const s1 = signal(1);
        let runs = 0;
        const c1 = compute(() => {
            return s1.val() * 2;
        });
        const c2 = compute(() => {
            runs++;
            return c1.val();
        });

        runs = 0;
        s1.set(2);
        c2.val();
        expect(runs).toBe(1);
        expect(c2.val()).toBe(4);
    });

    test("equal(true) then equal(false) uses last call", () => {
        const s1 = signal(1);
        let runs = 0;
        const c1 = compute(() => {
            equal(true);
            equal(false);
            s1.val();
            return 42;
        });
        const c2 = compute(() => {
            runs++;
            return c1.val();
        });

        runs = 0;
        s1.set(2);
        c2.val();
        /** Last call was equal(false), so c2 should re-run */
        expect(runs).toBe(1);
    });

    test("equal(false) then equal(true) uses last call", () => {
        const s1 = signal(1);
        let runs = 0;
        const c1 = compute(() => {
            equal(false);
            equal(true);
            return s1.val();
        });
        const c2 = compute(() => {
            runs++;
            return c1.val();
        });

        runs = 0;
        s1.set(2);
        c2.val();
        /** Last call was equal(true), so c2 should not re-run */
        expect(runs).toBe(0);
    });

    test("equal() resets between compute runs", () => {
        const s1 = signal(1);
        let forceNotify = false;
        let runs = 0;
        const c1 = compute(() => {
            if (forceNotify) {
                equal(false);
            }
            s1.val();
            return 42;
        });
        const c2 = compute(() => {
            runs++;
            return c1.val();
        });

        runs = 0;
        /** First run: no equal(false), value stays 42 → no notification */
        s1.set(2);
        c2.val();
        expect(runs).toBe(0);

        /** Second run: equal(false) → force notification */
        forceNotify = true;
        runs = 0;
        s1.set(3);
        c2.val();
        expect(runs).toBe(1);

        /** Third run: no equal(false) again → no notification */
        forceNotify = false;
        runs = 0;
        s1.set(4);
        c2.val();
        expect(runs).toBe(0);
    });
});
