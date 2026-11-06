import { describe, test, expect } from "#test-runner";
import {
    signal,
    resource,
    root,
    batch,
    flush,
    c,
    REFUSE,
    PANIC,
    FATAL,
    OPT_DEFER,
    OPT_STABLE,
    OPT_SETUP,
    OPT_WEAK,
    OPT_EAGER
} from "#anod-src";
import { spawnSync } from "node:child_process";

/**
 * Adversarial tests for the reactive graph: dependency tracking,
 * propagation and the evaluation options. Tests that are known to
 * fail carry a comment above them with expected vs actual and the
 * root cause in src/internal.js.
 */

const FLAG_DISPOSED = 1 << 3;

/** Counts live occurrences of `node` in `sender`'s subscriber list. */
function subCount(sender, node) {
    let count = 0;
    if (sender._sub1 === node) {
        count++;
    }
    if (sender._subs !== null) {
        for (let i = 0; i < sender._subs.length; i += 2) {
            if (sender._subs[i] === node) {
                count++;
            }
        }
    }
    return count;
}

/** Collects `_dep1` + `_deps` of a receiver. */
function depsOf(node) {
    const out = [];
    if (node._dep1 !== null) {
        out.push(node._dep1);
    }
    if (node._deps !== null) {
        for (let i = 0; i < node._deps.length; i += 2) {
            out.push(node._deps[i]);
        }
    }
    return out;
}

/** Every dep has exactly one back-pointer to `node`, no dep listed twice. */
function expectIntegrity(node) {
    const deps = depsOf(node);
    expect(new Set(deps).size).toBe(deps.length);
    for (const dep of deps) {
        expect(subCount(dep, node)).toBe(1);
    }
}

