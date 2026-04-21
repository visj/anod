import { describe, test, expect, collectAsync } from "#test-runner";
import { c } from "#anod";

/**
 * Runs `fn` in a child scope and returns WeakRefs to everything `fn`
 * returns. After this helper returns the only strong references should
 * be whatever the library itself still holds -- the caller can GC and
 * inspect what leaked.
 */
function capture(fn) {
    const nodes = fn();
    return nodes.map((n) => new WeakRef(n));
}

describe("stack retention after disposal", () => {
    test("DSTACK releases setup-time sender references", async () => {
        /**
         * Setup-mode _read pushes (sender, subslot) onto DSTACK for every
         * read past the first (the first goes to _dep1). After the compute
         * finishes setup, DCOUNT is reset but the sender slots are never
         * cleared -- those senders remain rooted in DSTACK until the same
         * slot is overwritten by another setup.
         */
        const refs = capture(() => {
            const s1 = c.signal(1);
            const s2 = c.signal(2);
            const s3 = c.signal(3);
            const s4 = c.signal(4);
            const s5 = c.signal(5);
            const cx = c.compute(c => c.val(s1) + c.val(s2) + c.val(s3) + c.val(s4) + c.val(s5));
            // Trigger setup.
            cx.peek();
            cx.dispose();
            s1.dispose();
            s2.dispose();
            s3.dispose();
            s4.dispose();
            s5.dispose();
            return [s1, s2, s3, s4, s5, cx];
        });

        await collectAsync();
        // Everything disposed and unreferenced -- nothing should be retained.
        for (const r of refs) {
            expect(r.deref()).toBeUndefined();
        }
    });

    test("VSTACK releases saved-version sender references", async () => {
        /**
         * VSTACK is written by _read when a sender was already tagged by
         * another running node in this transaction (`stamp > TRANSACTION`).
         * This happens when a nested compute re-reads a signal that the
         * outer compute already read. After the outer _update restores
         * the saved tags it resets VCOUNT -- but the sender slots still
         * hold the references.
         */
        const refs = capture(() => {
            const holders = [];
            c.root(r => {
                const s1 = c.signal(1);
                const s2 = c.signal(2);
                const s3 = c.signal(3);
                holders.push(s1, s2, s3);

                r.effect(r2 => {
                    // Outer reads -- tag each signal with outer's RVER.
                    r2.val(s1);
                    r2.val(s2);
                    r2.val(s3);

                    // Nested compute re-reads each signal. For every
                    // nested read `stamp = sN._version = outer.RVER`
                    // and `stamp > TRANSACTION`, so each pushes onto
                    // VSTACK.
                    c.compute(c2 => c2.val(s1) + c2.val(s2) + c2.val(s3)).peek();
                });

                holders.push(r);
            }).dispose();

            for (const s of holders) {
                if (typeof s.dispose === "function") {
                    s.dispose();
                }
            }
            return holders;
        });

        await collectAsync();
        for (const r of refs) {
            expect(r.deref()).toBeUndefined();
        }
    });

    test("CSTACK releases pending-chain compute references", async () => {
        /**
         * checkRun's fast-descent loop and scan branches push the current
         * node onto CSTACK before recursing. CTOP is decremented on the
         * way back up but the slot is never nulled -- so every compute
         * that participated in a PENDING propagation stays rooted in
         * CSTACK until another call overwrites the slot.
         *
         *      s1 -> c1 -> c2
         *      s2 -> c3    \
         *                   -> c4 (multi-dep: not FLAG_SINGLE)
         *
         * An outer effect reads c4 so the subsequent read happens while
         * the transaction loop is running (IDLE=false). After setting s1,
         * the effect re-runs, reads c4 which is PENDING + non-SINGLE,
         * which takes the checkRun branch in ComputeProto.val and pushes
         * c4 onto CSTACK.
         */
        const holders = capture(() => {
            let s1, s2, c1, c2, c3, c4;
            const r = c.root(r => {
                s1 = c.signal(1);
                s2 = c.signal(10);
                c1 = c.compute(c => c.val(s1));
                c2 = c.compute(c => c.val(c1));
                c3 = c.compute(c => c.val(s2));
                c4 = c.compute(c => c.val(c2) + c.val(c3));
                r.effect(c => c.val(c4));
                s1.set(2);   // effect re-runs in transaction, drives checkRun
            });
            r.dispose();
            s1.dispose();
            s2.dispose();
            return [s1, s2, c1, c2, c3, c4, r];
        });

        await collectAsync();
        for (const ref of holders) {
            expect(ref.deref()).toBeUndefined();
        }
    });

    test("dynamic re-run sweepDeps doesn't retain old deps via VSTACK", async () => {
        /**
         * sweepDeps pushes (dep, depver) onto VSTACK for every pre-existing
         * dep whose `_version > TRANSACTION` (i.e. tagged by a sibling
         * running in the same transaction). With a nested dynamic compute
         * and a shared signal we can force this path, then re-run the
         * outer so the shared signal is dropped from its dep set.
         */
        const refs = capture(() => {
            const sGate = c.signal(true);
            const sShared = c.signal("shared");
            const sOther = c.signal("other");

            const outer = c.compute(cx => {
                if (cx.val(sGate)) {
                    cx.val(sShared);
                } else {
                    cx.val(sOther);
                }
                // Nested compute that re-reads sShared to drive the
                // conflict path.
                c.compute(c2 => c2.val(sShared)).peek();
            });

            outer.peek();
            sGate.set(false);  // outer re-runs dynamically; sShared dropped
            outer.peek();

            outer.dispose();
            sGate.dispose();
            sShared.dispose();
            sOther.dispose();
            return [outer, sGate, sShared, sOther];
        });

        await collectAsync();
        for (const r of refs) {
            expect(r.deref()).toBeUndefined();
        }
    });
});
