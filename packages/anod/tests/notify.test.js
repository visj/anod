import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { signal, compute, effect, batch } from "./_helper.js";

describe("equal()", () => {
    it("equal(true) suppresses notification when value changes", () => {
        const s1 = signal(1);
        let runs = 0;
        const c1 = compute((c) => {
            c.equal(true);
            return c.read(s1);
        });
        const c2 = compute((c) => {
            runs++;
            return c.read(c1);
        });
        runs = 0;
        s1.set(2);
        assert.strictEqual(c1.val(), 2);
        assert.strictEqual(runs, 0);
    });

    it("equal(false) forces notification when value stays the same", () => {
        const s1 = signal(1);
        let runs = 0;
        const c1 = compute((c) => {
            c.equal(false);
            c.read(s1);
            return 42;
        });
        const c2 = compute((c) => {
            runs++;
            return c.read(c1);
        });
        assert.strictEqual(c1.val(), 42);
        runs = 0;
        s1.set(2);
        c2.val();
        assert.strictEqual(runs, 1);
    });

    it("equal(false) forces notification on effects", () => {
        const s1 = signal(1);
        let runs = 0;
        const c1 = compute((c) => {
            c.equal(false);
            c.read(s1);
            return 42;
        });
        effect((e) => {
            runs++;
            e.read(c1);
        });
        runs = 0;
        s1.set(2);
        assert.strictEqual(runs, 1);
    });

    it("default behavior: no notification when value stays the same", () => {
        const s1 = signal(1);
        let runs = 0;
        const c1 = compute((c) => {
            c.read(s1);
            return 42;
        });
        const c2 = compute((c) => {
            runs++;
            return c.read(c1);
        });
        runs = 0;
        s1.set(2);
        c2.val();
        assert.strictEqual(runs, 0);
    });

    it("default behavior: notifies when value changes", () => {
        const s1 = signal(1);
        let runs = 0;
        const c1 = compute((c) => {
            return c.read(s1) * 2;
        });
        const c2 = compute((c) => {
            runs++;
            return c.read(c1);
        });
        runs = 0;
        s1.set(2);
        c2.val();
        assert.strictEqual(runs, 1);
        assert.strictEqual(c2.val(), 4);
    });

    it("equal(true) then equal(false) uses last call", () => {
        const s1 = signal(1);
        let runs = 0;
        const c1 = compute((c) => {
            c.equal(true);
            c.equal(false);
            c.read(s1);
            return 42;
        });
        const c2 = compute((c) => {
            runs++;
            return c.read(c1);
        });
        runs = 0;
        s1.set(2);
        c2.val();
        assert.strictEqual(runs, 1);
    });

    it("equal(false) then equal(true) uses last call", () => {
        const s1 = signal(1);
        let runs = 0;
        const c1 = compute((c) => {
            c.equal(false);
            c.equal(true);
            return c.read(s1);
        });
        const c2 = compute((c) => {
            runs++;
            return c.read(c1);
        });
        runs = 0;
        s1.set(2);
        c2.val();
        assert.strictEqual(runs, 0);
    });

    it("equal() resets between compute runs", () => {
        const s1 = signal(1);
        let forceNotify = false;
        let runs = 0;
        const c1 = compute((c) => {
            if (forceNotify) {
                c.equal(false);
            }
            c.read(s1);
            return 42;
        });
        const c2 = compute((c) => {
            runs++;
            return c.read(c1);
        });
        runs = 0;
        s1.set(2);
        c2.val();
        assert.strictEqual(runs, 0);
        forceNotify = true;
        runs = 0;
        s1.set(3);
        c2.val();
        assert.strictEqual(runs, 1);
        forceNotify = false;
        runs = 0;
        s1.set(4);
        c2.val();
        assert.strictEqual(runs, 0);
    });
});
