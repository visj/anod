import { describe, test, expect } from "bun:test";
import { list } from "../";
import { signal, compute, effect, batch, root } from "@anod/signal";

describe("forEach", () => {
    test("iterates over all elements", () => {
        const l = list([1, 2, 3]);
        const result = [];
        const e = l.forEach((x) => { result.push(x); });
        expect(result).toEqual([1, 2, 3]);
    });

    test("callback receives index", () => {
        const l = list(["a", "b"]);
        const indices = [];
        const e = l.forEach((_, i) => { indices.push(i); });
        expect(indices).toEqual([0, 1]);
    });

    test("re-runs when source changes", () => {
        const l = list([1, 2]);
        const result = [];
        const e = l.forEach((x) => { result.push(x); });
        expect(result).toEqual([1, 2]);
        l.set([10, 20, 30]);
        expect(result).toEqual([1, 2, 10, 20, 30]);
    });

    test("creates an effect (not a compute)", () => {
        const l = list([1]);
        const e = l.forEach(() => {});
        // Effects have dispose but no val()
        expect(typeof e.dispose).toBe("function");
    });

    test("stops running after dispose", () => {
        const l = list([1]);
        const result = [];
        const e = l.forEach((x) => { result.push(x); });
        expect(result).toEqual([1]);
        e.dispose();
        l.set([2, 3]);
        expect(result).toEqual([1]);
    });

    test("re-runs on mutation methods", () => {
        const l = list([1]);
        const result = [];
        const e = l.forEach((x) => { result.push(x); });
        expect(result).toEqual([1]);
        l.push(2);
        expect(result).toEqual([1, 1, 2]);
    });
});
