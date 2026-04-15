import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    signal,
    compute,
    derive,
    effect,
    watch,
    batch,
} from "./_helper.js";

/**
 * Tests exploring whether _ptime is necessary when the library
 * is used correctly (dynamic nodes for dynamic deps, stable
 * nodes only for fixed dep sets).
 */

describe("ptime guard: correct usage patterns", { skip: true }, () => {

    describe("dynamic effect with conditional deps", () => {

        it("dynamic effect drops dep when not read, re-adds when read again", () => {
            const s_gate = signal(true);
            const s_data = signal(0);
            const c = compute((r) => r.read(s_data) + 1);

            let effectRuns = 0;
            let lastVal = -1;
            effect((e) => {
                effectRuns++;
                if (e.read(s_gate)) {
                    lastVal = e.read(c);
                } else {
                    lastVal = -1;
                }
            });
            assert.strictEqual(effectRuns, 1);
            assert.strictEqual(lastVal, 1);

            batch(() => {
                s_gate.set(false);
                s_data.set(1);
            });
            assert.strictEqual(effectRuns, 2);
            assert.strictEqual(lastVal, -1);

            s_data.set(2);
            assert.strictEqual(effectRuns, 2);

            s_gate.set(true);
            assert.strictEqual(effectRuns, 3);
            assert.strictEqual(lastVal, 3);
        });

        it("dynamic effect always pulls compute when reading it", () => {
            const s = signal(0);
            const c = compute((r) => r.read(s) + 1);

            let effectRuns = 0;
            let lastVal = 0;
            effect((e) => {
                effectRuns++;
                lastVal = e.read(c);
            });
            assert.strictEqual(effectRuns, 1);
            assert.strictEqual(lastVal, 1);

            s.set(1);
            assert.strictEqual(effectRuns, 2);
            assert.strictEqual(lastVal, 2);

            s.set(2);
            assert.strictEqual(effectRuns, 3);
            assert.strictEqual(lastVal, 3);
        });
    });

    describe("stable effect (watch) with fixed deps", () => {

        it("watch always reads all deps — compute is always pulled", () => {
            const s = signal(0);
            const c = derive((r) => r.read(s) + 1);

            let effectRuns = 0;
            let lastVal = 0;
            watch((w) => {
                effectRuns++;
                lastVal = w.read(c);
            });
            assert.strictEqual(effectRuns, 1);
            assert.strictEqual(lastVal, 1);

            s.set(1);
            assert.strictEqual(effectRuns, 2);
            assert.strictEqual(lastVal, 2);
        });
    });

    describe("diamond topologies", () => {

        it("diamond: both arms stale in same round", () => {
            const s = signal(0);
            const left = derive((r) => r.read(s) + 1);
            const right = derive((r) => r.read(s) * 10);
            const join = derive((r) => r.read(left) + r.read(right));

            let effectRuns = 0;
            effect((e) => {
                effectRuns++;
                e.read(join);
            });
            assert.strictEqual(effectRuns, 1);
            assert.strictEqual(join.val(), 1);

            s.set(1);
            assert.strictEqual(effectRuns, 2);
            assert.strictEqual(join.val(), 12);
        });
    });

    describe("absorb pattern (value unchanged)", () => {

        it("absorbing compute prevents unnecessary downstream work", () => {
            const s = signal(0);
            let c1Runs = 0;
            let c2Runs = 0;
            const c1 = compute((r) => {
                c1Runs++;
                r.read(s);
                return 0;
            });
            const c2 = compute((r) => {
                c2Runs++;
                return r.read(c1) + 1;
            });

            let effectRuns = 0;
            effect((e) => {
                effectRuns++;
                e.read(c2);
            });

            c1Runs = c2Runs = effectRuns = 0;

            s.set(1);
            assert.strictEqual(c1Runs, 1);
            assert.strictEqual(c2Runs, 0);
            assert.strictEqual(effectRuns, 0);
        });
    });

    describe("lazy compute (no subscribers)", () => {

        it("compute with no subscribers: val() always returns correct value", () => {
            const s = signal(0);
            const c = compute((r) => r.read(s) + 1);
            assert.strictEqual(c.val(), 1);

            s.set(1);
            s.set(2);
            s.set(3);
            assert.strictEqual(c.val(), 4);
        });
    });

    describe("batch coalescing", () => {

        it("batch: two signals feeding same compute", () => {
            const s1 = signal(0);
            const s2 = signal(0);
            const c = compute((r) => r.read(s1) + r.read(s2));

            let effectRuns = 0;
            effect((e) => {
                effectRuns++;
                e.read(c);
            });
            effectRuns = 0;

            batch(() => {
                s1.set(1);
                s2.set(1);
            });
            assert.strictEqual(effectRuns, 1);
            assert.strictEqual(c.val(), 2);
        });
    });
});
