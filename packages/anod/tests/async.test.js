import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { signal, compute, effect, task } from "./_helper.js";

const tick = () => Promise.resolve();

describe("async", { skip: true }, () => {
    describe("promise", () => {
        it("is loading while the promise is pending", async () => {
            let resolve;
            const c1 = task((c) => { return new Promise(r => { resolve = r; }); });

            assert.strictEqual(c1.loading(), true);

            resolve(42);
            await tick();

            assert.strictEqual(c1.loading(), false);
        });

        it("returns seed value while loading", async () => {
            let resolve;
            const c1 = task((c) => { return new Promise(r => { resolve = r; }); }, 0);

            assert.strictEqual(c1.val(), 0);
            assert.strictEqual(c1.loading(), true);

            resolve(99);
            await tick();

            assert.strictEqual(c1.val(), 99);
            assert.strictEqual(c1.loading(), false);
        });

        it("settles to the resolved value", async () => {
            const c1 = task((c) => { return Promise.resolve(42); });

            assert.strictEqual(c1.loading(), true);
            await tick();

            assert.strictEqual(c1.val(), 42);
            assert.strictEqual(c1.loading(), false);
            assert.strictEqual(c1.error(), false);
        });

        it("sets error flag on rejection", async () => {
            const c1 = task((c) => { return Promise.reject(new Error("async error")); });

            await tick();

            assert.strictEqual(c1.error(), true);
            assert.strictEqual(c1.loading(), false);
        });

        it("rethrows the error when read after rejection", async () => {
            const c1 = task((c) => { return Promise.reject(new Error("async error")); });

            await tick();

            assert.throws(() => c1.val(), { message: "async error" });
        });

        it("notifies downstream effect when promise settles", async () => {
            const c1 = task((c) => { return Promise.resolve(42); });
            let received = void 0;

            effect((e) => { received = e.read(c1); });

            assert.strictEqual(received, undefined);
            await tick();

            assert.strictEqual(received, 42);
        });
    });
});
