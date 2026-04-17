import { describe, test, expect } from "bun:test";
import { signal, compute, Signal, Compute } from "../";

describe("compute", () => {
    test("returns initial value of wrapped function", () => {
        const c1 = compute(() => 1);
        expect(c1.val()).toBe(1); // "Should compute initial value"
    });

    test("does not re-occur when read multiple times", () => {
        let count = 0;
        const c1 = compute(() => { count++; });

        c1.val();
        c1.val();
        c1.val();
        expect(count).toBe(1);
    });

    describe("with a dependency on signal", () => {
        test("updates when data is set", () => {
            const s1 = signal(1);
            let count = 0;
            const c1 = compute(() => {
                count++;
                return s1.val();
            });

            s1.set(2);
            expect(c1.val()).toBe(2);
            expect(count).toBe(2);
        });

        test("does not update when data is merely read", () => {
            const s1 = signal(1);
            let count = 0;
            compute(() => {
                count++;
                return s1.val();
            });

            s1.val();
            expect(count).toBe(1);
        });
    });

    describe("with changing dependencies", () => {
        const s1 = signal(true);
        const s2 = signal(1);
        const s3 = signal(2);
        let count = 0;

        const c1 = compute(() => {
            count++;
            return s1.val() ? s2.val() : s3.val();
        });

        c1.val();
        count = 0;

        test("updates on active dependencies", () => {
            s2.set(5);
            expect(c1.val()).toBe(5);
            expect(count).toBe(1);
            count = 0;
        });

        test("does not update on inactive dependencies", () => {
            s3.set(5);
            expect(count).toBe(0);
            expect(c1.val()).toBe(5);
        });

        test("deactivates obsolete dependencies", () => {
            s1.set(false);
            count = 0;
            s2.set(6);
            expect(count).toBe(0);
        });

        test("activates new dependencies", () => {
            s3.set(7);
            expect(c1.val()).toBe(7);
            expect(count).toBe(1);
        });
    });

    test("does not register dependency when creating signals inside compute", () => {
        let s1;
        let count = 0;

        const c1 = compute(() => {
            count++;
            s1 = signal(1);
        });

        c1.val();
        count = 0;
        s1.set(2);

        c1.val();
        expect(count).toBe(0);
    });

    test("returns undefined from void function", () => {
        const c1 = compute(() => {});
        expect(c1.val()).toBeUndefined();
    });

    describe("with a dependency on a computation", () => {
        const s1 = signal(1);
        let countOne = 0;
        let countTwo = 0;

        const c1 = compute(() => {
            countOne++;
            return s1.val();
        });

        const c2 = compute(() => {
            countTwo++;
            return c1.val();
        });

        test("does not cause re-evaluation prematurely", () => {
            c2.val();
            expect(countOne).toBe(1);
        });

        test("occurs when computation updates", () => {
            s1.set(2);
            expect(c2.val()).toBe(2);
            expect(countOne).toBe(2);
            expect(countTwo).toBe(2);
        });
    });

    describe("with circular dependencies", () => {
        test("throws when cycle created by modifying a branch", () => {
            const s1 = signal(1);
            var c1 = compute(() => s1.val() > 1 ? c1.val() : s1.val());
            c1.val();
            expect(() => {
                s1.set(2);
                c1.val();
            }).toThrow(); // "Should throw circular dependency error"
        });
    });

    describe("with converging dependencies", () => {
        test("propagates in topological order", () => {
            let order = "";
            const s1 = signal(0);

            const c1 = compute(() => { order += "c1"; return s1.val(); });
            const c2 = compute(() => { order += "c2"; return s1.val(); });
            const c3 = compute(() => { c1.val(); c2.val(); order += "c3"; });

            order = "";
            s1.set(1);
            c3.val();
            expect(order).toBe("c1c2c3"); // "Should execute strictly left-to-right topological order"
        });

        test("only propagates once with linear convergences", () => {
            const s1 = signal(0);
            const c1 = compute(() => s1.val());
            const c2 = compute(() => s1.val());
            const c3 = compute(() => s1.val());
            const c4 = compute(() => s1.val());
            const c5 = compute(() => s1.val());

            let count = 0;
            const c6 = compute(() => {
                count++;
                return (c1.val()) + (c2.val()) + (c3.val()) + (c4.val()) + (c5.val());
            });

            count = 0;
            s1.set(1);
            c6.val();
            expect(count).toBe(1); // "Converging nodes should only trigger the sink once"
        });
    });
});