describe("dynamic dependencies", () => {
    test("switching branches stops reacting to the inactive branch", () => {
        const cond = signal(true);
        const a = signal("a");
        const b = signal("b");
        let runs = 0;
        const pick = c.compute((cx) => {
            runs++;
            return cx.val(cond) ? cx.val(a) : cx.val(b);
        });
        const seen = [];
        c.effect((cx) => {
            seen.push(cx.val(pick));
        });
        b.set("b2");
        expect(runs).toBe(1);
        cond.set(false);
        expect(seen).toEqual(["a", "b2"]);
        a.set("a2");
        expect(runs).toBe(2);
        b.set("b3");
        cond.set(true);
        expect(seen).toEqual(["a", "b2", "b3", "a2"]);
        expectIntegrity(pick);
    });

    /**
     * BUG. Expected: after the effect stops reading `s`, writes to `s` no
     * longer re-run it. Actual: it re-runs on every write to `s`.
     * Root cause: clearReceiver (src/internal.js:3003-3027) only bumps
     * `_tombstones` when the receiver sits in `_subs` (not `_sub1`); the
     * entry stays in place, and `_purge` (src/internal.js:877-916) only
     * compacts FLAG_DISPOSED entries, so a live receiver that dropped
     * the dep is never removed and notify() (src/internal.js:3374) keeps
     * waking it.
     */
    test("a dep dropped while the receiver sits in a shared _subs array no longer wakes it", () => {
        const s = signal(0);
        const mode = signal(true);
        const t = signal(0);
        /** Occupy `_sub1` so the dynamic effect lands in `s._subs`. */
        c.effect((cx) => {
            cx.val(s);
        });
        let runs = 0;
        c.effect((cx) => {
            runs++;
            if (cx.val(mode)) {
                cx.val(s);
            } else {
                cx.val(t);
            }
        });
        for (let i = 0; i < 4; i++) {
            c.effect((cx) => {
                cx.val(s);
            });
        }
        mode.set(false);
        expect(runs).toBe(2);
        s.set(1);
        s.set(2);
        expect(runs).toBe(2);
    });

    /**
     * BUG. Expected: toggling a dynamic dep on and off keeps at most one
     * entry for the receiver in the sender's subscriber list. Actual:
     * every re-subscribe appends a new entry while the old one is never
     * removed (20 toggles -> 21 entries), so `_subs` grows without
     * bound on a live node. Same root cause as above: clearReceiver
     * (src/internal.js:3003) leaves the entry, `_purge`
     * (src/internal.js:895, 911) only drops FLAG_DISPOSED entries, and
     * patchDeps (src/internal.js:3286-3299) connects again.
     */
    test("toggling a dep on and off does not grow the sender's subscriber list", () => {
        const s = signal(0);
        for (let i = 0; i < 4; i++) {
            c.effect((cx) => {
                cx.val(s);
            });
        }
        const mode = signal(true);
        const e = c.effect((cx) => {
            if (cx.val(mode)) {
                cx.val(s);
            }
        });
        for (let i = 0; i < 20; i++) {
            mode.set(false);
            mode.set(true);
        }
        expect(subCount(s, e)).toBe(1);
    });

    test("reading the same sender several times in one run subscribes once", () => {
        const s = signal(1);
        const x = c.compute((cx) => cx.val(s) * 2);
        let runs = 0;
        const e = c.effect((cx) => {
            runs++;
            cx.val(s);
            cx.val(x);
            cx.val(s);
            cx.val(x);
            cx.val(s);
        });
        expect(depsOf(e).length).toBe(2);
        expectIntegrity(e);
        s.set(2);
        expect(runs).toBe(2);
        expectIntegrity(e);
        expect(subCount(s, x)).toBe(1);
    });

    test("1 -> 2 -> 3 -> 1 dep transitions keep tracking exact", () => {
        const sigs = [signal(0), signal(0), signal(0)];
        const width = signal(1);
        let runs = 0;
        const e = c.effect((cx) => {
            runs++;
            const n = cx.val(width);
            for (let i = 0; i < n; i++) {
                cx.val(sigs[i]);
            }
        });
        const bump = (i) => sigs[i].set(sigs[i].get() + 1);
        /** width 1: sigs[0] is read */
        bump(0);
        expect(runs).toBe(2);
        bump(1);
        expect(runs).toBe(2);
        width.set(2);
        expect(runs).toBe(3);
        bump(1);
        expect(runs).toBe(4);
        width.set(3);
        bump(2);
        expect(runs).toBe(6);
        width.set(1);
        expect(runs).toBe(7);
        bump(1);
        bump(2);
        expect(runs).toBe(7);
        bump(0);
        expect(runs).toBe(8);
        expectIntegrity(e);
        expect(depsOf(e).length).toBe(2);
    });

    test("150 deps: reverse order, then drop every other one, tracking stays exact", () => {
        const N = 150;
        const sigs = Array.from({ length: N }, (_, i) => signal(i));
        const mode = signal("forward");
        let runs = 0;
        const sum = c.compute((cx) => {
            runs++;
            const m = cx.val(mode);
            let total = 0;
            if (m === "forward") {
                for (let i = 0; i < N; i++) {
                    total += cx.val(sigs[i]);
                }
            } else if (m === "reverse") {
                for (let i = N - 1; i >= 0; i--) {
                    total += cx.val(sigs[i]);
                }
            } else {
                for (let i = 0; i < N; i += 2) {
                    total += cx.val(sigs[i]);
                }
            }
            return total;
        });
        const seen = [];
        c.effect((cx) => {
            seen.push(cx.val(sum));
        });
        const full = (N * (N - 1)) / 2;
        expect(sum.get()).toBe(full);
        mode.set("reverse");
        expect(sum.get()).toBe(full);
        expectIntegrity(sum);
        sigs[N - 1].set(N - 1 + 10);
        expect(sum.get()).toBe(full + 10);
        mode.set("even");
        expectIntegrity(sum);
        expect(depsOf(sum).length).toBe(N / 2 + 1);
        const before = runs;
        sigs[1].set(1000);
        sigs[N - 1].set(-5);
        expect(runs).toBe(before);
        sigs[2].set(2 + 7);
        expect(runs).toBe(before + 1);
        let even = 0;
        for (let i = 0; i < N; i += 2) {
            even += sigs[i].get();
        }
        expect(seen[seen.length - 1]).toBe(even);
    });

    test("dep order changing between runs keeps one subscription per dep", () => {
        const a = signal(1);
        const b = signal(2);
        const d = signal(3);
        const order = signal(0);
        const orders = [
            [a, b, d],
            [d, b, a],
            [b, d, a],
            [a, d],
            [d, a, b]
        ];
        let runs = 0;
        const e = c.effect((cx) => {
            runs++;
            for (const s of orders[cx.val(order)]) {
                cx.val(s);
            }
        });
        for (let i = 1; i < orders.length; i++) {
            order.set(i);
            expectIntegrity(e);
            expect(new Set(depsOf(e))).toEqual(new Set([order, ...orders[i]]));
        }
        const r = runs;
        a.set(10);
        b.set(20);
        d.set(30);
        expect(runs).toBe(r + 3);
    });

    /**
     * BUG. Expected: a weak compute that read nothing, was released, and
     * is then re-evaluated reading `x`, tracks `x` and reports the new
     * value after `x` changes. Actual: `w.get()` returns the stale 2.
     * Root cause: patchDeps (src/internal.js:3286-3292) handles "no dep1
     * yet" by connecting the first new dep and writing it to `deps[i]`
     * without assigning `node._dep1` or advancing `tail`; with tail still
     * 0 the dep1 promotion (src/internal.js:3303) is skipped and the
     * `tail === 0` branch nulls `_deps`, so the node ends up with no deps
     * while `x` still lists it as a subscriber. (A dep-less node only
     * re-runs once released by OPT_WEAK, which marks it STALE.)
     */
    test("weak compute with no deps keeps the dep it picks up after release", () => {
        let mode = false;
        const a = signal(1);
        const x = c.compute((cx) => cx.val(a) * 2);
        const w = c.compute((cx) => (mode ? cx.val(x) : 0), undefined, OPT_WEAK);
        const e = c.effect((cx) => {
            cx.val(w);
        });
        e.dispose();
        mode = true;
        expect(w.get()).toBe(2);
        a.set(2);
        expect(w.get()).toBe(4);
    });

    /**
     * BUG. Same setup, but the released weak compute is read by an
     * effect. Expected: the effect sees [2, 4]. Actual: `a.set(2)` throws
     * "null is not an object (evaluating 'dep._flag')". Root cause: the
     * same patchDeps bug (src/internal.js:3286-3292) leaves `_dep1`
     * null on a PENDING node, and checkRun dereferences it
     * (src/internal.js:3483, 3490).
     */
    test("weak compute with no deps, re-read by an effect, does not crash checkRun", () => {
        let mode = false;
        const a = signal(1);
        const x = c.compute((cx) => cx.val(a) * 2);
        const w = c.compute((cx) => (mode ? cx.val(x) : 0), undefined, OPT_WEAK);
        const e = c.effect((cx) => {
            cx.val(w);
        });
        e.dispose();
        mode = true;
        const seen = [];
        root((r) => {
            r.effect((cx) => {
                seen.push(cx.val(w));
            });
        });
        expect(() => a.set(2)).not.toThrow();
        expect(seen).toEqual([2, 4]);
    });

    /**
     * BUG. Expected: a compute that stops reading its only dep `y` (a
     * compute other effects also read) keeps working when `y` changes
     * again. Actual: the second write throws "null is not an object
     * (evaluating 'dep._flag')". Root cause: two defects combine.
     * clearReceiver (src/internal.js:3003-3027) leaves `x` in `y._subs`,
     * so `y` keeps notifying it PENDING; and patchDeps, after dropping
     * dep1 with nothing left (src/internal.js:3231-3241), returns without
     * clearing FLAG_SINGLE, so _refresh -> checkSingle dereferences the
     * null `_dep1` (src/internal.js:3457-3458).
     */
    test("compute that stops reading its only shared compute dep survives later writes", () => {
        const s = signal(1);
        const y = c.compute((cx) => cx.val(s) * 2);
        /** Two other readers so `x` lands in `y._subs`, not `y._sub1`. */
        c.effect((cx) => {
            cx.val(y);
        });
        c.effect((cx) => {
            cx.val(y);
        });
        let use = true;
        const x = c.compute((cx) => (use ? cx.val(y) : -1));
        const trig = signal(0);
        const seen = [];
        c.effect((cx) => {
            cx.val(trig);
            seen.push(cx.val(x));
        });
        use = false;
        s.set(2);
        expect(() => s.set(3)).not.toThrow();
        expect(seen).toEqual([2, -1]);
    });

    /**
     * BUG. Expected: a task that reads `a` before an await and the compute
     * `xc` after it re-runs when `xc` changes, and the effect sees 201.
     * Actual: the task never re-runs; seen stays ["loading", 101] and
     * t.get() stays 101. Root cause: subscribe(), used for reads while
     * FLAG_LOADING (src/internal.js:2949-2962), appends to `_deps` but
     * does not clear FLAG_SINGLE (unlike _read, src/internal.js:751-752),
     * which setup set because only `a` was read synchronously
     * (src/internal.js:2386-2387). checkSingle (src/internal.js:3456)
     * then only checks `a` and clears the PENDING flag.
     */
    test("task re-runs when a compute it read after an await changes", async () => {
        const a = signal(1);
        const s = signal(1);
        const xc = c.compute((cx) => cx.val(s) * 100);
        const t = c.task(async (cx) => {
            const v = cx.val(a);
            await cx.suspend(Promise.resolve());
            return v + cx.val(xc);
        });
        const seen = [];
        const app = root((r) => {
            r.effect((cx) => {
                seen.push(cx.pending(t) ? "loading" : cx.val(t));
            });
        });
        await new Promise((r) => setTimeout(r, 10));
        expect(seen).toEqual(["loading", 101]);
        s.set(2);
        await new Promise((r) => setTimeout(r, 10));
        expect(seen[seen.length - 1]).toBe(201);
        app.dispose();
    });

    test("bound computes mixed with dynamic reads in one effect", () => {
        const a = signal(1);
        const b = signal(10);
        const useB = signal(false);
        const doubled = c.compute(a, (v) => v * 2);
        const tripled = c.compute(b, (v) => v * 3);
        const seen = [];
        const e = c.effect((cx) => {
            let v = cx.val(doubled);
            if (cx.val(useB)) {
                v += cx.val(tripled);
            }
            seen.push(v);
        });
        b.set(11);
        expect(seen).toEqual([2]);
        useB.set(true);
        expect(seen).toEqual([2, 35]);
        a.set(2);
        b.set(12);
        expect(seen).toEqual([2, 35, 37, 40]);
        useB.set(false);
        b.set(13);
        expect(seen).toEqual([2, 35, 37, 40, 4]);
        expectIntegrity(e);
    });
});

