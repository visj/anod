import { describe, test, expect, collectAsync, expectCollected } from "#test-runner";
import { signal, root, c } from "#anod";

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

describe("equal()", () => {
    test("equal(true) suppresses notification when value changes", () => {
        const s1 = signal(1);
        let runs = 0;
        const c1 = c.compute(c => {
            c.equal(true);
            return c.val(s1);
        });
        const c2 = c.compute(c => {
            runs++;
            return c.val(c1);
        });

        runs = 0;
        s1.set(2);
        expect(c1.get()).toBe(2);
        /** c2 should not have re-run because c1 declared itself equal */
        expect(runs).toBe(0);
    });

    test("equal(false) forces notification when value stays the same", () => {
        const s1 = signal(1);
        let runs = 0;
        const c1 = c.compute(c => {
            c.equal(false);
            c.val(s1);
            return 42;
        });
        const c2 = c.compute(c => {
            runs++;
            return c.val(c1);
        });

        expect(c1.get()).toBe(42);
        runs = 0;
        /** Value stays 42, but equal(false) forces notification */
        s1.set(2);
        c2.get();
        expect(runs).toBe(1);
    });

    test("equal(false) forces notification on effects", () => {
        const s1 = signal(1);
        let runs = 0;
        const c1 = c.compute(c => {
            c.equal(false);
            c.val(s1);
            return 42;
        });
        c.effect(c => {
            runs++;
            c.val(c1);
        });

        runs = 0;
        s1.set(2);
        expect(runs).toBe(1);
    });

    test("default behavior: no notification when value stays the same", () => {
        const s1 = signal(1);
        let runs = 0;
        const c1 = c.compute(c => {
            c.val(s1);
            return 42;
        });
        const c2 = c.compute(c => {
            runs++;
            return c.val(c1);
        });

        runs = 0;
        s1.set(2);
        c2.get();
        /** c1 returns 42 both times, so c2 should not re-run */
        expect(runs).toBe(0);
    });

    test("default behavior: notifies when value changes", () => {
        const s1 = signal(1);
        let runs = 0;
        const c1 = c.compute(c => {
            return c.val(s1) * 2;
        });
        const c2 = c.compute(c => {
            runs++;
            return c.val(c1);
        });

        runs = 0;
        s1.set(2);
        c2.get();
        expect(runs).toBe(1);
        expect(c2.get()).toBe(4);
		});

 //    test("dynamic re-run sweepDeps doesn't retain old deps via VSTACK", async () => {
	// 	/**
	// 	 * sweepDeps pushes (dep, depver) onto VSTACK for every pre-existing
	// 	 * dep whose `_version > TRANSACTION` (i.e. tagged by a sibling
	// 	 * running in the same transaction). With a nested dynamic compute
	// 	 * and a shared signal we can force this path, then re-run the
	// 	 * outer so the shared signal is dropped from its dep set.
	// 	 */
	// 	const refs = capture(() => {
	// 		let outer, sGate, sShared, sOther;
	// 		const r = root((r) => {
	// 			sGate = signal(true);
	// 			sShared = signal("shared");
	// 			sOther = signal("other");

	// 			outer = r.compute((c) => {
	// 				if (c.val(sGate)) {
	// 					c.val(sShared);
	// 				} else {
	// 					c.val(sOther);
	// 				}
	// 			});
	// 			r.compute((c2) => c2.val(sShared)).get();

	// 			outer.get();
	// 			sGate.set(false); // outer re-runs dynamically; sShared dropped
	// 			outer.get();
	// 		});
	// 		r.dispose();
	// 		return [outer, sGate, sShared, sOther];
	// 	});
	// 	await collectAsync();
	// 	for (const r of refs) {
	// 		expect(r.deref()).toBeUndefined();
	// 	}
	// });

    test("equal(true) then equal(false) uses last call", () => {
        const s1 = signal(1);
        let runs = 0;
        const c1 = c.compute(c => {
            c.equal(true);
            c.equal(false);
            c.val(s1);
            return 42;
        });
        const c2 = c.compute(c => {
            runs++;
            return c.val(c1);
        });

        runs = 0;
        s1.set(2);
        c2.get();
        /** Last call was equal(false), so c2 should re-run */
        expect(runs).toBe(1);
    });

    test("equal(false) then equal(true) uses last call", () => {
        const s1 = signal(1);
        let runs = 0;
        const c1 = c.compute(c => {
            c.equal(false);
            c.equal(true);
            return c.val(s1);
        });
        const c2 = c.compute(c => {
            runs++;
            return c.val(c1);
        });

        runs = 0;
        s1.set(2);
        c2.get();
        /** Last call was equal(true), so c2 should not re-run */
        expect(runs).toBe(0);
    });

    test("equal() resets between compute runs", () => {
        const s1 = signal(1);
        let forceNotify = false;
        let runs = 0;
        const c1 = c.compute(c => {
            if (forceNotify) {
                c.equal(false);
            }
            c.val(s1);
            return 42;
        });
        const c2 = c.compute(c => {
            runs++;
            return c.val(c1);
        });

        runs = 0;
        /** First run: no equal(false), value stays 42 → no notification */
        s1.set(2);
        c2.get();
        expect(runs).toBe(0);

        /** Second run: equal(false) → force notification */
        forceNotify = true;
        runs = 0;
        s1.set(3);
        c2.get();
        expect(runs).toBe(1);

        /** Third run: no equal(false) again → no notification */
        forceNotify = false;
        runs = 0;
        s1.set(4);
        c2.get();
        expect(runs).toBe(0);
    });
});
