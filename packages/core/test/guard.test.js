import { describe, test, expect } from "#test-runner";
import { signal, root } from "#fyren";

let c; root((_c) => { c = _c; });

describe.skip("signal guard", () => {
    describe("custom equality", () => {
        test("skips set when guard returns true (equal)", () => {
            const s = signal(
                { id: 1, name: "a" },
                (prev, next) => prev.id === next.id
            );
            let runs = 0;
            c.effect(s, () => { runs++; });
            expect(runs).toBe(1);

            s.set({ id: 1, name: "b" });
            expect(runs).toBe(1);
        });

        test("allows set when guard returns false (not equal)", () => {
            const s = signal(
                { id: 1, name: "a" },
                (prev, next) => prev.id === next.id
            );
            let runs = 0;
            c.effect(s, () => { runs++; });
            expect(runs).toBe(1);

            s.set({ id: 2, name: "b" });
            expect(runs).toBe(2);
        });

        test("falls back to !== when no guard provided", () => {
            const s = signal(5);
            let runs = 0;
            c.effect(s, () => { runs++; });
            expect(runs).toBe(1);

            s.set(5);
            expect(runs).toBe(1);

            s.set(6);
            expect(runs).toBe(2);
        });
    });

    describe("validation via throw", () => {
        test("passes valid value", () => {
            const s = signal(1, (prev, next) => {
                if (typeof next !== "number") {
                    throw new Error("Must be number");
                }
                return prev === next;
            });
            s.set(2);
            expect(s.get()).toBe(2);
        });

        test("throws on invalid value", () => {
            const s = signal(1, (prev, next) => {
                if (typeof next !== "number") {
                    throw new Error("Must be number");
                }
                return prev === next;
            });
            expect(() => s.set("x")).toThrow("Must be number");
            expect(s.get()).toBe(1);
        });

        test("does not update value when guard throws", () => {
            const s = signal(5, (prev, next) => {
                if (next <= 0) {
                    throw new Error("Must be positive");
                }
                return prev === next;
            });
            try { s.set(-1); } catch (_) { }
            expect(s.get()).toBe(5);
        });
    });

    describe("reactive integration", () => {
        test("bound compute reads guarded signal", () => {
            const s = signal(3, (prev, next) => prev === next);
            const doubled = c.compute(s, (val) => val * 2);
            expect(doubled.get()).toBe(6);

            s.set(5);
            expect(doubled.get()).toBe(10);
        });

        test("dynamic compute reads guarded signal", () => {
            const s = signal(3, (prev, next) => prev === next);
            const doubled = c.compute((cx) => cx.val(s) * 2);
            expect(doubled.get()).toBe(6);

            s.set(5);
            expect(doubled.get()).toBe(10);
        });

        test("bound effect fires on guarded signal update", () => {
            const s = signal(0, (prev, next) => prev === next);
            let last = -1;
            c.effect(s, (val) => { last = val; });
            expect(last).toBe(0);

            s.set(1);
            expect(last).toBe(1);
        });

        test("guarded signal works in compute chain", () => {
            const s = signal(1, (prev, next) => {
                if (typeof next !== "number") {
                    throw new Error("Must be number");
                }
                return prev === next;
            });
            const doubled = c.compute(s, (val) => val * 2);

            expect(doubled.get()).toBe(2);

            s.set(3);
            expect(doubled.get()).toBe(6);

            expect(() => s.set("x")).toThrow("Must be number");
            expect(doubled.get()).toBe(6);
        });
    });
});