describe("version stamping across nesting", () => {
    test("outer effect reads A, pulls a stale inner compute that reads A, reads A again", () => {
        const a = signal(1);
        const gate = signal(false);
        const extra = signal(0);
        let innerRuns = 0;
        const inner = c.compute((cx) => {
            innerRuns++;
            return cx.val(a) + 100;
        });
        let runs = 0;
        const seen = [];
        const e = c.effect((cx) => {
            runs++;
            const x = cx.val(a);
            if (cx.val(gate)) {
                cx.val(extra);
            }
            const y = cx.val(inner);
            seen.push([x, y, cx.val(a)]);
        });
        /** Make both a and the dep set change in one run, forcing patchDeps. */
        batch(() => {
            a.set(2);
            gate.set(true);
        });
        expect(seen[seen.length - 1]).toEqual([2, 102, 2]);
        expectIntegrity(e);
        expectIntegrity(inner);
        a.set(3);
        expect(seen[seen.length - 1]).toEqual([3, 103, 3]);
        gate.set(false);
        a.set(4);
        expect(seen[seen.length - 1]).toEqual([4, 104, 4]);
        expectIntegrity(e);
        expect(new Set(depsOf(e))).toEqual(new Set([a, gate, inner]));
    });

    test("sibling computes share deps but read them in opposite orders", () => {
        const a = signal(1);
        const b = signal(2);
        const flip = signal(false);
        const left = c.compute((cx) => (cx.val(flip) ? cx.val(b) * 10 + cx.val(a) : cx.val(a) * 10 + cx.val(b)));
        const right = c.compute((cx) => (cx.val(flip) ? cx.val(a) - cx.val(b) : cx.val(b) - cx.val(a)));
        const seen = [];
        const e = c.effect((cx) => {
            const l = cx.val(left);
            const x = cx.val(a);
            const r = cx.val(right);
            seen.push([l, x, r, cx.val(b)]);
        });
        flip.set(true);
        expect(seen[seen.length - 1]).toEqual([21, 1, -1, 2]);
        batch(() => {
            a.set(5);
            flip.set(false);
        });
        expect(seen[seen.length - 1]).toEqual([52, 5, -3, 2]);
        b.set(7);
        expect(seen[seen.length - 1]).toEqual([57, 5, 2, 7]);
        expectIntegrity(e);
        expectIntegrity(left);
        expectIntegrity(right);
    });

    test("deferred compute first evaluated inside a running effect tracks its own deps", () => {
        const a = signal(1);
        const b = signal(2);
        let lazyRuns = 0;
        const lazy = c.compute((cx) => {
            lazyRuns++;
            return cx.val(a) + cx.val(b);
        }, undefined, OPT_DEFER);
        expect(lazyRuns).toBe(0);
        const seen = [];
        const e = c.effect((cx) => {
            const x = cx.val(a);
            seen.push(x + cx.val(lazy));
        });
        expect(seen).toEqual([4]);
        b.set(3);
        expect(seen).toEqual([4, 5]);
        a.set(2);
        expect(seen).toEqual([4, 5, 7]);
        expectIntegrity(e);
        expectIntegrity(lazy);
        expect(new Set(depsOf(e))).toEqual(new Set([a, lazy]));
    });

    test("compute created inside an effect run reads a dep the effect already read", () => {
        const a = signal(1);
        const b = signal(1);
        const seen = [];
        let made = null;
        const r = root((r) => {
            r.effect((cx) => {
                const x = cx.val(a);
                made = cx.compute((c2) => c2.val(a) + c2.val(b));
                seen.push([x, cx.val(made), cx.val(a)]);
            });
        });
        a.set(2);
        b.set(5);
        expect(seen).toEqual([[1, 2, 1], [2, 3, 2], [2, 7, 2]]);
        expectIntegrity(made);
        r.dispose();
    });

    /**
     * BUG. Expected: the effect keeps its subscription to `a` and re-runs
     * on `a.set(3)` (runs 2 -> 3). Actual: runs stays 2, `a` was
     * dropped. Root cause: root() sets IDLE = true while its callback
     * runs (src/internal.js:4144-4145), so `x.get()` inside it takes the
     * top-level path and resets FENCE = SEED (src/internal.js:1969) in
     * the middle of the effect's run. `x`'s sweepDeps then no longer
     * sees the effect's stamp on `a` as a conflict
     * (src/internal.js:3343-3350) and overwrites it without saving it to
     * VSTACK, so the effect's patchDeps (src/internal.js:3252-3256) treats
     * `a` as unread and unsubscribes it.
     */
    test("nested root: .get() of a stale compute inside an effect keeps the effect's deps", () => {
        const gate = signal(false);
        const a = signal(1);
        const extra = signal(0);
        const x = c.compute((cx) => cx.val(a) * 10);
        let runs = 0;
        c.effect((cx) => {
            runs++;
            if (cx.val(gate)) {
                cx.val(extra);
            }
            cx.val(a);
            root(() => {
                x.get();
            });
        });
        batch(() => {
            gate.set(true);
            a.set(2);
        });
        expect(runs).toBe(2);
        a.set(3);
        expect(runs).toBe(3);
    });

});

