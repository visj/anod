import { describe, test, expect } from "#test-runner";
import { signal, relay, root, batch } from "#anod";

let c; root((_c) => { c = _c; });

describe("signal.set() return value", () => {
    test("returns true when value changes", () => {
        const s = signal(1);
        expect(s.set(2)).toBe(true);
        expect(s.get()).toBe(2);
    });

    test("returns false when value is the same", () => {
        const s = signal(5);
        expect(s.set(5)).toBe(false);
    });

    test("returns true with updater function that changes value", () => {
        const s = signal(1);
        expect(s.set((v) => v + 1)).toBe(true);
        expect(s.get()).toBe(2);
    });

    test("returns false with updater function that returns same value", () => {
        const s = signal(5);
        expect(s.set((v) => v)).toBe(false);
    });

    test("returns false for same reference (object)", () => {
        const obj = { a: 1 };
        const s = signal(obj);
        expect(s.set(obj)).toBe(false);
    });

    test("returns true for different reference (object)", () => {
        const s = signal({ a: 1 });
        expect(s.set({ a: 1 })).toBe(true);
    });

    test("returns false for same value inside batch", () => {
        const s = signal(5);
        let result;
        batch(() => {
            result = s.set(5);
        });
        expect(result).toBe(false);
    });

    test("returns true for changed value inside batch", () => {
        const s = signal(5);
        let result;
        batch(() => {
            result = s.set(10);
        });
        expect(result).toBe(true);
    });

    test("returns true for updater inside batch (deferred comparison)", () => {
        const s = signal(5);
        let result;
        batch(() => {
            result = s.set((v) => v + 1);
        });
        expect(result).toBe(true);
    });
});

describe("relay.set() return value", () => {
    test("returns true when value changes", () => {
        const r = relay(1);
        expect(r.set(2)).toBe(true);
    });

    test("returns true even when value is the same", () => {
        const r = relay(5);
        expect(r.set(5)).toBe(true);
    });

    test("returns true with same reference (object)", () => {
        const obj = { a: 1 };
        const r = relay(obj);
        expect(r.set(obj)).toBe(true);
    });

    test("returns true for same value inside batch", () => {
        const r = relay(5);
        let result;
        batch(() => {
            result = r.set(5);
        });
        expect(result).toBe(true);
    });
});

describe("signal.post() return value", () => {
    test("returns true when value differs", () => {
        const s = signal(1);
        expect(s.post(2)).toBe(true);
    });

    test("returns false when value is the same", () => {
        const s = signal(5);
        expect(s.post(5)).toBe(false);
    });

    test("returns true with updater function (deferred)", () => {
        const s = signal(5);
        expect(s.post((v) => v)).toBe(true);
    });

    test("returns true for different reference", () => {
        const s = signal({ a: 1 });
        expect(s.post({ a: 1 })).toBe(true);
    });

    test("returns false for same reference", () => {
        const obj = { a: 1 };
        const s = signal(obj);
        expect(s.post(obj)).toBe(false);
    });
});

describe("relay.post() return value", () => {
    test("returns true when value changes", () => {
        const r = relay(1);
        expect(r.post(2)).toBe(true);
    });

    test("returns true even when value is the same", () => {
        const r = relay(5);
        expect(r.post(5)).toBe(true);
    });
});
