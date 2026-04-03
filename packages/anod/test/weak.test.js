import { describe, test, expect } from "bun:test";
import { root, signal, compute, effect, batch, OPT_WEAK } from "../";

describe("OPT_WEAK", () => {
    test("releases value when last subscriber disposes", () => {
        const s1 = signal({ data: "large" });
        const c1 = compute((c) => {
            return c.read(s1);
        }, undefined, OPT_WEAK);

        const e1 = effect((e) => {
            e.read(c1);
        });

        /** While subscribed, value is retained */
        expect(c1.val()).toEqual({ data: "large" });

        /** After disposing the only subscriber, value is released */
        e1.dispose();
        expect(c1.val()).toEqual({ data: "large" });
    });

    test("recomputes fresh after value is released", () => {
        let runs = 0;
        const s1 = signal(1);
        const c1 = compute((c) => {
            runs++;
            return c.read(s1);
        }, undefined, OPT_WEAK);

        const e1 = effect((e) => {
            e.read(c1);
        });

        expect(c1.val()).toBe(1);
        runs = 0;

        /** Dispose subscriber → value released, node marked STALE */
        e1.dispose();

        /** Reading again triggers a fresh recompute */
        expect(c1.val()).toBe(1);
        expect(runs).toBe(1);
    });

    test("retains value while at least one subscriber exists", () => {
        let runs = 0;
        const s1 = signal(1);
        const c1 = compute((c) => {
            runs++;
            return c.read(s1);
        }, undefined, OPT_WEAK);

        const e1 = effect((e) => {
            e.read(c1);
        });
        const e2 = effect((e) => {
            e.read(c1);
        });

        runs = 0;

        /** Disposing one subscriber — still has another */
        e1.dispose();
        expect(runs).toBe(0);

        /** Reading should NOT recompute — still subscribed */
        expect(c1.val()).toBe(1);
        expect(runs).toBe(0);
    });

    test("releases only when all subscribers are gone", () => {
        let runs = 0;
        const s1 = signal(1);
        const c1 = compute((c) => {
            runs++;
            return c.read(s1);
        }, undefined, OPT_WEAK);

        const e1 = effect((e) => {
            e.read(c1);
        });
        const e2 = effect((e) => {
            e.read(c1);
        });

        runs = 0;
        e1.dispose();
        e2.dispose();

        /** Now fully unsubscribed — reading should recompute */
        expect(c1.val()).toBe(1);
        expect(runs).toBe(1);
    });

    test("works with derive (bound computes)", () => {
        let runs = 0;
        const s1 = signal(1);
        const c1 = s1.derive((c, val) => {
            runs++;
            return val * 2;
        }, undefined, OPT_WEAK);

        const e1 = effect((e) => {
            e.read(c1);
        });

        expect(c1.val()).toBe(2);
        runs = 0;

        e1.dispose();

        /** Reading after release triggers recompute */
        expect(c1.val()).toBe(2);
        expect(runs).toBe(1);
    });

    test("re-subscribing after release works correctly", () => {
        let runs = 0;
        const s1 = signal(1);
        const c1 = compute((c) => {
            runs++;
            return c.read(s1);
        }, undefined, OPT_WEAK);

        /** First subscriber */
        const e1 = effect((e) => {
            e.read(c1);
        });

        runs = 0;
        e1.dispose();

        /** New subscriber created after release */
        let effectVal = 0;
        const e2 = effect((e) => {
            effectVal = e.read(c1);
        });

        expect(effectVal).toBe(1);
        expect(runs).toBe(1);

        /** Source changes while subscribed — should propagate */
        runs = 0;
        s1.set(2);
        expect(effectVal).toBe(2);
        expect(runs).toBe(1);

        /** Dispose again */
        runs = 0;
        e2.dispose();

        /** Should recompute on read again */
        expect(c1.val()).toBe(2);
        expect(runs).toBe(1);
    });

    test("dynamic dep changes release weak compute", () => {
        let runs = 0;
        const s1 = signal(1);
        const s2 = signal(true);
        const weak1 = compute((c) => {
            runs++;
            return c.read(s1);
        }, undefined, OPT_WEAK);

        /**
         * This compute conditionally reads weak1.  When the
         * condition flips, pruneDeps will unsubscribe from weak1.
         */
        const c2 = compute((c) => {
            if (c.read(s2)) {
                return c.read(weak1);
            }
            return 0;
        });

        expect(c2.val()).toBe(1);
        runs = 0;

        /** Flip condition — c2 stops reading weak1 */
        s2.set(false);
        expect(c2.val()).toBe(0);

        /** weak1 should have released its value and recompute on read */
        expect(weak1.val()).toBe(1);
        expect(runs).toBe(1);
    });

    test("updates correctly when source changes while released", () => {
        let runs = 0;
        const s1 = signal(1);
        const c1 = compute((c) => {
            runs++;
            return c.read(s1);
        }, undefined, OPT_WEAK);

        const e1 = effect((e) => {
            e.read(c1);
        });

        runs = 0;
        e1.dispose();

        /** Change source while weak compute is released */
        s1.set(42);

        /** Reading should recompute and pick up the new value */
        expect(c1.val()).toBe(42);
        expect(runs).toBe(1);
    });

    test("non-weak compute does NOT release value when unsubscribed", () => {
        let runs = 0;
        const s1 = signal(1);
        const c1 = compute((c) => {
            runs++;
            return c.read(s1);
        });

        const e1 = effect((e) => {
            e.read(c1);
        });

        runs = 0;
        e1.dispose();

        /** Non-weak: should NOT recompute on read */
        expect(c1.val()).toBe(1);
        expect(runs).toBe(0);
    });

    test("weak compute in a chain retains while intermediate subscribes", () => {
        let runs1 = 0;
        const s1 = signal(1);
        const c1 = compute((c) => {
            runs1++;
            return c.read(s1);
        }, undefined, OPT_WEAK);
        const c2 = compute((c) => {
            return c.read(c1) * 2;
        });

        const e1 = effect((e) => {
            e.read(c2);
        });

        expect(c2.val()).toBe(2);
        runs1 = 0;

        /**
         * Disposing the effect removes e1 from c2's subscribers,
         * but c2 still subscribes to c1.  c1 should NOT release.
         */
        e1.dispose();
        expect(c1.val()).toBe(1);
        expect(runs1).toBe(0);
    });

    test("weak compute in a chain releases when intermediate disposes", () => {
        let runs1 = 0;
        const s1 = signal(1);
        const c1 = compute((c) => {
            runs1++;
            return c.read(s1);
        }, undefined, OPT_WEAK);
        const c2 = compute((c) => {
            return c.read(c1) * 2;
        });

        const e1 = effect((e) => {
            e.read(c2);
        });

        expect(c2.val()).toBe(2);
        runs1 = 0;

        /**
         * Disposing c2 unsubscribes it from c1.  c1 now has no
         * subscribers and should release its value.
         */
        c2.dispose();
        expect(c1.val()).toBe(1);
        expect(runs1).toBe(1);
    });

    test("OPT_WEAK with batch", () => {
        let runs = 0;
        const s1 = signal(1);
        const c1 = compute((c) => {
            runs++;
            return c.read(s1);
        }, undefined, OPT_WEAK);

        let effectVal = 0;
        const e1 = effect((e) => {
            effectVal = e.read(c1);
        });

        runs = 0;
        batch(() => {
            s1.set(2);
            s1.set(3);
        });
        expect(effectVal).toBe(3);
        expect(runs).toBe(1);

        runs = 0;
        e1.dispose();

        /** After release, batch update then read */
        batch(() => {
            s1.set(10);
        });
        expect(c1.val()).toBe(10);
        expect(runs).toBe(1);
    });
});
