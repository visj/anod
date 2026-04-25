import { describe, test, expect } from "#test-runner";
import { signal, resource, root, batch } from "#anod";

const tick = () => Promise.resolve();
const settle = () => tick().then(tick).then(tick);

describe("resource", () => {
    describe("basic", () => {
        test("creates with correct initial value", () => {
            const r = resource(42);
            expect(r.get()).toBe(42);
        });

        test("sync set works identically to signal", () => {
            const r = resource(1);
            r.set(2);
            expect(r.get()).toBe(2);
        });

        test("sync set with updater", () => {
            const r = resource(10);
            r.set((prev) => prev + 5);
            expect(r.get()).toBe(15);
        });

        test("initial loading and error are false", () => {
            const r = resource(0);
            expect(r.loading).toBe(false);
            expect(r.error).toBe(false);
        });

        test("notifies subscribers on sync set", () => {
            root((c) => {
                const r = resource(0);
                let seen = [];
                c.effect(r, (val) => { seen.push(val); });
                r.set(1);
                r.set(2);
                expect(seen).toEqual([0, 1, 2]);
            });
        });
    });

    describe("async set", () => {
        test("writes optimistic value immediately", async () => {
            const r = resource(0);
            r.set(42, async (c, prev) => {
                return await c.suspend(Promise.resolve(prev));
            });
            expect(r.get()).toBe(42);
        });

        test("subscribers see optimistic value before settle", async () => {
            let seen = [];
            root((c) => {
                const r = resource("old");
                c.effect(r, (val) => { seen.push(val); });
                r.set("optimistic", async (c, prev) => {
                    return await c.suspend(
                        new Promise((resolve) => setTimeout(() => resolve("server"), 10))
                    );
                });
            });
            expect(seen).toEqual(["old", "optimistic"]);
        });

        test("loading is true while async pending", async () => {
            const r = resource(0);
            r.set(1, async (c, prev) => {
                return await c.suspend(Promise.resolve(prev));
            });
            expect(r.loading).toBe(true);
            await settle();
            expect(r.loading).toBe(false);
        });

        test("settled value replaces optimistic if different", async () => {
            const r = resource(0);
            r.set(100, async (c, prev) => {
                return await c.suspend(Promise.resolve(50));
            });
            expect(r.get()).toBe(100);
            await settle();
            expect(r.get()).toBe(50);
        });

        test("settled value same as optimistic — no re-notification", async () => {
            let notifyCount = 0;
            root((c) => {
                const r = resource(0);
                c.effect(r, () => { notifyCount++; });
                notifyCount = 0;
                r.set(42, async (c, prev) => {
                    return await c.suspend(Promise.resolve(42));
                });
                expect(notifyCount).toBe(1);
            });
            await settle();
            expect(notifyCount).toBe(1);
        });

        test("asyncFn receives context and optimistic value", async () => {
            let received = null;
            const r = resource("initial");
            r.set("updated", async (c, prev) => {
                received = prev;
                return await c.suspend(Promise.resolve(prev));
            });
            expect(received).toBe("updated");
        });

        test("asyncFn with updater receives resolved value", async () => {
            let received = null;
            const r = resource(10);
            r.set((prev) => prev + 5, async (c, prev) => {
                received = prev;
                return await c.suspend(Promise.resolve(prev));
            });
            expect(r.get()).toBe(15);
            expect(received).toBe(15);
        });
    });

    describe("error", () => {
        test("rejection sets error flag", async () => {
            const r = resource(0);
            r.set(1, async (c, prev) => {
                return await c.suspend(Promise.reject(new Error("fail")));
            });
            await settle();
            expect(r.error).toBe(true);
            expect(r.loading).toBe(false);
        });

        test("error POJO accessible via get()", async () => {
            const r = resource(0);
            r.set(1, async (c, prev) => {
                return await c.suspend(Promise.reject(new Error("boom")));
            });
            await settle();
            expect(r.get().type).toBe(3);
            expect(r.get().error.message).toBe("boom");
        });

        test("sync throw in asyncFn sets error", () => {
            const r = resource(0);
            r.set(1, (c, prev) => {
                throw new Error("sync fail");
            });
            expect(r.error).toBe(true);
            expect(r.get().error.message).toBe("sync fail");
        });

        test("error cleared on next successful set", async () => {
            const r = resource(0);
            r.set(1, async (c, prev) => {
                return await c.suspend(Promise.reject(new Error("fail")));
            });
            await settle();
            expect(r.error).toBe(true);

            r.set(2, async (c, prev) => {
                return await c.suspend(Promise.resolve(prev));
            });
            await settle();
            expect(r.error).toBe(false);
            expect(r.get()).toBe(2);
        });
    });

    describe("last-write-wins", () => {
        test("rapid sets — only last settles", async () => {
            let settled = [];
            const r = resource(0);
            r.set(1, async (c, prev) => {
                let val = await c.suspend(
                    new Promise((resolve) => setTimeout(() => resolve(prev), 10))
                );
                settled.push(val);
                return val;
            });
            r.set(2, async (c, prev) => {
                let val = await c.suspend(
                    new Promise((resolve) => setTimeout(() => resolve(prev), 10))
                );
                settled.push(val);
                return val;
            });
            r.set(3, async (c, prev) => {
                let val = await c.suspend(
                    new Promise((resolve) => setTimeout(() => resolve(prev), 10))
                );
                settled.push(val);
                return val;
            });
            expect(r.get()).toBe(3);
            await new Promise((resolve) => setTimeout(resolve, 50));
            expect(settled).toEqual([3]);
            expect(r.get()).toBe(3);
        });

        test("stale promise resolve is discarded", async () => {
            let resolveFirst;
            const r = resource(0);
            r.set(1, async (c, prev) => {
                return await c.suspend(new Promise((resolve) => { resolveFirst = resolve; }));
            });
            expect(r.loading).toBe(true);

            r.set(2, async (c, prev) => {
                return await c.suspend(Promise.resolve(prev));
            });
            await settle();
            expect(r.get()).toBe(2);
            expect(r.loading).toBe(false);

            resolveFirst(999);
            await settle();
            expect(r.get()).toBe(2);
        });
    });

    describe("suspend and controller", () => {
        test("c.suspend(promise) works inside asyncFn", async () => {
            const r = resource(0);
            r.set(1, async (c, prev) => {
                let data = await c.suspend(Promise.resolve({ value: prev * 10 }));
                return data.value;
            });
            await settle();
            expect(r.get()).toBe(10);
        });

        test("callback suspend works", async () => {
            const r = resource(0);
            r.set(1, (c, prev) => {
                c.suspend((resolve, reject) => {
                    setTimeout(() => resolve(prev * 100), 10);
                });
            });
            expect(r.loading).toBe(true);
            await new Promise((resolve) => setTimeout(resolve, 50));
            expect(r.loading).toBe(false);
            expect(r.get()).toBe(100);
        });
    });

    describe("post with async", () => {
        test("post defers both optimistic write and asyncFn to drain", async () => {
            const r = resource(0);
            let asyncRan = false;
            r.post(5, async (c, prev) => {
                asyncRan = true;
                return await c.suspend(Promise.resolve(prev));
            });
            /** Nothing has run yet — post defers everything. */
            expect(r.get()).toBe(0);
            expect(asyncRan).toBe(false);
            expect(r.loading).toBe(false);

            /** After microtask flush: value written, asyncFn started. */
            await Promise.resolve();
            expect(r.get()).toBe(5);
            expect(asyncRan).toBe(true);
            expect(r.loading).toBe(true);

            await settle();
            expect(r.loading).toBe(false);
        });

        test("LWW works with post", async () => {
            const r = resource(0);
            r.post(1, async (c, prev) => {
                return await c.suspend(
                    new Promise((resolve) => setTimeout(() => resolve(prev), 20))
                );
            });
            r.post(2, async (c, prev) => {
                return await c.suspend(
                    new Promise((resolve) => setTimeout(() => resolve(prev), 20))
                );
            });
            await Promise.resolve();
            expect(r.get()).toBe(2);
            await new Promise((resolve) => setTimeout(resolve, 50));
            expect(r.get()).toBe(2);
        });

        test("multiple posts resolve prev correctly through drain queue", async () => {
            let prevValues = [];
            const r = resource(0);
            r.post((prev) => prev + 1, async (c, prev) => {
                prevValues.push(prev);
                return await c.suspend(Promise.resolve(prev));
            });
            r.post((prev) => prev + 10, async (c, prev) => {
                prevValues.push(prev);
                return await c.suspend(Promise.resolve(prev));
            });
            r.post((prev) => prev + 100, async (c, prev) => {
                prevValues.push(prev);
                return await c.suspend(Promise.resolve(prev));
            });
            expect(r.get()).toBe(0);
            await Promise.resolve();
            /** Each updater sees the value AFTER previous updaters applied:
             *  0+1=1, 1+10=11, 11+100=111 */
            expect(r.get()).toBe(111);
            expect(prevValues).toEqual([1, 11, 111]);
        });
    });

    describe("integration: optimistic update patterns", () => {
        test("like button — hammer set, only last persists", async () => {
            const likes = resource(0);
            let serverSaves = [];

            for (let i = 1; i <= 5; i++) {
                likes.set(i, async (c, prev) => {
                    let result = await c.suspend(
                        new Promise((resolve) => setTimeout(() => resolve(prev), 10))
                    );
                    serverSaves.push(result);
                    return result;
                });
            }
            expect(likes.get()).toBe(5);
            await new Promise((resolve) => setTimeout(resolve, 50));
            expect(serverSaves).toEqual([5]);
            expect(likes.get()).toBe(5);
        });

        test("server correction — settle overwrites optimistic", async () => {
            const price = resource(100);
            price.set(200, async (c, prev) => {
                let serverVal = Math.min(prev, 50);
                return await c.suspend(Promise.resolve(serverVal));
            });
            expect(price.get()).toBe(200);
            await settle();
            expect(price.get()).toBe(50);
        });

        test("server rejection — error flag set", async () => {
            const data = resource({ name: "alice" });
            data.set({ name: "bob" }, async (c, prev) => {
                return await c.suspend(Promise.reject(new Error("unauthorized")));
            });
            expect(data.get()).toEqual({ name: "bob" });
            await settle();
            expect(data.error).toBe(true);
            expect(data.get().type).toBe(3);
        });

        test("effect sees optimistic then settled", async () => {
            let seen = [];
            await new Promise((done) => {
                root((c) => {
                    const r = resource("initial");
                    c.effect(r, (val) => {
                        seen.push(typeof val === "string" ? val : "settled");
                    });
                    r.set("optimistic", async (c, prev) => {
                        return await c.suspend(Promise.resolve("confirmed"));
                    });
                    settle().then(() => {
                        expect(seen).toEqual(["initial", "optimistic", "confirmed"]);
                        done();
                    });
                });
            });
        });

        test("unchanged value but async still runs", async () => {
            let asyncRan = false;
            const r = resource(5);
            r.set(5, async (c, prev) => {
                asyncRan = true;
                return await c.suspend(Promise.resolve(prev));
            });
            expect(asyncRan).toBe(true);
        });

        test("resource in batch context", () => {
            const r = resource(0);
            let seen = [];
            root((c) => {
                c.effect(r, (val) => { seen.push(val); });
                batch(() => {
                    r.set(1);
                    r.set(2);
                    r.set(3);
                });
            });
            expect(seen).toEqual([0, 3]);
        });
    });
});
