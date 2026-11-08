import { describe, test, expect } from "#test-runner";
import {
    signal,
    resource,
    root,
    c,
    STABLE,
    WEAK,
    EAGER,
    DEFER,
    DISPOSED,
    LOADING,
    ERROR,
    REFUSE,
    PANIC
} from "#anod";
import { FLAG_STALE, FLAG_OWNER, FLAG_MUTABLE } from "#anod-internal";

const tick = () => Promise.resolve();
const settle = () => tick().then(tick).then(tick);

describe("is()", () => {
    test("reads back the creation options of a compute", () => {
        const s = signal(1);
        const plain = c.compute((cx) => cx.val(s));
        const stable = c.compute((cx) => cx.val(s), undefined, STABLE);
        const weak = c.compute((cx) => cx.val(s), undefined, WEAK);
        const eager = c.compute((cx) => cx.val(s), undefined, EAGER);
        const deferred = c.compute((cx) => cx.val(s), undefined, DEFER);
        expect([plain.is(STABLE), plain.is(WEAK), plain.is(EAGER), plain.is(DEFER)]).toEqual([false, false, false, false]);
        expect(stable.is(STABLE)).toBe(true);
        expect(weak.is(WEAK)).toBe(true);
        expect(eager.is(EAGER)).toBe(true);
        expect(deferred.is(DEFER)).toBe(true);
        expect(stable.is(WEAK)).toBe(false);
    });

    test("JavaScript can pass several options at creation", () => {
        const s = signal(1);
        const n = c.compute((cx) => cx.val(s), undefined, STABLE | WEAK);
        expect([n.is(STABLE), n.is(WEAK), n.is(EAGER)]).toEqual([true, true, false]);
    });

    test("a bound node is always stable", () => {
        const s = signal(1);
        const n = c.compute(s, (v) => v + 1);
        let inside;
        c.effect(s, (v, cx) => {
            inside = cx.is(STABLE);
        });
        expect(n.is(STABLE)).toBe(true);
        expect(inside).toBe(true);
    });

    test("works on c inside the node's own callback", () => {
        const s = signal(1);
        let seen;
        const n = c.compute((cx) => {
            seen = [cx.is(STABLE), cx.is(DISPOSED)];
            return cx.val(s);
        }, undefined, STABLE);
        n.get();
        expect(seen).toEqual([true, false]);
    });

    test("DISPOSED on computes, effects and roots", () => {
        let child;
        const r = root((cx) => {
            child = cx.effect(() => {});
        });
        const n = c.compute(() => 1);
        expect([r.is(DISPOSED), child.is(DISPOSED), n.is(DISPOSED)]).toEqual([false, false, false]);
        n.dispose();
        r.dispose();
        expect([r.is(DISPOSED), child.is(DISPOSED), n.is(DISPOSED)]).toEqual([true, true, true]);
    });

    test("ERROR on a compute that threw, cleared when it recovers", () => {
        const s = signal(1);
        const n = c.compute((cx) => {
            if (cx.val(s) > 1) {
                throw new Error("boom");
            }
            return cx.val(s);
        });
        expect(n.is(ERROR)).toBe(false);
        s.set(2);
        n.get();
        expect(n.is(ERROR)).toBe(true);
        s.set(1);
        n.get();
        expect(n.is(ERROR)).toBe(false);
    });

    test("LOADING on a task while it waits, then cleared", async () => {
        let resolve;
        const t = c.task(async (cx) => await cx.suspend(new Promise((r) => (resolve = r))));
        expect(t.is(LOADING)).toBe(true);
        resolve(5);
        await settle();
        expect(t.is(LOADING)).toBe(false);
        expect(t.get()).toBe(5);
    });

    test("LOADING and ERROR on a resource", async () => {
        const r = resource(1);
        let reject;
        r.set(async (cx) => await cx.suspend(new Promise((_, rej) => (reject = rej))));
        expect(r.is(LOADING)).toBe(true);
        reject(new Error("failed"));
        await settle();
        expect(r.is(LOADING)).toBe(false);
        expect(r.is(ERROR)).toBe(true);
    });

    test("a plain signal has no options or states", () => {
        const s = signal(1);
        expect([s.is(STABLE), s.is(DISPOSED), s.is(LOADING), s.is(ERROR)]).toEqual([false, false, false, false]);
    });

    test("a combined flag is true when any of its bits is set", async () => {
        let resolve;
        const t = c.task(async (cx) => await cx.suspend(new Promise((r) => (resolve = r))));
        expect(t.is(LOADING | ERROR)).toBe(true);
        resolve(1);
        await settle();
        expect(t.is(LOADING | ERROR)).toBe(false);
    });

    test("a flag that is not an option or a state reads as false", () => {
        const s = signal(1);
        const n = c.compute((cx) => cx.val(s));
        n.get();
        s.set(2);
        /** n is stale now, but FLAG_STALE is internal. */
        expect(n.is(FLAG_STALE)).toBe(false);
        /** REFUSE and PANIC are Defect types (1 and 2), not flags. */
        expect(n.is(REFUSE)).toBe(false);
        expect(n.is(PANIC)).toBe(false);
        const r = root(() => {});
        expect(r.is(FLAG_OWNER)).toBe(false);
        expect(signal(1, false).is(FLAG_MUTABLE)).toBe(false);
    });

    test("nodes have no option setters and no state getters", () => {
        const n = c.compute(() => 1);
        const e = c.effect(() => {});
        const r = root(() => {});
        const res = resource(1);
        for (const name of ["stable", "weak", "eager"]) {
            expect(n[name]).toBeUndefined();
            expect(e[name]).toBeUndefined();
        }
        for (const name of ["disposed", "loading", "error"]) {
            expect(name in n).toBe(false);
            expect(name in e).toBe(false);
            expect(name in r).toBe(false);
            expect(name in res).toBe(false);
        }
    });
});
