import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { c } from "@fyren/core";
import { gate } from "@fyren/tools";

describe("gate", () => {
    describe("basic signal behavior", () => {
        test("get returns initial value", () => {
            const s = gate(5);
            assert.strictEqual(s.get(), 5);
        });

        test("set updates value", () => {
            const s = gate(5);
            s.set(10);
            assert.strictEqual(s.get(), 10);
        });

        test("set with same value is a no-op", () => {
            const s = gate(5);
            let runs = 0;
            c.effect(s, () => { runs++; });
            assert.strictEqual(runs, 1);
            s.set(5);
            assert.strictEqual(runs, 1);
        });

        test("dispose works", () => {
            const s = gate(5);
            let runs = 0;
            c.effect(s, () => { runs++; });
            assert.strictEqual(runs, 1);
            s.dispose();
            assert.strictEqual(runs, 1);
        });
    });

    describe("guard", () => {
        test("passes valid value", () => {
            function isNumber(v) { return typeof v === "number"; }
            const s = gate(1).guard(isNumber);
            s.set(2);
            assert.strictEqual(s.get(), 2);
        });

        test("throws on invalid value with guard name", () => {
            function isNumber(v) { return typeof v === "number"; }
            const s = gate(1).guard(isNumber);
            assert.throws(() => s.set("x"), (e) => e.message.includes("isNumber"));
        });

        test("chains multiple guards", () => {
            function isNumber(v) { return typeof v === "number"; }
            function isPositive(v) { return v > 0; }
            const s = gate(1).guard(isNumber).guard(isPositive);

            s.set(5);
            assert.strictEqual(s.get(), 5);

            assert.throws(() => s.set("x"), (e) => e.message.includes("isNumber"));
            assert.throws(() => s.set(-1), (e) => e.message.includes("isPositive"));
        });

        test("does not update value when guard throws", () => {
            function isPositive(v) { return v > 0; }
            const s = gate(5).guard(isPositive);
            try { s.set(-1); } catch (_) { }
            assert.strictEqual(s.get(), 5);
        });
    });

    describe("check (custom equality)", () => {
        test("skips set when check returns true", () => {
            const s = gate({ id: 1, name: "a" })
                .check((a, b) => a.id === b.id);
            let runs = 0;
            c.effect(s, () => { runs++; });
            assert.strictEqual(runs, 1);

            s.set({ id: 1, name: "b" });
            assert.strictEqual(runs, 1);
        });

        test("allows set when check returns false", () => {
            const s = gate({ id: 1, name: "a" })
                .check((a, b) => a.id === b.id);
            let runs = 0;
            c.effect(s, () => { runs++; });
            assert.strictEqual(runs, 1);

            s.set({ id: 2, name: "b" });
            assert.strictEqual(runs, 2);
        });
    });

    describe("reactive integration", () => {
        test("bound compute reads gate value", () => {
            const s = gate(3);
            const doubled = c.compute(s, (val) => val * 2);
            assert.strictEqual(doubled.get(), 6);

            s.set(5);
            assert.strictEqual(doubled.get(), 10);
        });

        test("dynamic compute reads gate via val()", () => {
            const s = gate(3);
            const doubled = c.compute((cx) => cx.val(s) * 2);
            assert.strictEqual(doubled.get(), 6);

            s.set(5);
            assert.strictEqual(doubled.get(), 10);
        });

        test("bound effect fires on gate update", () => {
            const s = gate(0);
            let last = -1;
            c.effect(s, (val) => { last = val; });
            assert.strictEqual(last, 0);

            s.set(1);
            assert.strictEqual(last, 1);
        });

        test("guarded gate works in compute chain", () => {
            function isNumber(v) { return typeof v === "number"; }
            const s = gate(1).guard(isNumber);
            const doubled = c.compute(s, (val) => val * 2);

            assert.strictEqual(doubled.get(), 2);

            s.set(3);
            assert.strictEqual(doubled.get(), 6);

            assert.throws(() => s.set("x"), (e) => e.message.includes("isNumber"));
            assert.strictEqual(doubled.get(), 6);
        });
    });
});
