import { describe, test, expect } from "bun:test";
import { c } from "../";

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
             * effect() re-tracks deps each run. When it stops reading comp,
             * pruneDeps unsubscribes. comp's leftover STALE is irrelevant
             * because comp has no subscriber.
             */
            const s_gate = c.signal(true);
            const s_data = c.signal(0);
            const comp = c.compute(r => r.val(s_data) + 1);

            let effectRuns = 0;
            let lastVal = -1;
            c.effect(r => {
                effectRuns++;
                if (r.val(s_gate)) {
                    lastVal = r.val(comp);
                } else {
                    lastVal = -1;
                }
            });
            expect(effectRuns).toBe(1);
            expect(lastVal).toBe(1);

            /** Gate off + data change: effect drops comp as dep */
            c.batch(() => {
                s_gate.set(false);
                s_data.set(1);
            });
            expect(effectRuns).toBe(2);
            expect(lastVal).toBe(-1);

            /**
             * comp has leftover STALE but no subscribers (pruned).
             * Changing s_data does NOT trigger the effect -- correct
             * because the effect no longer depends on comp.
             */
            s_data.set(2);
            expect(effectRuns).toBe(2);

            /** Gate back on: effect re-subscribes to comp, pulls it fresh */
            s_gate.set(true);
            expect(effectRuns).toBe(3);
            expect(lastVal).toBe(3);
        });

        test("dynamic effect always pulls compute when reading it", () => {
            const s = c.signal(0);
            const comp = c.compute(r => r.val(s) + 1);

            let effectRuns = 0;
            let lastVal = 0;
            c.effect(r => {
                effectRuns++;
                lastVal = r.val(comp);
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

        test("watch always reads all deps -- compute is always pulled", () => {
            const s = c.signal(0);
            const comp = c.derive(r => r.val(s) + 1);

            let effectRuns = 0;
            let lastVal = 0;
            c.watch(r => {
                effectRuns++;
                lastVal = r.val(comp);
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
            const s1 = c.signal(0);
            const s2 = c.signal(10);
            const c1 = c.derive(r => r.val(s1) + 1);
            const c2 = c.derive(r => r.val(s2) + 1);

            let effectRuns = 0;
            let lastVal = 0;
            c.watch(r => {
                effectRuns++;
                lastVal = r.val(c1) + r.val(c2);
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
            const s = c.signal(0);
            const left = c.derive(r => r.val(s) + 1);
            const right = c.derive(r => r.val(s) * 10);
            const join = c.derive(r => r.val(left) + r.val(right));

            let effectRuns = 0;
            c.effect(r => {
                effectRuns++;
                r.val(join);
            });
            expect(effectRuns).toBe(1);
            expect(join.peek()).toBe(1);

            s.set(1);
            expect(effectRuns).toBe(2);
            expect(join.peek()).toBe(12);

            s.set(2);
            expect(effectRuns).toBe(3);
            expect(join.peek()).toBe(23);
        });

        test("deep diamond with pending/stale split", () => {
            const s = c.signal(0);
            const a = c.derive(r => r.val(s) + 1);
            const b = c.derive(r => r.val(a) + 1);
            const d = c.derive(r => r.val(a) + r.val(b));

            let effectRuns = 0;
            c.effect(r => {
                effectRuns++;
                r.val(d);
            });
            expect(effectRuns).toBe(1);
            expect(d.peek()).toBe(3);

            s.set(1);
            expect(effectRuns).toBe(2);
            expect(d.peek()).toBe(5);

            s.set(2);
            expect(effectRuns).toBe(3);
            expect(d.peek()).toBe(7);
        });
    });

    describe("multi-round start() (effect writes to signal)", () => {

        test("effect writes signal, second round notifies same compute", () => {
            /**
             * C depends on both S1 and S2.
             * E reads C and conditionally writes S2.
             * Round 1: S1 changes -> C stale -> E runs -> pulls C -> clears.
             * E writes S2 -> round 2 -> C._setStale again.
             * C's flags were cleared in round 1 -> propagates correctly.
             */
            const s1 = c.signal(0);
            const s2 = c.signal(0);
            const comp = c.compute(r => r.val(s1) + r.val(s2));

            let effectRuns = 0;
            let lastVal = 0;
            c.effect(r => {
                effectRuns++;
                lastVal = r.val(comp);
                if (lastVal === 1 && s2.peek() === 0) {
                    s2.set(10);
                }
            });
            expect(effectRuns).toBe(1);
            expect(lastVal).toBe(0);

            s1.set(1);
            /**
             * Round 1: C = 1+0 = 1, E runs (effectRuns=2), writes S2=10
             * Round 2: S2 processes -> C._setStale -> C=1+10=11, E runs (effectRuns=3)
             */
            expect(lastVal).toBe(11);
            expect(effectRuns).toBe(3);
        });

        test("chain: effect writes signal feeding another effect", () => {
            const s = c.signal(0);
            const comp = c.compute(r => r.val(s) + 1);
            const s_out = c.signal(-1);

            c.effect(r => {
                s_out.set(r.val(comp));
            });

            let lastOut = 0;
            c.effect(r => {
                lastOut = r.val(s_out);
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
            const s = c.signal(0);
            let c1Runs = 0;
            let c2Runs = 0;
            const c1 = c.compute(r => {
                c1Runs++;
                r.val(s);
                return 0;
            });
            const c2 = c.compute(r => {
                c2Runs++;
                return r.val(c1) + 1;
            });

            let effectRuns = 0;
            c.effect(r => {
                effectRuns++;
                r.val(c2);
            });

            c1Runs = 0;
            c2Runs = 0;
            effectRuns = 0;

            s.set(1);
            /** c1 re-runs (dep changed) but returns same value -> c2 skips */
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
            const s = c.signal(0);
            const comp = c.compute(r => r.val(s) + 1);
            expect(comp.peek()).toBe(1);

            s.set(1);
            s.set(2);
            s.set(3);
            /** val() pulls regardless of flag state */
            expect(comp.peek()).toBe(4);
        });

        test("compute gains subscriber after being stale -- subscriber sees current value", () => {
            const s = c.signal(0);
            const comp = c.compute(r => r.val(s) + 1);
            expect(comp.peek()).toBe(1);

            /** comp gets STALE, no subscriber to pull it */
            s.set(1);
            s.set(2);

            /** Now subscribe -- effect creation reads comp.peek() -> clears flags */
            let lastVal = 0;
            c.effect(r => {
                lastVal = r.val(comp);
            });
            expect(lastVal).toBe(3);

            /** Subsequent changes work normally */
            s.set(3);
            expect(lastVal).toBe(4);
        });
    });

    describe("batch coalescing", () => {

        test("batch: two signals feeding same compute", () => {
            const s1 = c.signal(0);
            const s2 = c.signal(0);
            const comp = c.compute(r => r.val(s1) + r.val(s2));

            let effectRuns = 0;
            c.effect(r => {
                effectRuns++;
                r.val(comp);
            });
            effectRuns = 0;

            c.batch(() => {
                s1.set(1);
                s2.set(1);
            });
            /** Single run despite two signal changes */
            expect(effectRuns).toBe(1);
            expect(comp.peek()).toBe(2);
        });

        test("batch: same signal set twice, compute runs once", () => {
            const s = c.signal(0);
            const comp = c.compute(r => r.val(s) + 1);

            let effectRuns = 0;
            c.effect(r => {
                effectRuns++;
                r.val(comp);
            });
            effectRuns = 0;

            c.batch(() => {
                s.set(1);
                s.set(2);
            });
            expect(effectRuns).toBe(1);
            expect(comp.peek()).toBe(3);
        });
    });

    describe("deep chains", () => {

        test("20-deep chain propagates correctly across multiple updates", () => {
            const head = c.signal(0);
            let current = head;
            for (let i = 0; i < 20; i++) {
                let prev = current;
                current = c.derive(r => r.val(prev) + 1);
            }

            let effectRuns = 0;
            c.effect(r => {
                effectRuns++;
                r.val(current);
            });
            effectRuns = 0;

            head.set(1);
            expect(effectRuns).toBe(1);
            expect(current.peek()).toBe(21);

            head.set(2);
            expect(effectRuns).toBe(2);
            expect(current.peek()).toBe(22);
        });

        test("deep absorb chain: only first node runs", () => {
            const head = c.signal(0);
            let c1Runs = 0;
            const c1 = c.compute(r => {
                c1Runs++;
                r.val(head);
                return 0;
            });
            const c2 = c.derive(r => r.val(c1) + 1);
            const c3 = c.derive(r => r.val(c2) + 1);
            const c4 = c.derive(r => r.val(c3) + 1);

            let effectRuns = 0;
            c.effect(r => {
                effectRuns++;
                r.val(c4);
            });
            c1Runs = 0;
            effectRuns = 0;

            head.set(1);
            expect(c1Runs).toBe(1);
            expect(effectRuns).toBe(0);
        });
    });
});
