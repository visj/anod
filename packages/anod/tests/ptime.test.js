import { describe, test, expect } from "bun:test";
import {
    signal,
    compute,
    derive,
    transmit,
    effect,
    watch,
    scope,
    batch,
    OPT_NOTIFY,
} from "../";

/**
 * Tests exploring whether _ptime is necessary when the library
 * is used correctly (dynamic nodes for dynamic deps, stable
 * nodes only for fixed dep sets).
 *
 * Key insight: with correct usage, compute flags are always
 * either cleared (by being pulled) or irrelevant (subscriber
 * was pruned). These tests attempt to find a counterexample.
 */

describe("ptime guard: correct usage patterns", () => {

    describe("dynamic effect with conditional deps", () => {

        test("dynamic effect drops dep when not read, re-adds when read again", () => {
            /**
             * effect() re-tracks deps each run. When it stops reading c,
             * pruneDeps unsubscribes. c's leftover STALE is irrelevant
             * because c has no subscriber.
             */
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
            expect(effectRuns).toBe(1);
            expect(lastVal).toBe(1);

            /** Gate off + data change: effect drops c as dep */
            batch(() => {
                s_gate.set(false);
                s_data.set(1);
            });
            expect(effectRuns).toBe(2);
            expect(lastVal).toBe(-1);

            /**
             * c has leftover STALE but no subscribers (pruned).
             * Changing s_data does NOT trigger the effect — correct
             * because the effect no longer depends on c.
             */
            s_data.set(2);
            expect(effectRuns).toBe(2);

            /** Gate back on: effect re-subscribes to c, pulls it fresh */
            s_gate.set(true);
            expect(effectRuns).toBe(3);
            expect(lastVal).toBe(3);
        });

        test("dynamic effect always pulls compute when reading it", () => {
            const s = signal(0);
            const c = compute((r) => r.read(s) + 1);

            let effectRuns = 0;
            let lastVal = 0;
            effect((e) => {
                effectRuns++;
                lastVal = e.read(c);
            });
            expect(effectRuns).toBe(1);
            expect(lastVal).toBe(1);

            s.set(1);
            expect(effectRuns).toBe(2);
            expect(lastVal).toBe(2);

            s.set(2);
            expect(effectRuns).toBe(3);
            expect(lastVal).toBe(3);
        });
    });

    describe("stable effect (watch) with fixed deps", () => {

        test("watch always reads all deps — compute is always pulled", () => {
            const s = signal(0);
            const c = derive((r) => r.read(s) + 1);

            let effectRuns = 0;
            let lastVal = 0;
            watch((w) => {
                effectRuns++;
                lastVal = w.read(c);
            });
            expect(effectRuns).toBe(1);
            expect(lastVal).toBe(1);

            s.set(1);
            expect(effectRuns).toBe(2);
            expect(lastVal).toBe(2);

            s.set(2);
            expect(effectRuns).toBe(3);
            expect(lastVal).toBe(3);
        });

        test("watch with two deps always pulls both", () => {
            const s1 = signal(0);
            const s2 = signal(10);
            const c1 = derive((r) => r.read(s1) + 1);
            const c2 = derive((r) => r.read(s2) + 1);

            let effectRuns = 0;
            let lastVal = 0;
            watch((w) => {
                effectRuns++;
                lastVal = w.read(c1) + w.read(c2);
            });
            expect(effectRuns).toBe(1);
            expect(lastVal).toBe(12);

            s1.set(1);
            expect(effectRuns).toBe(2);
            expect(lastVal).toBe(13);

            s2.set(20);
            expect(effectRuns).toBe(3);
            expect(lastVal).toBe(23);
        });
    });

    describe("diamond topologies", () => {

        test("diamond: both arms stale in same round", () => {
            const s = signal(0);
            const left = derive((r) => r.read(s) + 1);
            const right = derive((r) => r.read(s) * 10);
            const join = derive((r) => r.read(left) + r.read(right));

            let effectRuns = 0;
            effect((e) => {
                effectRuns++;
                e.read(join);
            });
            expect(effectRuns).toBe(1);
            expect(join.val()).toBe(1);

            s.set(1);
            expect(effectRuns).toBe(2);
            expect(join.val()).toBe(12);

            s.set(2);
            expect(effectRuns).toBe(3);
            expect(join.val()).toBe(23);
        });

        test("deep diamond with pending/stale split", () => {
            const s = signal(0);
            const a = derive((r) => r.read(s) + 1);
            const b = derive((r) => r.read(a) + 1);
            const c = derive((r) => r.read(a) + r.read(b));

            let effectRuns = 0;
            effect((e) => {
                effectRuns++;
                e.read(c);
            });
            expect(effectRuns).toBe(1);
            expect(c.val()).toBe(3);

            s.set(1);
            expect(effectRuns).toBe(2);
            expect(c.val()).toBe(5);

            s.set(2);
            expect(effectRuns).toBe(3);
            expect(c.val()).toBe(7);
        });
    });

    describe("multi-round start() (effect writes to signal)", () => {

        test("effect writes signal, second round notifies same compute", () => {
            /**
             * C depends on both S1 and S2.
             * E reads C and conditionally writes S2.
             * Round 1: S1 changes → C stale → E runs → pulls C → clears.
             * E writes S2 → round 2 → C._setStale again.
             * C's flags were cleared in round 1 → propagates correctly.
             */
            const s1 = signal(0);
            const s2 = signal(0);
            const c = compute((r) => r.read(s1) + r.read(s2));

            let effectRuns = 0;
            let lastVal = 0;
            effect((e) => {
                effectRuns++;
                lastVal = e.read(c);
                if (lastVal === 1 && s2.val() === 0) {
                    s2.set(10);
                }
            });
            expect(effectRuns).toBe(1);
            expect(lastVal).toBe(0);

            s1.set(1);
            /**
             * Round 1: C = 1+0 = 1, E runs (effectRuns=2), writes S2=10
             * Round 2: S2 processes → C._setStale → C=1+10=11, E runs (effectRuns=3)
             */
            expect(lastVal).toBe(11);
            expect(effectRuns).toBe(3);
        });

        test("chain: effect writes signal feeding another effect", () => {
            const s = signal(0);
            const c = compute((r) => r.read(s) + 1);
            const s_out = signal(-1);

            effect((e) => {
                s_out.set(e.read(c));
            });

            let lastOut = 0;
            effect((e) => {
                lastOut = e.read(s_out);
            });
            expect(lastOut).toBe(1);

            s.set(1);
            expect(lastOut).toBe(2);

            s.set(2);
            expect(lastOut).toBe(3);
        });
    });

    describe("absorb pattern (value unchanged)", () => {

        test("absorbing compute prevents unnecessary downstream work", () => {
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

            c1Runs = 0;
            c2Runs = 0;
            effectRuns = 0;

            s.set(1);
            /** c1 re-runs (dep changed) but returns same value → c2 skips */
            expect(c1Runs).toBe(1);
            expect(c2Runs).toBe(0);
            expect(effectRuns).toBe(0);

            s.set(2);
            expect(c1Runs).toBe(2);
            expect(c2Runs).toBe(0);
            expect(effectRuns).toBe(0);
        });
    });

    describe("lazy compute (no subscribers)", () => {

        test("compute with no subscribers: val() always returns correct value", () => {
            const s = signal(0);
            const c = compute((r) => r.read(s) + 1);
            expect(c.val()).toBe(1);

            s.set(1);
            s.set(2);
            s.set(3);
            /** val() pulls regardless of flag state */
            expect(c.val()).toBe(4);
        });

        test("compute gains subscriber after being stale — subscriber sees current value", () => {
            const s = signal(0);
            const c = compute((r) => r.read(s) + 1);
            expect(c.val()).toBe(1);

            /** c gets STALE, no subscriber to pull it */
            s.set(1);
            s.set(2);

            /** Now subscribe — effect creation reads c.val() → clears flags */
            let lastVal = 0;
            effect((e) => {
                lastVal = e.read(c);
            });
            expect(lastVal).toBe(3);

            /** Subsequent changes work normally */
            s.set(3);
            expect(lastVal).toBe(4);
        });
    });

    describe("batch coalescing", () => {

        test("batch: two signals feeding same compute", () => {
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
            /** Single run despite two signal changes */
            expect(effectRuns).toBe(1);
            expect(c.val()).toBe(2);
        });

        test("batch: same signal set twice, compute runs once", () => {
            const s = signal(0);
            const c = compute((r) => r.read(s) + 1);

            let effectRuns = 0;
            effect((e) => {
                effectRuns++;
                e.read(c);
            });
            effectRuns = 0;

            batch(() => {
                s.set(1);
                s.set(2);
            });
            expect(effectRuns).toBe(1);
            expect(c.val()).toBe(3);
        });
    });

    describe("OPT_NOTIFY (transmit)", () => {

        test("transmit always notifies stale downstream", () => {
            const s = signal(0);
            const t = transmit((r) => {
                r.read(s);
                return 42;
            });
            const c = compute((r) => r.read(t) + 1);

            let effectRuns = 0;
            effect((e) => {
                effectRuns++;
                e.read(c);
            });
            effectRuns = 0;

            s.set(1);
            /**
             * t returns 42 (same), but NOTIFY → c gets STALE.
             * c returns 43 (same) → effect skips.
             */
            expect(effectRuns).toBe(0);

            s.set(2);
            expect(effectRuns).toBe(0);
        });

        test("transmit with value change propagates normally", () => {
            const s = signal(0);
            const t = transmit((r) => r.read(s) + 1);

            let effectRuns = 0;
            effect((e) => {
                effectRuns++;
                e.read(t);
            });
            effectRuns = 0;

            s.set(1);
            expect(effectRuns).toBe(1);
            expect(t.val()).toBe(2);
        });
    });

    describe("deep chains", () => {

        test("20-deep chain propagates correctly across multiple updates", () => {
            const head = signal(0);
            let current = head;
            for (let i = 0; i < 20; i++) {
                let prev = current;
                current = derive((r) => r.read(prev) + 1);
            }

            let effectRuns = 0;
            effect((e) => {
                effectRuns++;
                e.read(current);
            });
            effectRuns = 0;

            head.set(1);
            expect(effectRuns).toBe(1);
            expect(current.val()).toBe(21);

            head.set(2);
            expect(effectRuns).toBe(2);
            expect(current.val()).toBe(22);
        });

        test("deep absorb chain: only first node runs", () => {
            const head = signal(0);
            let c1Runs = 0;
            const c1 = compute((r) => {
                c1Runs++;
                r.read(head);
                return 0;
            });
            const c2 = derive((r) => r.read(c1) + 1);
            const c3 = derive((r) => r.read(c2) + 1);
            const c4 = derive((r) => r.read(c3) + 1);

            let effectRuns = 0;
            effect((e) => {
                effectRuns++;
                e.read(c4);
            });
            c1Runs = 0;
            effectRuns = 0;

            head.set(1);
            expect(c1Runs).toBe(1);
            expect(effectRuns).toBe(0);
        });
    });
});
