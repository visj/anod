import { describe, test, expect } from "#test-runner";
import { signal, root, batch } from "#anod";

let c; root((_c) => { c = _c; });

describe("compute", () => {
    test("returns initial value of wrapped function", () => {
        const c1 = c.compute(() => 1);
        expect(c1.get()).toBe(1); // "Should compute initial value"
    });

    test("does not re-occur when read multiple times", () => {
        let count = 0;
        const c1 = c.compute(() => { count++; });

        c1.get();
        c1.get();
        c1.get();
        expect(count).toBe(1);
    });

    describe("with a dependency on signal", () => {
        test("updates when data is set", () => {
            const s1 = signal(1);
            let count = 0;
            const c1 = c.compute(c => {
                count++;
                return c.val(s1);
            });

            s1.set(2);
            expect(c1.get()).toBe(2);
            expect(count).toBe(2);
        });

        test("does not update when data is merely read", () => {
            const s1 = signal(1);
            let count = 0;
            c.compute(c => {
                count++;
                return c.val(s1);
            });

            s1.get();
            expect(count).toBe(1);
        });
    });

    describe("with changing dependencies", () => {
        const s1 = signal(true);
        const s2 = signal(1);
        const s3 = signal(2);
        let count = 0;

        const c1 = c.compute(c => {
            count++;
            return c.val(s1) ? c.val(s2) : c.val(s3);
        });

        c1.get();
        count = 0;

        test("updates on active dependencies", () => {
            s2.set(5);
            expect(c1.get()).toBe(5);
            expect(count).toBe(1);
            count = 0;
        });

        test("does not update on inactive dependencies", () => {
            s3.set(5);
            expect(count).toBe(0);
            expect(c1.get()).toBe(5);
        });

        test("deactivates obsolete dependencies", () => {
            s1.set(false);
            count = 0;
            s2.set(6);
            expect(count).toBe(0);
        });

        test("activates new dependencies", () => {
            s3.set(7);
            expect(c1.get()).toBe(7);
            expect(count).toBe(1);
        });
    });

    test("does not register dependency when creating signals inside compute", () => {
        let s1;
        let count = 0;

        const c1 = c.compute(() => {
            count++;
            s1 = signal(1);
        });

        c1.get();
        count = 0;
        s1.set(2);

        c1.get();
        expect(count).toBe(0);
    });

    test("returns undefined from void function", () => {
        const c1 = c.compute(() => {});
        expect(c1.get()).toBeUndefined();
    });

    describe("with a dependency on a computation", () => {
        const s1 = signal(1);
        let countOne = 0;
        let countTwo = 0;

        const c1 = c.compute(c => {
            countOne++;
            return c.val(s1);
        });

        const c2 = c.compute(c => {
            countTwo++;
            return c.val(c1);
        });

        test("does not cause re-evaluation prematurely", () => {
            c2.get();
            expect(countOne).toBe(1);
        });

        test("occurs when computation updates", () => {
            s1.set(2);
            expect(c2.get()).toBe(2);
            expect(countOne).toBe(2);
            expect(countTwo).toBe(2);
        });
    });

    describe("with converging dependencies", () => {
        test("propagates in topological order", () => {
            let order = "";
            const s1 = signal(0);

            const c1 = c.compute(c => { order += "c1"; return c.val(s1); });
            const c2 = c.compute(c => { order += "c2"; return c.val(s1); });
            const c3 = c.compute(c => { c.val(c1); c.val(c2); order += "c3"; });

            order = "";
            s1.set(1);
            c3.get();
            expect(order).toBe("c1c2c3"); // "Should execute strictly left-to-right topological order"
        });

        test("only propagates once with linear convergences", () => {
            const s1 = signal(0);
            const c1 = c.compute(c => c.val(s1));
            const c2 = c.compute(c => c.val(s1));
            const c3 = c.compute(c => c.val(s1));
            const c4 = c.compute(c => c.val(s1));
            const c5 = c.compute(c => c.val(s1));

            let count = 0;
            const c6 = c.compute(c => {
                count++;
                return (c.val(c1)) + (c.val(c2)) + (c.val(c3)) + (c.val(c4)) + (c.val(c5));
            });

            count = 0;
            s1.set(1);
            c6.get();
            expect(count).toBe(1); // "Converging nodes should only trigger the sink once"
        });
    });

});
