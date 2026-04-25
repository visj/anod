import { describe, test, expect } from "#test-runner";
import { signal, root } from "#anod";

const tick = () => Promise.resolve();
const settle = () => tick().then(tick).then(tick);

describe("finalize", () => {
    test("runs after sync effect completes", () => {
        const log = [];
        const s = signal(0);
        root((r) => {
            r.effect((cx) => {
                cx.val(s);
                cx.finalize(() => log.push("finalize"));
                log.push("run");
            });
        });
        expect(log).toEqual(["run", "finalize"]);
        s.set(1);
        expect(log).toEqual(["run", "finalize", "run", "finalize"]);
    });

    test("runs when sync effect throws", () => {
        const log = [];
        root((r) => {
            r.effect((cx) => {
                cx.finalize(() => log.push("finalize"));
                cx.recover(() => { log.push("recover"); return true; });
                throw new Error("boom");
            });
        });
        expect(log).toEqual(["finalize", "recover"]);
    });

    test("multiple finalize calls run in registration order", () => {
        const log = [];
        root((r) => {
            r.effect((cx) => {
                cx.finalize(() => log.push("a"));
                cx.finalize(() => log.push("b"));
                cx.finalize(() => log.push("c"));
            });
        });
        expect(log).toEqual(["a", "b", "c"]);
    });

    test("registered in one run does not carry to next run", () => {
        const log = [];
        const s = signal(0);
        let run = 0;
        root((r) => {
            r.effect((cx) => {
                cx.val(s);
                run++;
                if (run === 1) {
                    cx.finalize(() => log.push("finalize-1"));
                }
            });
        });
        expect(log).toEqual(["finalize-1"]);
        s.set(1);
        expect(log).toEqual(["finalize-1"]);
    });

    test("runs when async effect settles normally", async () => {
        const log = [];
        root((r) => {
            r.spawn(async (cx) => {
                cx.finalize(() => log.push("finalize"));
                await cx.suspend(Promise.resolve(42));
                log.push("settled");
            });
        });
        await settle();
        expect(log).toEqual(["settled", "finalize"]);
    });

    test("runs when async effect settles with error", async () => {
        const log = [];
        root((r) => {
            r.spawn(async (cx) => {
                cx.finalize(() => log.push("finalize"));
                cx.recover(() => { log.push("recover"); return true; });
                await cx.suspend(Promise.reject(new Error("async-boom")));
            });
        });
        await settle();
        expect(log).toEqual(["finalize", "recover"]);
    });

    test("runs when effect is disposed", () => {
        const log = [];
        const r = root((r) => {
            r.effect((cx) => {
                cx.finalize(() => log.push("finalize"));
                log.push("run");
            });
        });
        expect(log).toEqual(["run", "finalize"]);
        log.length = 0;
        r.dispose();
        expect(log).toEqual([]);
    });

    test("crashing finalizer does not mask original error", () => {
        const log = [];
        root((r) => {
            r.effect((cx) => {
                cx.finalize(() => { throw new Error("finalizer-boom"); });
                cx.recover((e) => { log.push(e.error.message); return true; });
                throw new Error("original");
            });
        });
        expect(log[0]).toBe("original");
    });

    test("does not bubble to parent effect", () => {
        const log = [];
        root((r) => {
            r.effect((cx) => {
                cx.finalize(() => log.push("parent-finalize"));
                cx.effect((cx2) => {
                    cx2.finalize(() => log.push("child-finalize"));
                });
            });
        });
        expect(log).toEqual(["child-finalize", "parent-finalize"]);
    });

    test("runs when async effect throws after await", async () => {
        const log = [];
        root((r) => {
            r.spawn(async (cx) => {
                cx.finalize(() => log.push("finalize"));
                cx.recover(() => { log.push("recover"); return true; });
                await cx.suspend(Promise.resolve(1));
                throw new Error("post-await-boom");
            });
        });
        await settle();
        expect(log).toEqual(["finalize", "recover"]);
    });

    test("runs when async effect rejects without explicit suspend", async () => {
        const log = [];
        root((r) => {
            r.spawn(async (cx) => {
                cx.finalize(() => log.push("finalize"));
                cx.recover(() => { log.push("recover"); return true; });
                await cx.suspend(Promise.reject(new Error("reject")));
            });
        });
        await settle();
        expect(log).toEqual(["finalize", "recover"]);
    });

    test("runs on dispose mid-async activation", async () => {
        const log = [];
        let resolve;
        const r = root((r) => {
            r.spawn(async (cx) => {
                cx.finalize(() => log.push("finalize"));
                await cx.suspend(new Promise((r) => { resolve = r; }));
            });
        });
        await tick();
        expect(log).toEqual([]);
        r.dispose();
        expect(log).toEqual(["finalize"]);
    });
});
