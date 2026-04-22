import { describe, test, expect } from "bun:test";
import { c } from '@fyren/core';
import '@fyren/list';
import '../src/stream.js';

const tick = () => Promise.resolve();
const settle = () => tick().then(tick).then(tick).then(tick).then(tick);

describe("mapAsync", () => {
    test("maps array elements through async callback", async () => {
        const l = c.list([1, 2, 3]);
        const m = l.mapAsync(async (val) => {
            return val * 10;
        });

        expect(m.loading).toBe(true);
        await settle();
        expect(m.get()).toEqual([10, 20, 30]);
    });

    test("executes callbacks sequentially", async () => {
        const l = c.list([1, 2, 3]);
        let order = [];

        const m = l.mapAsync(async (val) => {
            order.push("start:" + val);
            await tick();
            order.push("end:" + val);
            return val;
        });

        await settle();
        expect(order).toEqual([
            "start:1", "end:1",
            "start:2", "end:2",
            "start:3", "end:3"
        ]);
    });

    test("re-runs when source list changes", async () => {
        const l = c.list([1, 2]);
        const m = l.mapAsync(async (val) => {
            return val * 10;
        });

        await settle();
        expect(m.get()).toEqual([10, 20]);

        l.set([3, 4, 5]);
        /** Pull to trigger re-run. */
        m.get();
        await settle();
        expect(m.get()).toEqual([30, 40, 50]);
    });

    test("source change during async: re-run produces new result", async () => {
        const l = c.list([1, 2, 3]);

        const m = l.mapAsync(async (val) => {
            await tick();
            return val * 10;
        });

        /** Wait for first run to complete. */
        await settle();
        expect(m.get()).toEqual([10, 20, 30]);

        /** Change list — node is marked stale. Pull to trigger re-run. */
        l.set([4, 5]);
        m.get();
        await settle();

        expect(m.get()).toEqual([40, 50]);
    });

    test("downstream compute reacts after settle", async () => {
        const l = c.list([1, 2, 3]);
        const m = l.mapAsync(async (val) => val * 10);

        const sum = c.compute(m, (arr) => arr ? arr.reduce((a, b) => a + b, 0) : 0);

        /** m is loading, sum sees undefined → 0. */
        expect(sum.get()).toBe(0);

        await settle();
        expect(sum.get()).toBe(60);
    });

    test("handles sync and async return values mixed", async () => {
        const l = c.list([1, 2, 3]);
        const m = l.mapAsync((val) => {
            if (val % 2 === 0) {
                return Promise.resolve(val * 100);
            }
            return val * 10;
        });

        await settle();
        expect(m.get()).toEqual([10, 200, 30]);
    });

    test("callback receives index and array", async () => {
        const l = c.list(["a", "b"]);
        let indices = [];
        let arrays = [];

        const m = l.mapAsync(async (val, idx, arr) => {
            indices.push(idx);
            arrays.push(arr);
            return val;
        });

        await settle();
        expect(indices).toEqual([0, 1]);
        expect(arrays[0]).toEqual(["a", "b"]);
    });

    test("empty array resolves immediately", async () => {
        const l = c.list([]);
        const m = l.mapAsync(async (val) => val);

        await settle();
        expect(m.get()).toEqual([]);
    });

    test("error in callback sets error on compute", async () => {
        const l = c.list([1, 2, 3]);
        const m = l.mapAsync(async (val) => {
            if (val === 2) {
                throw new Error("bad value");
            }
            return val;
        });

        await settle();
        expect(m.error).not.toBeNull();
    });
});
