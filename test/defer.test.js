import { describe, test, expect } from "#test-runner";
import { signal, root, DEFER, STABLE, c } from "#anod";

describe("DEFER", () => {
    describe("compute", () => {
        test("does not run fn until val() is read", () => {
            let runs = 0;
            const c1 = c.compute(() => { runs++; return 1; }, void 0, DEFER);
            expect(runs).toBe(0);
            expect(c1.get()).toBe(1);
            expect(runs).toBe(1);
        });
    });

    describe("stable compute", () => {
        test("defers initial run", () => {
            const s1 = signal(1);
            let runs = 0;
            const c1 = c.compute(c => { runs++; return c.val(s1) * 2; }, void 0, DEFER | STABLE);
            expect(runs).toBe(0);
            expect(c1.get()).toBe(2);
            expect(runs).toBe(1);
        });
    });

    describe("task (async stable)", () => {
        test("defers async compute until read", () => {
            const s1 = signal(3);
            let runs = 0;
            const c1 = c.compute(c => { runs++; return c.val(s1); }, void 0, DEFER | STABLE);
            expect(runs).toBe(0);
        });
    });

    describe("unbound effect", () => {
        test("ignores DEFER -- always runs initially", () => {
            let runs = 0;
            root(r => {
                r.effect(c => { runs++; }, DEFER);
                expect(runs).toBe(1);
            });
        });
    });

    describe("owned variants via root", () => {
        test("compute(fn, seed, DEFER) defers", () => {
            root(r => {
                const s1 = signal(10);
                let runs = 0;
                const c1 = r.compute(c => { runs++; return c.val(s1) * 2; }, void 0, DEFER | STABLE);
                expect(runs).toBe(0);
                expect(c1.get()).toBe(20);
                expect(runs).toBe(1);
            });
        });
    });
});