describe("glitch freedom", () => {
    test("deep diamond: effect runs once per write and sees consistent values", () => {
        const s = signal(1);
        let layer = [s];
        for (let d = 0; d < 6; d++) {
            const next = [];
            for (let w = 0; w < 3; w++) {
                const ups = layer;
                next.push(c.compute((cx) => {
                    let t = 0;
                    for (const u of ups) {
                        t += cx.val(u);
                    }
                    return t;
                }));
            }
            layer = next;
        }
        const seen = [];
        const tops = layer;
        c.effect((cx) => {
            seen.push(tops.map((t) => cx.val(t)));
        });
        /** Each layer multiplies by 3 (first by 1 since one upstream). */
        const expected = (v) => v * Math.pow(3, 5);
        s.set(2);
        s.set(3);
        expect(seen.length).toBe(3);
        for (let i = 0; i < 3; i++) {
            expect(seen[i]).toEqual([expected(i + 1), expected(i + 1), expected(i + 1)]);
        }
    });

    test("wide fan-out/fan-in of 100 computes: effect runs once with a consistent sum", () => {
        const s = signal(1);
        const mids = Array.from({ length: 100 }, (_, i) => c.compute((cx) => cx.val(s) + i));
        const total = c.compute((cx) => mids.reduce((acc, m) => acc + cx.val(m), 0));
        const seen = [];
        c.effect((cx) => {
            seen.push([cx.val(s), cx.val(total)]);
        });
        s.set(2);
        s.set(5);
        const sum = (v) => 100 * v + 4950;
        expect(seen).toEqual([[1, sum(1)], [2, sum(2)], [5, sum(5)]]);
    });

    test("diamond where one branch absorbs the change runs the effect once", () => {
        const s = signal(1);
        const parity = c.compute((cx) => cx.val(s) % 2);
        const half = c.compute((cx) => Math.floor(cx.val(s) / 2));
        let runs = 0;
        const seen = [];
        c.effect((cx) => {
            runs++;
            seen.push([cx.val(parity), cx.val(half)]);
        });
        s.set(3);
        expect(runs).toBe(2);
        s.set(5);
        expect(seen).toEqual([[1, 0], [1, 1], [1, 2]]);
        let parityRuns = 0;
        const p2 = c.compute((cx) => {
            parityRuns++;
            return cx.val(parity) * 10;
        });
        c.effect((cx) => {
            cx.val(p2);
        });
        s.set(7);
        expect(parityRuns).toBe(1);
    });

    test("multi-dep pending scan resumes correctly when only the last dep changed", () => {
        const s = signal(0);
        const thresholds = [100, 200, 300, 400, 5];
        const flags = thresholds.map((t) => c.compute((cx) => cx.val(s) >= t));
        let topRuns = 0;
        const top = c.compute((cx) => {
            topRuns++;
            return flags.map((f) => (cx.val(f) ? 1 : 0)).join("");
        });
        const seen = [];
        c.effect((cx) => {
            seen.push(cx.val(top));
        });
        s.set(1);
        expect(topRuns).toBe(1);
        s.set(6);
        expect(seen).toEqual(["00000", "00001"]);
        s.set(250);
        expect(seen).toEqual(["00000", "00001", "11001"]);
        s.set(260);
        expect(topRuns).toBe(3);
    });

    test("5000-deep pending chain propagates through the iterative checkRun", () => {
        const s = signal(0);
        let prev = c.compute((cx) => cx.val(s) % 2);
        for (let i = 0; i < 5000; i++) {
            const up = prev;
            prev = c.compute((cx) => cx.val(up) + 1);
        }
        const last = prev;
        const seen = [];
        c.effect((cx) => {
            seen.push(cx.val(last));
        });
        s.set(2);
        expect(seen).toEqual([5000]);
        s.set(3);
        expect(seen).toEqual([5000, 5001]);
    });
});

