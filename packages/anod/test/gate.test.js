import { describe, test, expect } from "#test-runner";
import { c } from "#anod";

describe("gate", () => {

    describe("basic signal behavior", () => {
        test("peek returns initial value", () => {
            const s = c.gate(5);
            expect(s.get()).toBe(5);
        });

        test("set updates value", () => {
            const s = c.gate(5);
            s.set(10);
            expect(s.get()).toBe(10);
        });

        test("set with same value is a no-op", () => {
            const s = c.gate(5);
            let runs = 0;
            c.effect(s, () => { runs++; });
            expect(runs).toBe(1);
            s.set(5);
            expect(runs).toBe(1);
        });

        test("dispose works", () => {
            const s = c.gate(5);
            let runs = 0;
            c.effect(s, () => { runs++; });
            expect(runs).toBe(1);
            s.dispose();
            expect(runs).toBe(1);
        });
    });

    describe("guard", () => {
        test("passes valid value", () => {
            function isNumber(v) { return typeof v === 'number'; }
            const s = c.gate(1).guard(isNumber);
            s.set(2);
            expect(s.get()).toBe(2);
        });

        test("throws on invalid value with guard name", () => {
            function isNumber(v) { return typeof v === 'number'; }
            const s = c.gate(1).guard(isNumber);
            expect(() => s.set("x")).toThrow("isNumber");
        });

        test("chains multiple guards", () => {
            function isNumber(v) { return typeof v === 'number'; }
            function isPositive(v) { return v > 0; }
            const s = c.gate(1).guard(isNumber).guard(isPositive);

            s.set(5);
            expect(s.get()).toBe(5);

            expect(() => s.set("x")).toThrow("isNumber");
            expect(() => s.set(-1)).toThrow("isPositive");
        });

        test("guards run before equality checks", () => {
            function isNumber(v) { return typeof v === 'number'; }
            const s = c.gate(1).guard(isNumber).check((a, b) => a === b);
            expect(() => s.set("x")).toThrow("isNumber");
        });

        test("does not update value when guard throws", () => {
            function isPositive(v) { return v > 0; }
            const s = c.gate(5).guard(isPositive);
            try { s.set(-1); } catch (_) { }
            expect(s.get()).toBe(5);
        });
    });

    describe("check (custom equality)", () => {
        test("skips set when check returns true", () => {
            const s = c.gate({ id: 1, name: "a" })
                .check((a, b) => a.id === b.id);
            let runs = 0;
            c.effect(s, () => { runs++; });
            expect(runs).toBe(1);

            s.set({ id: 1, name: "b" });
            expect(runs).toBe(1);
        });

        test("allows set when check returns false", () => {
            const s = c.gate({ id: 1, name: "a" })
                .check((a, b) => a.id === b.id);
            let runs = 0;
            c.effect(s, () => { runs++; });
            expect(runs).toBe(1);

            s.set({ id: 2, name: "b" });
            expect(runs).toBe(2);
        });

        test("chains multiple checks — any false triggers set", () => {
            const s = c.gate({ x: 1, y: 2 })
                .check((a, b) => a.x === b.x)
                .check((a, b) => a.y === b.y);
            let runs = 0;
            c.effect(s, () => { runs++; });
            expect(runs).toBe(1);

            /** Both fields same — skip */
            s.set({ x: 1, y: 2 });
            expect(runs).toBe(1);

            /** y differs — set fires */
            s.set({ x: 1, y: 3 });
            expect(runs).toBe(2);

            /** x differs — set fires */
            s.set({ x: 9, y: 3 });
            expect(runs).toBe(3);
        });
    });

    describe("reactive integration", () => {
        test("bound compute reads gate value", () => {
            const s = c.gate(3);
            const doubled = c.compute(s, val => val * 2);
            expect(doubled.get()).toBe(6);

            s.set(5);
            expect(doubled.get()).toBe(10);
        });

        test("dynamic compute reads gate via val()", () => {
            const s = c.gate(3);
            const doubled = c.compute(cx => cx.val(s) * 2);
            expect(doubled.get()).toBe(6);

            s.set(5);
            expect(doubled.get()).toBe(10);
        });

        test("bound effect fires on gate update", () => {
            const s = c.gate(0);
            let last = -1;
            c.effect(s, val => { last = val; });
            expect(last).toBe(0);

            s.set(1);
            expect(last).toBe(1);

            s.set(2);
            expect(last).toBe(2);
        });

        test("dynamic effect fires on gate update", () => {
            const s = c.gate(0);
            let last = -1;
            c.effect(cx => { last = cx.val(s); });
            expect(last).toBe(0);

            s.set(1);
            expect(last).toBe(1);
        });

        test("guarded gate works in compute chain", () => {
            function isNumber(v) { return typeof v === 'number'; }
            const s = c.gate(1).guard(isNumber);
            const doubled = c.compute(s, val => val * 2);
            const quadrupled = c.compute(doubled, val => val * 2);

            expect(quadrupled.get()).toBe(4);

            s.set(3);
            expect(quadrupled.get()).toBe(12);

            expect(() => s.set("x")).toThrow("isNumber");
            expect(quadrupled.get()).toBe(12);
        });

        test("checked gate skips downstream when equal", () => {
            const s = c.gate({ id: 1, v: 0 })
                .check((a, b) => a.id === b.id);
            let computeRuns = 0;
            const derived = c.compute(s, val => { computeRuns++; return val.id; });
            /** Subscribe so the compute evaluates eagerly */
            let last = 0;
            c.effect(derived, val => { last = val; });

            expect(computeRuns).toBe(1);

            /** Same id — gate skips, compute does not re-run */
            s.set({ id: 1, v: 99 });
            expect(computeRuns).toBe(1);

            /** Different id — gate fires, compute runs */
            s.set({ id: 2, v: 0 });
            expect(computeRuns).toBe(2);
            expect(last).toBe(2);
        });

        test("gate works inside batch", () => {
            const s1 = c.gate(0);
            const s2 = c.signal(0);
            let runs = 0;
            c.effect(cx => {
                cx.val(s1);
                cx.val(s2);
                runs++;
            });
            expect(runs).toBe(1);

            c.batch(() => {
                s1.set(1);
                s2.set(1);
            });
            expect(runs).toBe(2);
        });

        test("gate works with owned compute inside root", () => {
            const s = c.gate(5);
            let val = 0;
            const r = c.root(r => {
                const comp = r.compute(s, v => v + 1);
                r.effect(comp, v => { val = v; });
            });
            expect(val).toBe(6);

            s.set(10);
            expect(val).toBe(11);

            r.dispose();
            s.set(20);
            expect(val).toBe(11);
        });
    });
});
