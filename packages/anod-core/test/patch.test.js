import { describe, test, expect } from "#test-runner";
import { signal, root } from "#anod-src";

let c; root((_c) => { c = _c; });

/**
 * Tests for dynamic dep reconciliation (patchDeps) in compute() and
 * effect(). Drops at head/middle/tail, full replacement, shuffle, add
 * to end, splice, single<->many transitions, and chained re-runs.
 *
 * Invariants every test asserts via {@link verifyDepSet} +
 * {@link verifyIntegrity}:
 *   1. `_dep1` U `_deps` exactly equals the senders read in the last run.
 *   2. Every kept dep has a back-pointer (sub1/subs) to the node.
 *   3. Every dropped sender no longer has the node in its sub list.
 *   4. `FLAG_SINGLE` iff the node has exactly one dep total.
 *   5. If the node has any deps, `_dep1` must be populated. Otherwise
 *      `checkRun` dereferences a null `_dep1`, and the `existingLen`
 *      formula `(depCount-1)*2` mis-accounts on the following re-run.
 */

const FLAG_SINGLE = 1 << 22;

function collectDeps(node) {
    const deps = [];
    if (node._dep1 !== null) {
        deps.push(node._dep1);
    }
    if (node._deps !== null) {
        for (let i = 0; i < node._deps.length; i++) {
            deps.push(node._deps[i]);
        }
    }
    return deps;
}

function depSet(node) {
    return new Set(collectDeps(node));
}

function verifyDepSet(node, expected) {
    expect(depSet(node)).toEqual(new Set(expected));
}

/** Back-pointer integrity + FLAG_SINGLE + dep1-populated invariant. */
function verifyIntegrity(node) {
    const deps = collectDeps(node);

    // Every dep has the node listed exactly once in its sub registry
    // (ignoring disposed entries pending purge).
    for (const dep of deps) {
        let count = 0;
        if (dep._sub1 === node) {
            count++;
        }
        if (dep._subs !== null) {
            for (let i = 0; i < dep._subs.length; i++) {
                if (dep._subs[i] === node) {
                    count++;
                }
            }
        }
        expect(count).toBe(1);
    }

    // FLAG_SINGLE iff exactly one dep.
    const hasSingle = (node._flag & FLAG_SINGLE) !== 0;
    expect(hasSingle).toBe(deps.length === 1);

    // Invariant: if any deps, _dep1 must be populated.
    if (deps.length > 0) {
        expect(node._dep1).not.toBeNull();
    }
}

function verifyDropped(node, droppedSenders) {
    for (const sender of droppedSenders) {
        expect(sender._sub1).not.toBe(node);
        if (sender._subs !== null) {
            for (let i = 0; i < sender._subs.length; i++) {
                if (!(sender._subs[i]._flag & 8)) {
                    expect(sender._subs[i]).not.toBe(node);
                }
            }
        }
    }
}

/**
 * Build a test harness: N signals, an externally-mutable mode, and the
 * node under test. The `pattern(mode, signals)` returns the list of
 * signal indices to read -- in order, so the caller controls dep1.
 *
 * To trigger a re-run we bump whichever signal is currently `_dep1`.
 */
function harness(kind, pattern, n = 10) {
    const signals = Array.from({ length: n }, (_, i) => signal(i));
    let modeVar = 'A';
    let node;
    const fn = cx => {
        const idx = pattern(modeVar, signals);
        for (const i of idx) {
            cx.val(signals[i]);
        }
    };
    const r = root(r => {
        node = kind === 'compute' ? c.compute(fn) : r.effect(fn);
    });
    if (kind === 'compute') {
        node.get();
    }
    return {
        signals,
        node,
        root: r,
        setMode(next) {
            modeVar = next;
            /** Bumping dep1 is the most general way to force a re-run --
             *  even if dep1 is about to be dropped, the stale flag
             *  reaches the node first. */
            const trigger = node._dep1;
            if (trigger === null) {
                throw new Error("harness: no dep to bump; add a signal that stays read across modes");
            }
            trigger.set(trigger._value + 1);
            if (kind === 'compute') {
                node.get();
            }
        },
    };
}