describe("lazy pull", () => {
    test("compute that gains and loses an observer keeps working lazily", () => {
        const s = signal(1);
        let runs = 0;
        const x = c.compute((cx) => {
            runs++;
            return cx.val(s) + 1;
        });
        const seen = [];
        const e = c.effect((cx) => {
            seen.push(cx.val(x));
        });
        s.set(2);
        expect(seen).toEqual([2, 3]);
        e.dispose();
        const r = runs;
        s.set(3);
        s.set(4);
        expect(runs).toBe(r);
        expect(x.get()).toBe(5);
        const e2 = c.effect((cx) => {
            seen.push(cx.val(x));
        });
        s.set(5);
        expect(seen).toEqual([2, 3, 5, 6]);
        e2.dispose();
    });

    test("pulling a pending compute whose upstream absorbed the change does not re-run it", () => {
        const s = signal(2);
        const isEven = c.compute((cx) => cx.val(s) % 2 === 0);
        let runs = 0;
        const label = c.compute((cx) => {
            runs++;
            return cx.val(isEven) ? "even" : "odd";
        });
        expect(label.get()).toBe("even");
        s.set(4);
        s.set(6);
        expect(label.get()).toBe("even");
        expect(runs).toBe(1);
        s.set(7);
        expect(label.get()).toBe("odd");
        expect(runs).toBe(2);
    });

    test("compute stale since it lost its observer is refreshed when an effect re-reads it", () => {
        const s = signal(1);
        const x = c.compute((cx) => cx.val(s) * 3);
        const show = signal(true);
        const seen = [];
        c.effect((cx) => {
            seen.push(cx.val(show) ? cx.val(x) : null);
        });
        show.set(false);
        s.set(2);
        s.set(3);
        show.set(true);
        expect(seen).toEqual([3, null, 9]);
    });
});

describe("cycles", () => {
    test("a compute reading itself stores an ILLEGAL_READ error", () => {
        let self = null;
        const s = signal(0);
        self = c.compute((cx) => {
            if (cx.val(s) > 0) {
                return cx.val(self);
            }
            return 1;
        });
        expect(self.get()).toBe(1);
        s.set(1);
        const v = self.get();
        expect(self.error).toBe(true);
        expect(v.type).toBe(FATAL);
        expect(v.error.message).toBe("Cannot read a disposed node or yourself");
    });

    /**
     * BUG. Expected: pulling a node of a cycle terminates (with a value
     * or an error). Actual: the process spins forever. Root cause: in
     * checkRun's fast descent (src/internal.js:3490-3500), `a._dep1 === b`
     * and `b._dep1 === a` are both PENDING-only, so the loop descends
     * a -> b -> a -> ... pushing onto CSTACK without bound. Run in a
     * child process with a timeout so the suite still terminates.
     */
    test("a cycle between pending computes does not hang checkRun", () => {
        const url = new URL("../../src/index.js", import.meta.url).href;
        const code = `
            import { signal, c } from ${JSON.stringify(url)};
            const s = signal(0);
            const s2 = signal(0);
            const x = c.compute((cx) => cx.val(s));
            const y = c.compute((cx) => cx.val(s2));
            let b = null;
            let mode = 0;
            const a = c.compute((cx) => mode === 0 ? cx.val(x) : cx.val(b) + cx.val(y));
            b = c.compute((cx) => cx.val(a) + 1);
            a.get(); b.get();
            mode = 1;
            s.set(1);
            a.get(); b.get();
            s2.set(1);
            a.get();
            console.log("terminated");
        `;
        const args = typeof Bun !== "undefined" ? ["-e", code] : ["--input-type=module", "-e", code];
        const res = spawnSync(process.execPath, args, { timeout: 4000, encoding: "utf8" });
        const timedOut = res.error !== undefined || res.signal !== null;
        expect(timedOut).toBe(false);
    });
});

