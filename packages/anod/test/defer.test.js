import { describe, test, expect } from "bun:test";
import { c, OPT_DEFER } from "../";

describe("OPT_DEFER", () => {
    describe("compute", () => {
        test("does not run fn until val() is read", () => {
            let runs = 0;
            const c1 = c.compute(() => { runs++; return 1; }, undefined, OPT_DEFER);
            expect(runs).toBe(0);
            expect(c1.peek()).toBe(1);
            expect(runs).toBe(1);
        });
    });

    describe("derive (stable)", () => {
        test("defers initial run", () => {
            const s1 = c.signal(1);
            let runs = 0;
            const c1 = c.derive(c => { runs++; return c.val(s1) * 2; }, undefined, OPT_DEFER);
            expect(runs).toBe(0);
            expect(c1.peek()).toBe(2);
            expect(runs).toBe(1);
        });
    });

    describe("task (async stable)", () => {
        test("defers async compute until read", () => {
            const s1 = c.signal(3);
            let runs = 0;
            const c1 = c.derive(c => { runs++; return c.val(s1); }, undefined, OPT_DEFER);
            expect(runs).toBe(0);
        });
    });

    describe("unbound effect", () => {
        test("ignores OPT_DEFER -- always runs initially", () => {
            let runs = 0;
            c.root(r => {
                r.effect(c => { runs++; }, OPT_DEFER);
                expect(runs).toBe(1);
            });
        });
    });

    describe("owned variants via root", () => {
        test("derive(fn, seed, OPT_DEFER) defers", () => {
            c.root(r => {
                const s1 = c.signal(10);
                let runs = 0;
                const c1 = r.derive(c => { runs++; return c.val(s1) * 2; }, undefined, OPT_DEFER);
                expect(runs).toBe(0);
                expect(c1.peek()).toBe(20);
                expect(runs).toBe(1);
            });
        });
    });
});
