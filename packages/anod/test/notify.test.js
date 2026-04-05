import { describe, test, expect } from "bun:test";
import { root, signal, compute, effect, batch, OPT_NOTIFY } from "../";

describe("equal()", () => {
    test("equal(true) suppresses notification when value changes", () => {
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
        expect(c1.val()).toBe(2);
        /** c2 should not have re-run because c1 declared itself equal */
        expect(runs).toBe(0);
    });

    test("equal(false) forces notification when value stays the same", () => {
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

        expect(c1.val()).toBe(42);
        runs = 0;
        /** Value stays 42, but equal(false) forces notification */
        s1.set(2);
        c2.val();
        expect(runs).toBe(1);
    });

    test("equal(false) forces notification on effects", () => {
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
        expect(runs).toBe(1);
    });

    test("default behavior: no notification when value stays the same", () => {
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
        /** c1 returns 42 both times, so c2 should not re-run */
        expect(runs).toBe(0);
    });

    test("default behavior: notifies when value changes", () => {
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
        expect(runs).toBe(1);
        expect(c2.val()).toBe(4);
    });

    test("equal(true) then equal(false) uses last call", () => {
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
        /** Last call was equal(false), so c2 should re-run */
        expect(runs).toBe(1);
    });

    test("equal(false) then equal(true) uses last call", () => {
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
        /** Last call was equal(true), so c2 should not re-run */
        expect(runs).toBe(0);
    });

    test("equal() resets between compute runs", () => {
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
        /** First run: no equal(false), value stays 42 → no notification */
        s1.set(2);
        c2.val();
        expect(runs).toBe(0);

        /** Second run: equal(false) → force notification */
        forceNotify = true;
        runs = 0;
        s1.set(3);
        c2.val();
        expect(runs).toBe(1);

        /** Third run: no equal(false) again → no notification */
        forceNotify = false;
        runs = 0;
        s1.set(4);
        c2.val();
        expect(runs).toBe(0);
    });
});

describe("OPT_NOTIFY", () => {
    test("always-notify compute triggers downstream even when value stays the same", () => {
        const s1 = signal(1);
        let runs = 0;
        const c1 = compute((c) => {
            c.read(s1);
            return 42;
        }, undefined, OPT_NOTIFY);
        const c2 = compute((c) => {
            runs++;
            return c.read(c1);
        });

        runs = 0;
        s1.set(2);
        c2.val();
        /** c1 value stays 42 but OPT_NOTIFY means it always notifies */
        expect(runs).toBe(1);
    });

    test("always-notify compute notifies stale instead of pending", () => {
        const s1 = signal(1);
        let order = "";
        const c1 = compute((c) => {
            order += "c1";
            return c.read(s1);
        }, undefined, OPT_NOTIFY);
        const c2 = compute((c) => {
            order += "c2";
            return c.read(c1);
        });

        order = "";
        /**
         * Because c1 has OPT_NOTIFY, c2 is notified stale (not pending).
         * So c2 should always re-execute, even if c1's value didn't change.
         * STALE computes skip pullCompute and run directly — deps are
         * pulled lazily via .val() inside the fn, so c2 starts first.
         */
        s1.set(2);
        c2.val();
        expect(order).toBe("c2c1");
    });

    test("OPT_NOTIFY ignores equal(true) calls", () => {
        const s1 = signal(1);
        let runs = 0;
        const c1 = compute((c) => {
            c.equal(true);
            c.read(s1);
            return 42;
        }, undefined, OPT_NOTIFY);
        const c2 = compute((c) => {
            runs++;
            return c.read(c1);
        });

        runs = 0;
        s1.set(2);
        c2.val();
        /**
         * Even though equal(true) was called, OPT_NOTIFY means
         * downstream was already notified stale. c2 must re-run.
         */
        expect(runs).toBe(1);
    });

    test("OPT_NOTIFY works with compute()", () => {
        const s1 = signal(1);
        let runs = 0;
        const c1 = compute((c) => {
            c.read(s1);
            return 42;
        }, undefined, OPT_NOTIFY);
        const c2 = compute((c) => {
            runs++;
            return c.read(c1);
        });

        runs = 0;
        s1.set(2);
        c2.val();
        /** c1 always returns 42 but OPT_NOTIFY forces notification */
        expect(runs).toBe(1);
    });

    test("OPT_NOTIFY triggers effects", () => {
        const s1 = signal(1);
        let runs = 0;
        const c1 = compute((c) => {
            c.read(s1);
            return 42;
        }, undefined, OPT_NOTIFY);
        effect((e) => {
            runs++;
            e.read(c1);
        });

        runs = 0;
        s1.set(2);
        /** Effect should re-run even though c1's value stays 42 */
        expect(runs).toBe(1);
    });

    test("OPT_NOTIFY preserves across multiple updates", () => {
        const s1 = signal(1);
        let runs = 0;
        const c1 = compute((c) => {
            c.read(s1);
            return 42;
        }, undefined, OPT_NOTIFY);
        const c2 = compute((c) => {
            runs++;
            return c.read(c1);
        });

        runs = 0;
        s1.set(2);
        c2.val();
        expect(runs).toBe(1);

        runs = 0;
        s1.set(3);
        c2.val();
        expect(runs).toBe(1);

        runs = 0;
        s1.set(4);
        c2.val();
        expect(runs).toBe(1);
    });

    test("OPT_NOTIFY in a diamond dependency", () => {
        const s1 = signal(1);
        let runs = 0;
        const c1 = compute((c) => {
            return c.read(s1);
        }, undefined, OPT_NOTIFY);
        const c2 = compute((c) => {
            return c.read(c1) + 1;
        });
        const c3 = compute((c) => {
            return c.read(c1) + 2;
        });
        const c4 = compute((c) => {
            runs++;
            return c.read(c2) + c.read(c3);
        });

        expect(c4.val()).toBe(1 + 1 + 1 + 2);
        runs = 0;
        s1.set(2);
        c4.val();
        /**
         * c1 has OPT_NOTIFY → c2 and c3 are notified stale.
         * Values change through the diamond, c4 should re-run once.
         */
        expect(runs).toBe(1);
        expect(c4.val()).toBe(2 + 1 + 2 + 2);
    });

    test("OPT_NOTIFY in a diamond where value stays the same", () => {
        const s1 = signal(1);
        let runs = 0;
        const c1 = compute((c) => {
            c.read(s1);
            return 42;
        }, undefined, OPT_NOTIFY);
        const c2 = compute((c) => {
            return c.read(c1) + 1;
        });
        const c3 = compute((c) => {
            return c.read(c1) + 2;
        });
        const c4 = compute((c) => {
            runs++;
            return c.read(c2) + c.read(c3);
        });

        runs = 0;
        s1.set(2);
        c4.val();
        /**
         * c1 has OPT_NOTIFY but always returns 42, so c2 and c3
         * produce the same values.  c4 should NOT re-run because
         * c2 and c3 do not propagate (their values did not change).
         */
        expect(runs).toBe(0);
    });

    test("OPT_NOTIFY with batch", () => {
        const s1 = signal(1);
        let runs = 0;
        const c1 = compute((c) => {
            c.read(s1);
            return 42;
        }, undefined, OPT_NOTIFY);
        effect((e) => {
            runs++;
            e.read(c1);
        });

        runs = 0;
        batch(() => {
            s1.set(2);
            s1.set(3);
        });
        /** Effect should re-run once despite two sets in a batch */
        expect(runs).toBe(1);
    });
});