describe("options", () => {
    test("OPT_STABLE: deps come from the first run only", () => {
        const flag = signal(false);
        const a = signal(1);
        let runs = 0;
        const x = c.compute((cx) => {
            runs++;
            return cx.val(flag) ? cx.val(a) : -1;
        }, undefined, OPT_STABLE);
        const seen = [];
        c.effect((cx) => {
            seen.push(cx.val(x));
        });
        flag.set(true);
        expect(seen).toEqual([-1, 1]);
        a.set(2);
        expect(seen).toEqual([-1, 1]);
        expect(runs).toBe(2);
        flag.set(false);
        flag.set(true);
        expect(seen).toEqual([-1, 1, -1, 2]);
    });

    /**
     * BUG (medium). Expected: "stable() ... freezes the dependencies in
     * place" (README), so an effect that calls stable() on a later run
     * keeps `b`, which it read in every run. Actual: `b` is dropped and
     * `b.set(5)` no longer re-runs it. Root cause: stable() flips
     * FLAG_STABLE mid-run (src/internal.js:1033), so later reads take
     * the untracked branch in val() (src/internal.js:463-468) and keep
     * their sweep stamp; patchDeps (src/internal.js:3224, 3252) then
     * treats them as unread and unsubscribes them.
     */
    test("stable() called on a later run keeps the deps read after the call", () => {
        const a = signal(1);
        const b = signal(1);
        const trig = signal(0);
        let runs = 0;
        c.effect((cx) => {
            runs++;
            cx.val(trig);
            if (cx.val(a) === 2) {
                cx.stable();
            }
            cx.val(b);
        });
        a.set(2);
        expect(runs).toBe(2);
        b.set(5);
        expect(runs).toBe(3);
    });

    /**
     * BUG (medium, OPT_SETUP is undocumented). Expected: a bound compute
     * created with OPT_SETUP that also reads `xc` in its setup run reacts
     * when `xc` changes, like it does when pulled with .get(). Actual:
     * the effect reading it never sees 201 (`seen` stays [101]) though
     * bound.get() is 201. Root cause: bound nodes start with FLAG_SINGLE
     * (src/internal.js:2802-2803) and the setup branch that stores the
     * extra deps (src/internal.js:2379-2385) never clears it, so
     * _refresh -> checkSingle (src/internal.js:2129-2130, 3456) only
     * checks dep1 and clears the PENDING flag.
     */
    test("bound compute with OPT_SETUP reacts to the extra deps it tracked", () => {
        const a = signal(1);
        const s = signal(1);
        const xc = c.compute((cx) => cx.val(s) * 100);
        const bound = c.compute(a, (v, cx) => v + cx.val(xc), undefined, OPT_SETUP);
        const seen = [];
        c.effect((cx) => {
            seen.push(cx.val(bound));
        });
        s.set(2);
        expect(seen).toEqual([101, 201]);
    });

    /**
     * BUG. Expected (README "Callback (resolve, reject)" example:
     * `c.effect(outgoing, (msg) => ws.send(msg), OPT_DEFER)` "OPT_DEFER
     * skips the initial run, so it only fires when outgoing actually
     * changes"): a bound effect with OPT_DEFER does not run on creation.
     * Actual: it runs immediately ([1, 2]). Root cause: effect() calls
     * startEffect(node) unconditionally (src/internal.js:2890), unlike
     * compute() which checks FLAG_DEFER (src/internal.js:2809).
     */
    test("bound effect with OPT_DEFER skips its initial run", () => {
        const s = signal(1);
        const seen = [];
        c.effect(s, (v) => {
            seen.push(v);
        }, OPT_DEFER);
        expect(seen).toEqual([]);
        s.set(2);
        expect(seen).toEqual([2]);
    });

    test("OPT_DEFER compute pulled first by an effect then tracks updates", () => {
        const s = signal(1);
        let runs = 0;
        const x = c.compute(s, (v) => {
            runs++;
            return v * 2;
        }, undefined, OPT_DEFER);
        s.set(2);
        expect(runs).toBe(0);
        const seen = [];
        c.effect((cx) => {
            seen.push(cx.val(x));
        });
        s.set(3);
        expect(seen).toEqual([4, 6]);
        expect(runs).toBe(2);
    });

    /**
     * BUG. Expected: compute.weak() exists, as documented in README
     * "weak()" (`parsed.weak()`) and declared on Compute in
     * types/internal.d.ts:159. Actual: TypeError, weak is not a
     * function. Root cause: ComputeProto defines eager() and stable()
     * (src/internal.js:1058, 1097) but no weak().
     */
    test("compute.weak() is available as documented", () => {
        const s = signal(1);
        const x = c.compute((cx) => cx.val(s));
        expect(typeof x.weak).toBe("function");
    });

    test("OPT_WEAK: released compute re-subscribes and updates when observed again", () => {
        const s = signal(1);
        let runs = 0;
        let cleanups = 0;
        const w = c.compute((cx) => {
            runs++;
            cx.cleanup(() => {
                cleanups++;
            });
            return cx.val(s) * 2;
        }, undefined, OPT_WEAK);
        const e1 = c.effect((cx) => {
            cx.val(w);
        });
        e1.dispose();
        expect(cleanups).toBe(1);
        expect(w._value).toBeUndefined();
        s.set(2);
        expect(runs).toBe(1);
        const seen = [];
        const e2 = c.effect((cx) => {
            seen.push(cx.val(w));
        });
        s.set(3);
        expect(seen).toEqual([4, 6]);
        expect(runs).toBe(3);
        e2.dispose();
        expect(cleanups).toBe(3);
        expect(w.get()).toBe(6);
    });

    /**
     * A released weak compute keeps nothing from its previous life, not
     * even its seed: the seed is the first prev, and releasing drops
     * prev. The recompute gets undefined as prev, so a default
     * parameter reapplies on every fresh activation.
     */
    test("OPT_WEAK: recompute after release gets undefined as prev, not the seed", () => {
        const s = signal(1);
        const prevs = [];
        const w = c.compute((cx, prev) => {
            prevs.push(prev);
            return cx.val(s);
        }, 100, OPT_WEAK);
        const e = c.effect((cx) => {
            cx.val(w);
        });
        e.dispose();
        expect(w._value).toBeUndefined();
        w.get();
        expect(prevs).toEqual([100, undefined]);
    });

    test("OPT_WEAK: a default parameter reapplies after release", () => {
        const s = signal(1);
        const w = c.compute((cx, prev = 100) => prev + cx.val(s), undefined, OPT_WEAK);
        const e = c.effect((cx) => {
            cx.val(w);
        });
        expect(w.get()).toBe(101);
        e.dispose();
        expect(w.get()).toBe(101);
    });

    test("OPT_WEAK: a seed mutated in place is not retained after release", () => {
        const s = signal(1);
        const seed = [];
        const w = c.compute((cx, prev) => {
            prev = prev || [];
            prev.push(cx.val(s));
            return prev;
        }, seed, OPT_WEAK);
        const e = c.effect((cx) => {
            cx.val(w);
        });
        s.set(2);
        expect(w.get()).toBe(seed);
        e.dispose();
        expect(w._value).toBeUndefined();
        const next = w.get();
        expect(next).not.toBe(seed);
        expect(next).toEqual([2]);
    });

    test("weak(): recompute after release gets undefined as prev", () => {
        const s = signal(1);
        const prevs = [];
        const w = c.compute((cx, prev) => {
            prevs.push(prev);
            return cx.val(s);
        }, 100);
        w.weak();
        const e = c.effect((cx) => {
            cx.val(w);
        });
        e.dispose();
        w.get();
        expect(prevs).toEqual([100, undefined]);
    });

    /**
     * BUG. Expected: an eager compute that recomputes to the same value
     * (1 -> 1) does not re-run its downstream effect, like a lazy compute.
     * Actual: the effect runs again (runs 2). Root cause:
     * Compute._receive for sync eager nodes marks subscribers FLAG_STALE
     * before recomputing (src/internal.js:2491-2494), and flushEffects
     * runs any STALE effect without a ctime check
     * (src/internal.js:4238-4240).
     */
    test("OPT_EAGER: recomputing to the same value does not re-run downstream effects", () => {
        const s = signal(1);
        const parity = c.compute((cx) => cx.val(s) % 2, undefined, OPT_EAGER);
        let runs = 0;
        c.effect((cx) => {
            cx.val(parity);
            runs++;
        });
        s.set(3);
        expect(runs).toBe(1);
    });

    /**
     * BUG. Expected: when the lazy upstream absorbs the change, the
     * eager compute is not even re-run and the effect does not run.
     * Actual: the effect runs (runs 2) although `eg` is still 10. Root
     * cause: the eager compute is only PENDING, but Compute._receive
     * notifies its subscribers with FLAG_STALE anyway
     * (src/internal.js:2491-2494).
     */
    test("OPT_EAGER: upstream compute absorbs the change, downstream effect stays idle", () => {
        const s = signal(1);
        const par = c.compute((cx) => cx.val(s) % 2);
        let egRuns = 0;
        const eg = c.compute((cx) => {
            egRuns++;
            return cx.val(par) * 10;
        }, undefined, OPT_EAGER);
        let runs = 0;
        c.effect((cx) => {
            cx.val(eg);
            runs++;
        });
        s.set(3);
        expect(egRuns).toBe(1);
        expect(runs).toBe(1);
    });

    test("OPT_EAGER: eager compute without subscribers recomputes on every write", () => {
        const s = signal(1);
        let runs = 0;
        const eg = c.compute((cx) => {
            runs++;
            return cx.val(s);
        }, undefined, OPT_EAGER);
        s.set(2);
        s.set(3);
        expect(runs).toBe(3);
        const lazy = c.compute((cx) => cx.val(s));
        lazy.eager();
        let runs2 = 0;
        const eg2 = c.compute((cx) => {
            runs2++;
            return cx.val(lazy) * 2;
        });
        eg2.eager();
        s.set(4);
        expect(runs).toBe(4);
        expect(runs2).toBe(2);
        expect(eg2._value).toBe(8);
        expect(eg._value).toBe(4);
    });

    test("c.equal(false) forces a re-check downstream, but an unchanged middle stops it", () => {
        const s = signal(1);
        const top = c.compute((cx) => {
            cx.val(s);
            cx.equal(false);
            return 42;
        });
        let midRuns = 0;
        const mid = c.compute((cx) => {
            midRuns++;
            return cx.val(top) > 0;
        });
        let direct = 0;
        let viaMid = 0;
        c.effect((cx) => {
            cx.val(top);
            direct++;
        });
        c.effect((cx) => {
            cx.val(mid);
            viaMid++;
        });
        s.set(2);
        expect(direct).toBe(2);
        expect(midRuns).toBe(2);
        expect(viaMid).toBe(1);
    });

    test("pause()/resume() inside a batch with pending updates runs once with the latest value", () => {
        const s = signal(0);
        const x = c.compute((cx) => cx.val(s) * 2);
        const seen = [];
        const e = c.effect((cx) => {
            seen.push(cx.val(x));
        });
        e.pause();
        s.set(1);
        s.set(2);
        expect(seen).toEqual([0]);
        batch(() => {
            s.set(3);
            e.resume();
            s.set(4);
        });
        expect(seen).toEqual([0, 8]);
        batch(() => {
            e.pause();
            s.set(5);
        });
        expect(seen).toEqual([0, 8]);
        e.resume();
        expect(seen).toEqual([0, 8, 10]);
    });

    test("resume() of a pending-only effect whose upstream absorbed the change does not run it", () => {
        const s = signal(2);
        const even = c.compute((cx) => cx.val(s) % 2 === 0);
        let runs = 0;
        const e = c.effect((cx) => {
            cx.val(even);
            runs++;
        });
        e.pause();
        s.set(4);
        e.resume();
        expect(runs).toBe(1);
        s.set(5);
        expect(runs).toBe(2);
    });

    /**
     * BUG (medium). Expected: an effect paused by a sibling earlier in the
     * same flush does not run ("While paused ... defers all
     * re-evaluation until resume()"). Actual: it runs (2), and since its
     * flags are cleared by that run, resume() has nothing to replay.
     * Root cause: pause() only sets FLAG_PAUSED (src/internal.js:1124),
     * which notify() honours, but an effect already queued in RECEIVERS
     * is run by flushEffects without checking FLAG_PAUSED
     * (src/internal.js:4238-4240).
     */
    test("an effect paused by a sibling during the flush does not run", () => {
        const s = signal(0);
        let e2runs = 0;
        let e2 = null;
        c.effect((cx) => {
            if (cx.val(s) === 1) {
                e2.pause();
            }
        });
        e2 = c.effect((cx) => {
            cx.val(s);
            e2runs++;
        });
        s.set(1);
        expect(e2runs).toBe(1);
        e2.resume();
        expect(e2runs).toBe(2);
    });
});