for (const kind of ['compute', 'effect']) {
    describe(`patchDeps via ${kind}()`, () => {
        test("no-op re-run: same deps, same order", () => {
            const h = harness(kind, (m, s) => [0, 1, 2]);
            verifyDepSet(h.node, [h.signals[0], h.signals[1], h.signals[2]]);
            verifyIntegrity(h.node);
            h.setMode('A2');
            verifyDepSet(h.node, [h.signals[0], h.signals[1], h.signals[2]]);
            verifyIntegrity(h.node);
        });

        test("drop dep1 with one dep remaining (promote path)", () => {
            const h = harness(kind, (m, s) => {
                if (m === 'A') {
                    return [0, 1];
                }
                return [1];
            }, 3);
            expect(h.node._dep1).toBe(h.signals[0]);
            h.setMode('B');
            verifyDepSet(h.node, [h.signals[1]]);
            verifyIntegrity(h.node);
            verifyDropped(h.node, [h.signals[0]]);
        });

        test("drop dep1 with multiple deps remaining (dep1 must be repopulated)", () => {
            /**
             * Setup: dep1 = s0, _deps = [s1, s2]. After dropping s0,
             * patchDeps currently leaves `_dep1 === null` with `_deps`
             * still holding s1 & s2 -- violating the invariant that
             * `checkRun` and `existingLen` both assume.
             */
            const h = harness(kind, (m, s) => {
                if (m === 'A') {
                    return [0, 1, 2];
                }
                return [1, 2];
            }, 4);
            expect(h.node._dep1).toBe(h.signals[0]);
            h.setMode('B');
            verifyDepSet(h.node, [h.signals[1], h.signals[2]]);
            verifyIntegrity(h.node);
            verifyDropped(h.node, [h.signals[0]]);
        });

        test("drop dep1 then chain into another re-run (add a dep)", () => {
            /** Proves the invalid intermediate state from the previous
             *  test corrupts the next patchDeps call via the off-by-2
             *  `existingLen` formula. */
            const h = harness(kind, (m, s) => {
                if (m === 'A') {
                    return [0, 1, 2];
                }
                if (m === 'B') {
                    return [1, 2];
                }
                return [1, 2, 3];
            }, 5);
            h.setMode('B');
            verifyIntegrity(h.node);
            h.setMode('C');
            verifyDepSet(h.node, [h.signals[1], h.signals[2], h.signals[3]]);
            verifyIntegrity(h.node);
        });

        test("drop middle dep", () => {
            const h = harness(kind, (m, s) => {
                if (m === 'A') {
                    return [0, 1, 2, 3];
                }
                return [0, 1, 3];
            }, 5);
            h.setMode('B');
            verifyDepSet(h.node, [h.signals[0], h.signals[1], h.signals[3]]);
            verifyIntegrity(h.node);
            verifyDropped(h.node, [h.signals[2]]);
        });

        test("drop last dep", () => {
            const h = harness(kind, (m, s) => {
                if (m === 'A') {
                    return [0, 1, 2, 3];
                }
                return [0, 1, 2];
            }, 5);
            h.setMode('B');
            verifyDepSet(h.node, [h.signals[0], h.signals[1], h.signals[2]]);
            verifyIntegrity(h.node);
            verifyDropped(h.node, [h.signals[3]]);
        });

        test("drop all deps", () => {
            const h = harness(kind, (m, s) => {
                if (m === 'A') {
                    return [0, 1, 2, 3];
                }
                return [];
            }, 5);
            h.setMode('B');
            verifyDepSet(h.node, []);
            verifyIntegrity(h.node);
            verifyDropped(h.node, [h.signals[0], h.signals[1], h.signals[2], h.signals[3]]);
        });

        test("add a dep at the end", () => {
            const h = harness(kind, (m, s) => {
                if (m === 'A') {
                    return [0, 1];
                }
                return [0, 1, 2];
            }, 5);
            h.setMode('B');
            verifyDepSet(h.node, [h.signals[0], h.signals[1], h.signals[2]]);
            verifyIntegrity(h.node);
        });

        test("add many deps at the end", () => {
            const h = harness(kind, (m, s) => {
                if (m === 'A') {
                    return [0];
                }
                return [0, 1, 2, 3, 4, 5, 6, 7];
            }, 10);
            h.setMode('B');
            verifyDepSet(h.node, h.signals.slice(0, 8));
            verifyIntegrity(h.node);
        });

        test("splice new deps between existing", () => {
            const h = harness(kind, (m, s) => {
                if (m === 'A') {
                    return [0, 1, 2];
                }
                return [0, 5, 6, 7, 1, 2];
            }, 10);
            h.setMode('B');
            verifyDepSet(h.node, [
                h.signals[0], h.signals[1], h.signals[2],
                h.signals[5], h.signals[6], h.signals[7],
            ]);
            verifyIntegrity(h.node);
        });

        test("replace all deps with new set (same size)", () => {
            const h = harness(kind, (m, s) => {
                if (m === 'A') {
                    return [0, 1, 2];
                }
                return [5, 6, 7];
            }, 10);
            h.setMode('B');
            verifyDepSet(h.node, [h.signals[5], h.signals[6], h.signals[7]]);
            verifyIntegrity(h.node);
            verifyDropped(h.node, [h.signals[0], h.signals[1], h.signals[2]]);
        });

        test("replace all deps with fewer deps", () => {
            const h = harness(kind, (m, s) => {
                if (m === 'A') {
                    return [0, 1, 2, 3, 4];
                }
                return [5, 6];
            }, 10);
            h.setMode('B');
            verifyDepSet(h.node, [h.signals[5], h.signals[6]]);
            verifyIntegrity(h.node);
            verifyDropped(h.node, [h.signals[0], h.signals[1], h.signals[2], h.signals[3], h.signals[4]]);
        });

        test("replace all deps with more deps", () => {
            const h = harness(kind, (m, s) => {
                if (m === 'A') {
                    return [0, 1];
                }
                return [5, 6, 7, 8, 9];
            }, 10);
            h.setMode('B');
            verifyDepSet(h.node, [h.signals[5], h.signals[6], h.signals[7], h.signals[8], h.signals[9]]);
            verifyIntegrity(h.node);
            verifyDropped(h.node, [h.signals[0], h.signals[1]]);
        });

        test("shuffle deps (same set, different read order)", () => {
            const h = harness(kind, (m, s) => {
                if (m === 'A') {
                    return [0, 1, 2, 3];
                }
                return [3, 0, 2, 1];
            }, 5);
            h.setMode('B');
            verifyDepSet(h.node, [h.signals[0], h.signals[1], h.signals[2], h.signals[3]]);
            verifyIntegrity(h.node);
        });

        test("keep every other dep (0, 2, 4 of 0..5)", () => {
            const h = harness(kind, (m, s) => {
                if (m === 'A') {
                    return [0, 1, 2, 3, 4, 5];
                }
                return [0, 2, 4];
            }, 7);
            h.setMode('B');
            verifyDepSet(h.node, [h.signals[0], h.signals[2], h.signals[4]]);
            verifyIntegrity(h.node);
            verifyDropped(h.node, [h.signals[1], h.signals[3], h.signals[5]]);
        });

        test("keep every other dep including dep1 drop", () => {
            /** dep1 = s0, drop s0, s2, s4. Keep s1, s3, s5. */
            const h = harness(kind, (m, s) => {
                if (m === 'A') {
                    return [0, 1, 2, 3, 4, 5];
                }
                return [1, 3, 5];
            }, 7);
            h.setMode('B');
            verifyDepSet(h.node, [h.signals[1], h.signals[3], h.signals[5]]);
            verifyIntegrity(h.node);
            verifyDropped(h.node, [h.signals[0], h.signals[2], h.signals[4]]);
        });

        test("transition many -> 1 -> many (FLAG_SINGLE flips)", () => {
            const h = harness(kind, (m, s) => {
                if (m === 'A') {
                    return [0, 1, 2, 3];
                }
                if (m === 'B') {
                    return [2];
                }
                return [4, 5, 6, 7];
            }, 10);
            h.setMode('B');
            verifyDepSet(h.node, [h.signals[2]]);
            verifyIntegrity(h.node);
            expect((h.node._flag & FLAG_SINGLE) !== 0).toBe(true);
            h.setMode('C');
            verifyDepSet(h.node, h.signals.slice(4, 8));
            verifyIntegrity(h.node);
            expect((h.node._flag & FLAG_SINGLE) !== 0).toBe(false);
        });

        test("transition 2-dep <-> 1-dep", () => {
            const h = harness(kind, (m, s) => {
                if (m === 'A') {
                    return [0, 1];
                }
                if (m === 'B') {
                    return [0];
                }
                return [0, 1];
            }, 3);
            verifyIntegrity(h.node);
            expect((h.node._flag & FLAG_SINGLE) !== 0).toBe(false);
            h.setMode('B');
            verifyDepSet(h.node, [h.signals[0]]);
            verifyIntegrity(h.node);
            expect((h.node._flag & FLAG_SINGLE) !== 0).toBe(true);
            h.setMode('C');
            verifyDepSet(h.node, [h.signals[0], h.signals[1]]);
            verifyIntegrity(h.node);
            expect((h.node._flag & FLAG_SINGLE) !== 0).toBe(false);
        });

        test("drop dep1, add new dep, keep others", () => {
            /** Setup: dep1 = s0, _deps = [s1, s2]. Re-run: drop s0, add
             *  s3 and s4. The new deps should fill dep1 + _deps cleanly. */
            const h = harness(kind, (m, s) => {
                if (m === 'A') {
                    return [0, 1, 2];
                }
                return [3, 1, 2, 4];
            }, 6);
            h.setMode('B');
            verifyDepSet(h.node, [h.signals[1], h.signals[2], h.signals[3], h.signals[4]]);
            verifyIntegrity(h.node);
            verifyDropped(h.node, [h.signals[0]]);
        });

        test("three consecutive re-runs with different dep sets", () => {
            const h = harness(kind, (m, s) => {
                if (m === 'A') {
                    return [0, 1, 2];
                }
                if (m === 'B') {
                    return [2, 3, 4];
                }
                if (m === 'C') {
                    return [5];
                }
                return [0, 3, 5, 7];
            }, 10);
            h.setMode('B');
            verifyDepSet(h.node, [h.signals[2], h.signals[3], h.signals[4]]);
            verifyIntegrity(h.node);
            h.setMode('C');
            verifyDepSet(h.node, [h.signals[5]]);
            verifyIntegrity(h.node);
            h.setMode('D');
            verifyDepSet(h.node, [h.signals[0], h.signals[3], h.signals[5], h.signals[7]]);
            verifyIntegrity(h.node);
        });

        test("dep1 drop + simultaneous new deps (fill from new)", () => {
            const h = harness(kind, (m, s) => {
                if (m === 'A') {
                    return [0];
                }
                return [1, 2, 3];
            }, 5);
            h.setMode('B');
            verifyDepSet(h.node, [h.signals[1], h.signals[2], h.signals[3]]);
            verifyIntegrity(h.node);
            verifyDropped(h.node, [h.signals[0]]);
        });
    });
}

