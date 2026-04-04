import { describe, test, expect } from "bun:test";
import { signal, compute, effect, CTX_PROMISE, CTX_ITERABLE } from "../";

const tick = () => Promise.resolve();

describe("async", () => {
    describe("promise", () => {
        test("is loading while the promise is pending", async () => {
            let resolve;
            const c1 = compute((c) => { c.async(CTX_PROMISE); return new Promise(r => { resolve = r; }); });

            expect(c1.loading()).toBe(true);

            resolve(42);
            await tick();

            expect(c1.loading()).toBe(false);
        });

        test("returns seed value while loading", async () => {
            let resolve;
            const c1 = compute((c) => { c.async(CTX_PROMISE); return new Promise(r => { resolve = r; }); }, 0);

            expect(c1.val()).toBe(0);
            expect(c1.loading()).toBe(true);

            resolve(99);
            await tick();

            expect(c1.val()).toBe(99);
            expect(c1.loading()).toBe(false);
        });

        test("settles to the resolved value", async () => {
            const c1 = compute((c) => { c.async(CTX_PROMISE); return Promise.resolve(42); });

            expect(c1.loading()).toBe(true);
            await tick();

            expect(c1.val()).toBe(42);
            expect(c1.loading()).toBe(false);
            expect(c1.error()).toBe(false);
        });

        test("sets error flag on rejection", async () => {
            const c1 = compute((c) => { c.async(CTX_PROMISE); return Promise.reject(new Error("async error")); });

            await tick();

            expect(c1.error()).toBe(true);
            expect(c1.loading()).toBe(false);
        });

        test("rethrows the error when read after rejection", async () => {
            const c1 = compute((c) => { c.async(CTX_PROMISE); return Promise.reject(new Error("async error")); });

            await tick();

            expect(() => c1.val()).toThrow("async error");
        });

        test("clears error on subsequent successful resolution", async () => {
            const s1 = signal(true);
            const c1 = compute((c) => {
                c.async(CTX_PROMISE);
                return c.read(s1)
                    ? Promise.reject(new Error("fail"))
                    : Promise.resolve(42);
            });

            await tick();
            expect(c1.error()).toBe(true);

            s1.set(false);
            c1.val(); // Pull to trigger re-evaluation
            await tick();

            expect(c1.error()).toBe(false);
            expect(c1.val()).toBe(42);
        });

        test("notifies downstream effect when promise settles", async () => {
            const c1 = compute((c) => { c.async(CTX_PROMISE); return Promise.resolve(42); });
            let received = void 0;

            effect((e) => { received = e.read(c1); });

            expect(received).toBeUndefined(); // seed while loading
            await tick();

            expect(received).toBe(42);
        });

        test("ignores stale promise when signal updates before it resolves", async () => {
            const resolvers = [];
            const s1 = signal(0);

            const c1 = compute((c) => {
                c.async(CTX_PROMISE);
                const v = c.read(s1);
                return new Promise(r => { resolvers[v] = r; });
            });

            // Trigger a second promise by updating the signal
            s1.set(1);
            c1.val(); // Pull to trigger re-evaluation with new signal value

            // Resolve the stale (first) promise — should be ignored
            resolvers[0](100);
            await tick();

            expect(c1.loading()).toBe(true); // still loading; second promise not yet resolved

            // Resolve the current (second) promise
            resolvers[1](200);
            await tick();

            expect(c1.val()).toBe(200);
            expect(c1.loading()).toBe(false);
        });
    });

    describe("async iterator", () => {
        test("is loading before the first yield", () => {
            let resolver;
            const iter = {
                [Symbol.asyncIterator]() { return this; },
                next() { return new Promise(r => { resolver = r; }); }
            };

            const c1 = compute((c) => { c.async(CTX_ITERABLE); return iter; });

            expect(c1.loading()).toBe(true);
            expect(c1.val()).toBeUndefined();

            // prevent unhandled-rejection noise from a never-resolved promise
            resolver({ done: true });
        });

        test("settles on each yielded value and notifies downstream", async () => {
            const resolvers = [];
            const iter = {
                [Symbol.asyncIterator]() { return this; },
                next() { return new Promise(r => resolvers.push(r)); },
                return() { return Promise.resolve({ done: true }); }
            };

            const c1 = compute((c) => { c.async(CTX_ITERABLE); return iter; });
            const values = [];

            // Always call c1.val() so the effect subscribes to c1 as a dependency;
            // without this, c1 is never tracked and the effect won't re-run on settle.
            effect((e) => {
                const v = e.read(c1);
                if (!c1.loading()) {
                    values.push(v);
                }
            });

            // Each resolver[n] is created by the previous onNext calling iterator.next()
            resolvers[0]({ value: 1, done: false });
            await tick();
            expect(values).toEqual([1]);

            resolvers[1]({ value: 2, done: false });
            await tick();
            expect(values).toEqual([1, 2]);

            resolvers[2]({ value: 3, done: false });
            await tick();
            expect(values).toEqual([1, 2, 3]);
        });

        test("is not loading after first yield", async () => {
            let resolver;
            const iter = {
                [Symbol.asyncIterator]() { return this; },
                next() { return new Promise(r => { resolver = r; }); },
                return() { return Promise.resolve({ done: true }); }
            };

            const c1 = compute((c) => { c.async(CTX_ITERABLE); return iter; });

            expect(c1.loading()).toBe(true);

            resolver({ value: 42, done: false });
            await tick();

            expect(c1.loading()).toBe(false);
            expect(c1.val()).toBe(42);
        });

        test("sets error flag when the iterator rejects", async () => {
            async function* failing() {
                throw new Error("iterator error");
            }

            const c1 = compute((c) => { c.async(CTX_ITERABLE); return failing(); });

            await tick();

            expect(c1.error()).toBe(true);
            expect(() => c1.val()).toThrow("iterator error");
        });

        test("calls return() on the stale iterator when it next yields", async () => {
            let resolveStale;
            let returnCalled = false;

            // An iterator whose first next() won't resolve until we manually trigger it
            const staleIter = {
                [Symbol.asyncIterator]() { return this; },
                next() { return new Promise(r => { resolveStale = r; }); },
                return() {
                    returnCalled = true;
                    return Promise.resolve({ value: undefined, done: true });
                }
            };

            const s1 = signal(true);
            const c1 = compute((c) => {
                if (c.read(s1)) {
                    c.async(CTX_ITERABLE);
                    return staleIter;
                }
                c.async(CTX_ITERABLE);
                return (async function*() { yield 99; })();
            });

            // Signal update — c1 re-runs, picks up the new generator; staleIter is now stale
            s1.set(false);
            c1.val(); // Pull to trigger re-evaluation
            // Async generators need 2 microtask steps to resolve a yield in JSC/Bun
            await tick();
            await tick();

            expect(c1.val()).toBe(99);

            // staleIter's pending next() now resolves — return() must be called
            resolveStale({ value: 42, done: false });
            await tick();

            expect(returnCalled).toBe(true);
            expect(c1.val()).toBe(99); // value unchanged by the stale yield
        });
    });
});