describe("nested creation and disposed deps", () => {
    test("owned compute is disposed on re-run; reading the old one throws ILLEGAL_READ", () => {
        const s = signal(1);
        const computes = [];
        const app = root((r) => {
            r.effect((cx) => {
                const local = signal(cx.val(s) * 10);
                const x = cx.compute((c2) => c2.val(local) + 1);
                computes.push(x);
                cx.val(x);
            });
        });
        s.set(2);
        expect(computes.length).toBe(2);
        expect(computes[0].disposed).toBe(true);
        expect(computes[1].get()).toBe(21);
        let caught = null;
        const reader = c.compute((cx) => {
            try {
                cx.val(computes[0]);
            } catch (e) {
                caught = e.message;
            }
            return 0;
        });
        reader.get();
        expect(caught).toBe("Cannot read a disposed node or yourself");
        app.dispose();
    });

    test("an effect whose dep was disposed stops reacting and re-reading it throws", () => {
        const a = signal(1);
        const b = signal(1);
        const errors = [];
        let runs = 0;
        const app = root((r) => {
            r.recover((err) => {
                errors.push(err.error.message);
                return true;
            });
            r.effect((cx) => {
                runs++;
                cx.val(a);
                cx.val(b);
            });
        });
        a.dispose();
        expect(runs).toBe(1);
        b.set(2);
        expect(runs).toBe(2);
        expect(errors).toEqual(["Cannot read a disposed node or yourself"]);
        app.dispose();
    });

    /**
     * BUG. Expected: every c.val() of a compute in error state throws.
     * Actual: the first read throws, the second read in the same run
     * returns the { error, type } POJO as if it were a value. Root
     * cause: the "already read this run" fast path in val()
     * (src/internal.js:457-459) returns `sender._value` before the
     * FLAG_ERROR check (src/internal.js:475-477).
     */
    test("reading the same errored compute twice in one run throws both times", () => {
        const bad = c.compute(() => {
            throw new Error("boom");
        });
        const r = c.compute((cx) => {
            const out = [];
            for (let i = 0; i < 2; i++) {
                try {
                    cx.val(bad);
                    out.push("value");
                } catch (e) {
                    out.push("threw");
                }
            }
            return out;
        });
        expect(r.get()).toEqual(["threw", "threw"]);
    });

    test("effect that recovered from a compute error re-runs when the compute recovers", () => {
        const s = signal(1);
        const x = c.compute((cx) => {
            const v = cx.val(s);
            if (v < 0) {
                cx.panic("negative");
            }
            return v;
        });
        const seen = [];
        const errors = [];
        const app = root((r) => {
            r.effect((cx) => {
                cx.recover((err) => {
                    errors.push(err.type);
                    return true;
                });
                seen.push(cx.val(x));
            });
        });
        s.set(-1);
        s.set(5);
        expect(seen).toEqual([1, 5]);
        /** The compute's PANIC reaches the effect re-wrapped as FATAL, see
         *  the REFUSE propagation test above for the root cause. */
        expect(errors.length).toBe(1);
        app.dispose();
    });

    test("effect created in an effect reads a signal created in the same run", () => {
        const outer = signal(1);
        const seen = [];
        let local = null;
        const app = root((r) => {
            r.effect((cx) => {
                const n = cx.val(outer);
                local = signal(n * 100);
                cx.effect((c2) => {
                    seen.push(c2.val(local));
                });
            });
        });
        local.set(101);
        outer.set(2);
        local.set(201);
        expect(seen).toEqual([100, 101, 200, 201]);
        app.dispose();
    });
});

