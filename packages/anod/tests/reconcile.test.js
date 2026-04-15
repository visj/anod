import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { signal, compute, effect, batch } from "./_helper.js";

/**
 * Helper: create N signals with values 0..N-1
 */
function signals(n) {
    const arr = [];
    for (let i = 0; i < n; i++) {
        arr.push(signal(i));
    }
    return arr;
}

/**
 * Helper: trigger a recompute by changing a signal, then pull the value
 */
function poke(s, v) {
    s.set(v);
}

describe("reconcile", () => {

    describe("basic dep changes", () => {
        it("drop dep1, keep deps", () => {
            const [a, b, c] = signals(3);
            let gate = true;
            const comp = compute((r) => {
                if (gate) {
                    r.read(a);
                }
                return r.read(b) + r.read(c);
            });
            comp.val();
            gate = false;
            poke(b, 10);
            assert.strictEqual(comp.val(), 10 + 2);
            /** a should be disconnected — changing it shouldn't trigger */
            poke(a, 99);
            assert.strictEqual(comp.val(), 10 + 2);
        });

        it("drop all deps, add completely new set", () => {
            const [a, b, c, d, e] = signals(5);
            let phase = 0;
            const comp = compute((r) => {
                if (phase === 0) {
                    return r.read(a) + r.read(b);
                } else {
                    return r.read(c) + r.read(d) + r.read(e);
                }
            });
            comp.val();
            phase = 1;
            poke(a, 99);
            assert.strictEqual(comp.val(), 2 + 3 + 4);
            /** old deps disconnected */
            poke(b, 99);
            assert.strictEqual(comp.val(), 2 + 3 + 4);
            /** new deps work */
            poke(c, 10);
            assert.strictEqual(comp.val(), 10 + 3 + 4);
        });

        it("single dep1 only, never creates deps array", () => {
            const [a, b] = signals(2);
            let useA = true;
            const comp = compute((r) => {
                return useA ? r.read(a) : r.read(b);
            });
            assert.strictEqual(comp.val(), 0);
            useA = false;
            poke(a, 10);
            assert.strictEqual(comp.val(), 1);
            /** a is disconnected */
            poke(a, 20);
            assert.strictEqual(comp.val(), 1);
            /** b is connected */
            poke(b, 20);
            assert.strictEqual(comp.val(), 20);
        });

        it("dep1 stays, deps swap entirely", () => {
            const [a, b, c, d, e] = signals(5);
            let phase = 0;
            const comp = compute((r) => {
                r.read(a);
                if (phase === 0) {
                    return r.read(b) + r.read(c);
                } else {
                    return r.read(d) + r.read(e);
                }
            });
            comp.val();
            phase = 1;
            poke(a, 10);
            assert.strictEqual(comp.val(), 3 + 4);
            poke(b, 99);
            assert.strictEqual(comp.val(), 3 + 4);
            poke(d, 30);
            assert.strictEqual(comp.val(), 30 + 4);
        });
    });

    describe("reordering", () => {
        it("reverse dep1 and first dep", () => {
            const [a, b] = signals(2);
            let order = 0;
            const comp = compute((r) => {
                if (order === 0) {
                    return r.read(a) + r.read(b);
                } else {
                    return r.read(b) + r.read(a);
                }
            });
            assert.strictEqual(comp.val(), 0 + 1);
            order = 1;
            poke(a, 10);
            assert.strictEqual(comp.val(), 1 + 10);
            poke(b, 20);
            assert.strictEqual(comp.val(), 20 + 10);
        });

        it("reverse 3 deps: A B C → C B A", () => {
            const [a, b, c] = signals(3);
            let rev = false;
            const comp = compute((r) => {
                if (!rev) {
                    return r.read(a) * 100 + r.read(b) * 10 + r.read(c);
                } else {
                    return r.read(c) * 100 + r.read(b) * 10 + r.read(a);
                }
            });
            assert.strictEqual(comp.val(), 12);
            rev = true;
            poke(a, 5);
            assert.strictEqual(comp.val(), 215);
            poke(c, 9);
            assert.strictEqual(comp.val(), 915);
        });

        it("shift all deps by one: A B C D → D A B C", () => {
            const [a, b, c, d] = signals(4);
            let shifted = false;
            const comp = compute((r) => {
                if (!shifted) {
                    return r.read(a) + r.read(b) + r.read(c) + r.read(d);
                } else {
                    return r.read(d) + r.read(a) + r.read(b) + r.read(c);
                }
            });
            assert.strictEqual(comp.val(), 0 + 1 + 2 + 3);
            shifted = true;
            poke(a, 10);
            assert.strictEqual(comp.val(), 3 + 10 + 1 + 2);
        });
    });

    describe("drop middle deps", () => {
        it("10 deps, drop indices 4-7", () => {
            const sigs = signals(10);
            let dropMiddle = false;
            const comp = compute((r) => {
                let sum = 0;
                for (let i = 0; i < 10; i++) {
                    if (dropMiddle && i >= 4 && i <= 7) {
                        continue;
                    }
                    sum += r.read(sigs[i]);
                }
                return sum;
            });
            assert.strictEqual(comp.val(), 45);
            dropMiddle = true;
            poke(sigs[0], 100);
            /** sum = 100 + 1 + 2 + 3 + 8 + 9 = 123 */
            assert.strictEqual(comp.val(), 123);
            /** dropped deps are disconnected */
            poke(sigs[5], 999);
            assert.strictEqual(comp.val(), 123);
            /** kept deps still work */
            poke(sigs[8], 80);
            assert.strictEqual(comp.val(), 100 + 1 + 2 + 3 + 80 + 9);
        });

        it("10 deps, drop first 5", () => {
            const sigs = signals(10);
            let dropFirst = false;
            const comp = compute((r) => {
                let sum = 0;
                for (let i = 0; i < 10; i++) {
                    if (dropFirst && i < 5) {
                        continue;
                    }
                    sum += r.read(sigs[i]);
                }
                return sum;
            });
            assert.strictEqual(comp.val(), 45);
            dropFirst = true;
            poke(sigs[9], 90);
            assert.strictEqual(comp.val(), 5 + 6 + 7 + 8 + 90);
            poke(sigs[0], 999);
            assert.strictEqual(comp.val(), 5 + 6 + 7 + 8 + 90);
        });

        it("10 deps, drop last 5", () => {
            const sigs = signals(10);
            let dropLast = false;
            const comp = compute((r) => {
                let sum = 0;
                for (let i = 0; i < 10; i++) {
                    if (dropLast && i >= 5) {
                        break;
                    }
                    sum += r.read(sigs[i]);
                }
                return sum;
            });
            assert.strictEqual(comp.val(), 45);
            dropLast = true;
            poke(sigs[0], 10);
            assert.strictEqual(comp.val(), 10 + 1 + 2 + 3 + 4);
            poke(sigs[9], 999);
            assert.strictEqual(comp.val(), 10 + 1 + 2 + 3 + 4);
        });
    });

    describe("add new deps", () => {
        it("dep1 only, then add 5 new", () => {
            const sigs = signals(6);
            let expanded = false;
            const comp = compute((r) => {
                let sum = r.read(sigs[0]);
                if (expanded) {
                    for (let i = 1; i < 6; i++) {
                        sum += r.read(sigs[i]);
                    }
                }
                return sum;
            });
            assert.strictEqual(comp.val(), 0);
            expanded = true;
            poke(sigs[0], 10);
            assert.strictEqual(comp.val(), 10 + 1 + 2 + 3 + 4 + 5);
            poke(sigs[5], 50);
            assert.strictEqual(comp.val(), 10 + 1 + 2 + 3 + 4 + 50);
        });

        it("2 deps, then add 3 in the middle", () => {
            const [a, b, c, d, e] = signals(5);
            let phase = 0;
            const comp = compute((r) => {
                if (phase === 0) {
                    return r.read(a) + r.read(b);
                } else {
                    return r.read(a) + r.read(c) + r.read(d) + r.read(e) + r.read(b);
                }
            });
            comp.val();
            phase = 1;
            poke(a, 10);
            assert.strictEqual(comp.val(), 10 + 2 + 3 + 4 + 1);
            poke(c, 20);
            assert.strictEqual(comp.val(), 10 + 20 + 3 + 4 + 1);
        });
    });

    describe("ternary / conditional deps", () => {
        it("A ? B : C — toggles back and forth", () => {
            const gate = signal(true);
            const b = signal(10);
            const c = signal(20);
            const comp = compute((r) => {
                return r.read(gate) ? r.read(b) : r.read(c);
            });
            assert.strictEqual(comp.val(), 10);
            gate.set(false);
            assert.strictEqual(comp.val(), 20);
            gate.set(true);
            assert.strictEqual(comp.val(), 10);
            gate.set(false);
            assert.strictEqual(comp.val(), 20);
            /** verify deps are correct after toggling */
            c.set(30);
            assert.strictEqual(comp.val(), 30);
            b.set(99);
            assert.strictEqual(comp.val(), 30);
        });

        it("nested ternary: A ? (B ? C : D) : E", () => {
            const a = signal(true);
            const b = signal(true);
            const c = signal(1);
            const d = signal(2);
            const e = signal(3);
            const comp = compute((r) => {
                if (r.read(a)) {
                    return r.read(b) ? r.read(c) : r.read(d);
                }
                return r.read(e);
            });
            assert.strictEqual(comp.val(), 1);
            b.set(false);
            assert.strictEqual(comp.val(), 2);
            a.set(false);
            assert.strictEqual(comp.val(), 3);
            /** b and c and d should be disconnected */
            b.set(true);
            c.set(99);
            d.set(99);
            assert.strictEqual(comp.val(), 3);
            /** e should be connected */
            e.set(30);
            assert.strictEqual(comp.val(), 30);
        });

        it("alternating between dep1+B and dep1+C across many iterations", () => {
            const gate = signal(0);
            const b = signal(100);
            const c = signal(200);
            const comp = compute((r) => {
                let g = r.read(gate);
                return g % 2 === 0 ? r.read(b) : r.read(c);
            });
            for (let i = 0; i < 20; i++) {
                gate.set(i);
                let expected = i % 2 === 0 ? 100 : 200;
                assert.strictEqual(comp.val(), expected, `iter ${i}`);
            }
        });
    });

    describe("inner compute corrupts _slot", () => {
        it("read A, then read compute that also reads A, then read A again", () => {
            const a = signal(1);
            const inner = compute((r) => r.read(a) * 10);
            const outer = compute((r) => {
                let v1 = r.read(a);
                let v2 = r.read(inner);
                let v3 = r.read(a);
                return v1 + v2 + v3;
            });
            /** a._slot gets corrupted by inner's read during inner.val() */
            assert.strictEqual(outer.val(), 1 + 10 + 1);
            a.set(2);
            assert.strictEqual(outer.val(), 2 + 20 + 2);
            a.set(3);
            assert.strictEqual(outer.val(), 3 + 30 + 3);
        });

        it("read A, read B, read compute(A,B), read A again, read B again", () => {
            const a = signal(1);
            const b = signal(2);
            const inner = compute((r) => r.read(a) + r.read(b));
            const outer = compute((r) => {
                let va = r.read(a);
                let vb = r.read(b);
                let vi = r.read(inner);
                let va2 = r.read(a);
                let vb2 = r.read(b);
                return va + vb + vi + va2 + vb2;
            });
            assert.strictEqual(outer.val(), 1 + 2 + 3 + 1 + 2);
            a.set(10);
            assert.strictEqual(outer.val(), 10 + 2 + 12 + 10 + 2);
            b.set(20);
            assert.strictEqual(outer.val(), 10 + 20 + 30 + 10 + 20);
        });

        it("slot corruption + conditional dep: read A, read inner(A), then on rerun skip A", () => {
            const a = signal(1);
            const gate = signal(true);
            const inner = compute((r) => r.read(a) * 10);
            const outer = compute((r) => {
                if (r.read(gate)) {
                    return r.read(a) + r.read(inner);
                }
                return r.read(inner);
            });
            assert.strictEqual(outer.val(), 1 + 10);
            gate.set(false);
            assert.strictEqual(outer.val(), 10);
            /** a should be disconnected from outer */
            a.set(2);
            /** inner updates to 20, outer should re-eval */
            assert.strictEqual(outer.val(), 20);
        });
    });

    describe("slot collision from unrelated compute", () => {
        it("depC matched at correct position, inner compute corrupts depC._slot, re-read depC", () => {
            const a = signal(1);
            const b = signal(2);
            const c = signal(3);
            const d = signal(4);
            /** inner reads c, which will overwrite c._slot */
            const inner = compute((r) => r.read(c) + r.read(d));

            let readInner = false;
            const outer = compute((r) => {
                let va = r.read(a);
                let vb = r.read(b);
                let vc = r.read(c);
                if (readInner) {
                    /** inner.val() triggers inner's recompute, which sets c._slot = inner's slot */
                    r.read(inner);
                }
                /** read c again — c._slot no longer matches outer's slot */
                let vc2 = r.read(c);
                return va + vb + vc + vc2;
            });
            assert.strictEqual(outer.val(), 1 + 2 + 3 + 3);
            readInner = true;
            a.set(10);
            assert.strictEqual(outer.val(), 10 + 2 + 3 + 3);
            /** c should still be tracked correctly */
            c.set(30);
            assert.strictEqual(outer.val(), 10 + 2 + 30 + 30);
        });

        it("inner compute corrupts slot causing false dedup on different sender", () => {
            /**
             * If two senders happen to get the same _slot value from different
             * computes, our compute might falsely think it already tracked a sender.
             * This tests that the dedup check `sender._slot === this._slot` only
             * matches when it was genuinely set by us.
             */
            const a = signal(1);
            const b = signal(2);
            const c = signal(3);
            /**
             * inner reads a — sets a._slot = inner's version.
             * If outer's version happens to match inner's version (possible
             * after many VERSION-- decrements), we'd falsely dedup.
             * In practice, VERSION-- always produces unique values, so this
             * tests the general correctness.
             */
            const inner = compute((r) => r.read(a) * 100);
            const outer = compute((r) => {
                let vi = r.read(inner);
                let va = r.read(a);
                return vi + va;
            });
            assert.strictEqual(outer.val(), 100 + 1);
            a.set(5);
            assert.strictEqual(outer.val(), 500 + 5);
        });
    });

    describe("read past position after corruption", () => {
        it("match depC at index, inner corrupts depC, re-read depC pushes past depE", () => {
            const a = signal(1);
            const b = signal(2);
            const c = signal(3);
            const d = signal(4);
            const e = signal(5);
            /** inner reads c and d, corrupting their slots */
            const inner = compute((r) => r.read(c) + r.read(d));

            let phase = 0;
            const outer = compute((r) => {
                if (phase === 0) {
                    /** initial: read a, b, c, d, e in order */
                    return r.read(a) + r.read(b) + r.read(c) + r.read(d) + r.read(e);
                } else {
                    /**
                     * rerun: read a, b, inner(c,d), c, d, e
                     * inner's execution corrupts c._slot and d._slot.
                     * Then reading c and d again should still work correctly.
                     */
                    let sum = r.read(a) + r.read(b);
                    sum += r.read(inner);
                    sum += r.read(c) + r.read(d) + r.read(e);
                    return sum;
                }
            });
            assert.strictEqual(outer.val(), 15);
            phase = 1;
            a.set(10);
            assert.strictEqual(outer.val(), 10 + 2 + 7 + 3 + 4 + 5);
            /** verify all deps work */
            c.set(30);
            assert.strictEqual(outer.val(), 10 + 2 + 34 + 30 + 4 + 5);
            e.set(50);
            assert.strictEqual(outer.val(), 10 + 2 + 34 + 30 + 4 + 50);
        });
    });

    describe("repeated reads of same dep", () => {
        it("read A three times — only tracked once", () => {
            const a = signal(1);
            let runs = 0;
            const comp = compute((r) => {
                runs++;
                return r.read(a) + r.read(a) + r.read(a);
            });
            assert.strictEqual(comp.val(), 3);
            runs = 0;
            a.set(10);
            assert.strictEqual(comp.val(), 30);
            assert.strictEqual(runs, 1);
        });

        it("read A, then B, then A again — A not double-subscribed", () => {
            const a = signal(1);
            const b = signal(2);
            let runs = 0;
            const comp = compute((r) => {
                runs++;
                return r.read(a) + r.read(b) + r.read(a);
            });
            assert.strictEqual(comp.val(), 4);
            runs = 0;
            a.set(10);
            assert.strictEqual(comp.val(), 22);
            assert.strictEqual(runs, 1);
            runs = 0;
            b.set(20);
            assert.strictEqual(comp.val(), 40);
            assert.strictEqual(runs, 1);
        });
    });

    describe("stress: unstable pattern", () => {
        it("20 conditional reads alternating every update", () => {
            const head = signal(0);
            const double = compute((r) => r.read(head) * 2);
            const inverse = compute((r) => -r.read(head));
            const current = compute((r) => {
                let result = 0;
                for (let i = 0; i < 20; i++) {
                    result += r.read(head) % 2 ? r.read(double) : r.read(inverse);
                }
                return result;
            });
            effect((r) => { r.read(current); });
            for (let i = 1; i <= 100; i++) {
                batch(() => { head.set(i); });
                if (i % 2 === 0) {
                    assert.strictEqual(current.val(), -i * 20);
                } else {
                    assert.strictEqual(current.val(), i * 2 * 20);
                }
            }
        });
    });

    describe("multiple rounds of dep churn", () => {
        it("cycle through 4 different dep sets", () => {
            const trigger = signal(0);
            const sigs = signals(8);
            let phase = 0;
            let runs = 0;
            const comp = compute((r) => {
                runs++;
                r.read(trigger);
                let sum = 0;
                switch (phase % 4) {
                    case 0: sum = r.read(sigs[0]) + r.read(sigs[1]); break;
                    case 1: sum = r.read(sigs[2]) + r.read(sigs[3]); break;
                    case 2: sum = r.read(sigs[4]) + r.read(sigs[5]); break;
                    case 3: sum = r.read(sigs[6]) + r.read(sigs[7]); break;
                }
                return sum;
            });
            comp.val();
            for (let i = 0; i < 20; i++) {
                phase = i;
                runs = 0;
                trigger.set(i + 1);
                comp.val();
                assert.strictEqual(runs, 1, `phase ${i} should recompute once`);
                /** previous phase's signals shouldn't trigger recompute */
                let prevPair = ((i + 3) % 4) * 2;
                runs = 0;
                sigs[prevPair].set(sigs[prevPair].val() + 1);
                comp.val();
                assert.strictEqual(runs, 0, `prev phase dep shouldn't trigger at phase ${i}`);
            }
        });

        it("grow and shrink deps repeatedly", () => {
            const sigs = signals(10);
            let count = 1;
            const comp = compute((r) => {
                let sum = 0;
                for (let i = 0; i < count; i++) {
                    sum += r.read(sigs[i]);
                }
                return sum;
            });
            for (let round = 0; round < 5; round++) {
                /** grow */
                for (let c = 1; c <= 10; c++) {
                    count = c;
                    poke(sigs[0], round * 100 + c);
                    let expected = round * 100 + c;
                    for (let i = 1; i < c; i++) {
                        expected += i;
                    }
                    assert.strictEqual(comp.val(), expected, `grow round=${round} count=${c}`);
                }
                /** shrink */
                for (let c = 10; c >= 1; c--) {
                    count = c;
                    poke(sigs[0], round * 100 + 50 + c);
                    let expected = round * 100 + 50 + c;
                    for (let i = 1; i < c; i++) {
                        expected += i;
                    }
                    assert.strictEqual(comp.val(), expected, `shrink round=${round} count=${c}`);
                }
            }
        });
    });

    describe("effect with dynamic deps", () => {
        it("effect tracks deps correctly after reconcile", () => {
            const gate = signal(true);
            const a = signal(1);
            const b = signal(2);
            let last = 0;
            let runs = 0;
            effect((r) => {
                runs++;
                last = r.read(gate) ? r.read(a) : r.read(b);
            });
            assert.strictEqual(last, 1);
            assert.strictEqual(runs, 1);
            gate.set(false);
            assert.strictEqual(last, 2);
            assert.strictEqual(runs, 2);
            /** a disconnected */
            a.set(99);
            assert.strictEqual(runs, 2);
            /** b connected */
            b.set(20);
            assert.strictEqual(last, 20);
            assert.strictEqual(runs, 3);
        });

        it("effect with cleanup during dep change", () => {
            const gate = signal(true);
            const a = signal(1);
            const b = signal(2);
            let cleanups = 0;
            effect((r) => {
                r.read(gate) ? r.read(a) : r.read(b);
                r.cleanup(() => { cleanups++; });
            });
            assert.strictEqual(cleanups, 0);
            gate.set(false);
            assert.strictEqual(cleanups, 1);
            b.set(20);
            assert.strictEqual(cleanups, 2);
        });
    });

    describe("diamond with dynamic deps", () => {
        it("diamond where one arm is conditional", () => {
            const s = signal(0);
            const left = compute((r) => r.read(s) + 1);
            const right = compute((r) => r.read(s) * 2);
            let useRight = true;
            const join = compute((r) => {
                let sum = r.read(left);
                if (useRight) {
                    sum += r.read(right);
                }
                return sum;
            });
            effect((r) => { r.read(join); });
            assert.strictEqual(join.val(), 1 + 0);
            s.set(3);
            assert.strictEqual(join.val(), 4 + 6);
            useRight = false;
            s.set(5);
            assert.strictEqual(join.val(), 6);
            /** right is disconnected from join */
            useRight = true;
            s.set(7);
            assert.strictEqual(join.val(), 8 + 14);
        });
    });

    describe("derive (stable) does not reconcile", () => {
        it("derive ignores dep changes — always reads fixed set", () => {
            const a = signal(1);
            const b = signal(2);
            let runs = 0;
            /** derive with function form is STABLE — reads are tracked once */
            const d = compute((r) => {
                runs++;
                return r.read(a) + r.read(b);
            });
            assert.strictEqual(d.val(), 3);
            runs = 0;
            a.set(10);
            assert.strictEqual(d.val(), 12);
            assert.strictEqual(runs, 1);
            b.set(20);
            assert.strictEqual(d.val(), 30);
            assert.strictEqual(runs, 2);
        });
    });
});