describe("patchDeps -- post-drop notify (checkRun must tolerate state)", () => {
    test("compute: re-notify after dep1 drop with multi-dep array", () => {
        /**
         * The failure mode: after a dep1-drop leaves `_dep1 === null`
         * with `_deps.length > 0`, the node is still subscribed to a
         * compute dep. When that compute goes PENDING, reading this
         * node in a non-IDLE context hits `checkRun`, which reads
         * `node._dep1._flag` directly -- NPE.
         */
        const sX = signal(1);
        const sY = signal(2);
        const cX = c.compute(cx => cx.val(sX));
        const cY = c.compute(cx => cx.val(sY));

        let mode = 'A';
        let test2;
        const r = root(r => {
            test2 = c.compute(cx => {
                if (mode === 'A') {
                    cx.val(sX);
                }
                cx.val(cX);
                cx.val(cY);
            });
            r.effect(cx => cx.val(test2));
        });

        mode = 'B';
        sX.set(99); // Drops sX (was dep1). Leaves test2 in the buggy state.

        expect(() => sY.set(123)).not.toThrow();
        r.dispose();
    });

    test("effect: re-notify after dep1 drop with multi-dep array", () => {
        const sX = signal(1);
        const sY = signal(2);
        const cX = c.compute(cx => cx.val(sX));
        const cY = c.compute(cx => cx.val(sY));

        let mode = 'A';
        const r = root(r => {
            r.effect(cx => {
                if (mode === 'A') {
                    cx.val(sX);
                }
                cx.val(cX);
                cx.val(cY);
            });
        });

        mode = 'B';
        sX.set(99);
        expect(() => sY.set(123)).not.toThrow();
        r.dispose();
    });
});