describe("subscriber bookkeeping", () => {
    test("disposing 40 of 50 subscribers: only the live ones run, subs compacted", () => {
        const s = signal(0);
        const runs = new Array(50).fill(0);
        const effects = [];
        for (let i = 0; i < 50; i++) {
            effects.push(c.effect((cx) => {
                cx.val(s);
                runs[i]++;
            }));
        }
        for (let i = 0; i < 50; i++) {
            if (i % 5 !== 0) {
                effects[i].dispose();
            }
        }
        s.set(1);
        for (let i = 0; i < 50; i++) {
            expect(runs[i]).toBe(i % 5 === 0 ? 2 : 1);
        }
        let live = s._sub1 !== null ? 1 : 0;
        const subs = s._subs || [];
        for (let i = 0; i < subs.length; i += 2) {
            if (!(subs[i]._flag & FLAG_DISPOSED)) {
                live++;
            }
        }
        expect(live).toBe(10);
        expect(subs.length / 2 + (s._sub1 !== null ? 1 : 0)).toBe(10);
    });

    test("an effect disposing a sibling of the same signal: the sibling stops by the next write", () => {
        const s = signal(0);
        let victim = null;
        let victimRuns = 0;
        c.effect((cx) => {
            if (cx.val(s) > 0) {
                victim.dispose();
            }
        });
        victim = c.effect((cx) => {
            cx.val(s);
            victimRuns++;
        });
        s.set(1);
        const after = victimRuns;
        expect(victim.disposed).toBe(true);
        s.set(2);
        expect(victimRuns).toBe(after);
    });

    test("an effect disposing itself mid-run does not run again", () => {
        const s = signal(0);
        let runs = 0;
        let self = null;
        self = c.effect((cx) => {
            runs++;
            if (cx.val(s) === 1) {
                self.dispose();
            }
        });
        s.set(1);
        s.set(2);
        expect(runs).toBe(2);
        expect(self.disposed).toBe(true);
    });

    test("subscriber dropped from _sub1 by dynamic switch gets the slot back cleanly", () => {
        const s = signal(0);
        const mode = signal(true);
        let runs = 0;
        const e = c.effect((cx) => {
            runs++;
            if (cx.val(mode)) {
                cx.val(s);
            }
        });
        const other = c.effect((cx) => {
            cx.val(s);
        });
        mode.set(false);
        mode.set(true);
        expect(subCount(s, e)).toBe(1);
        expect(subCount(s, other)).toBe(1);
        const r = runs;
        s.set(1);
        expect(runs).toBe(r + 1);
    });

});
