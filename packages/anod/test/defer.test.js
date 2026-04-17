import { describe, test, expect } from "bun:test";
import { signal, compute, derive, task, watch, spawn, effect, root, OPT_DEFER } from "../";

describe("OPT_DEFER", () => {
    describe("compute", () => {
        test("does not run fn until val() is read", () => {
            let runs = 0;
            const c1 = compute(() => { runs++; return 1; }, undefined, OPT_DEFER);
            expect(runs).toBe(0);
            expect(c1.val()).toBe(1);
            expect(runs).toBe(1);
        });
    });

    describe("derive (dynamic)", () => {
        test("defers initial run", () => {
            const s1 = signal(1);
            let runs = 0;
            const c1 = derive((c) => { runs++; return c.read(s1) * 2; }, undefined, OPT_DEFER);
            expect(runs).toBe(0);
            expect(c1.val()).toBe(2);
            expect(runs).toBe(1);
        });
    });

    describe("derive (bound)", () => {
        test("defers initial run; dep change triggers first run", () => {
            const s1 = signal(5);
            let runs = 0;
            const c1 = derive(s1, (v) => { runs++; return v + 1; }, undefined, OPT_DEFER);
            expect(runs).toBe(0);
            /** First val() still defers to lazy run. */
            expect(c1.val()).toBe(6);
            expect(runs).toBe(1);
        });
    });

    describe("task (bound)", () => {
        test("defers bound async compute until read", () => {
            const s1 = signal(3);
            let runs = 0;
            const c1 = task(s1, async (v) => { runs++; return v; }, undefined, OPT_DEFER);
            expect(runs).toBe(0);
        });
    });

    describe("watch (bound)", () => {
        test("does not run on creation; first run happens on dep change", async () => {
            let runs = 0;
            let observed;
            root(() => {
                const s1 = signal(1);
                watch(s1, (v) => { runs++; observed = v; }, OPT_DEFER);
                expect(runs).toBe(0);
                expect(observed).toBeUndefined();

                s1.set(2);
                expect(runs).toBe(1);
                expect(observed).toBe(2);

                s1.set(3);
                expect(runs).toBe(2);
                expect(observed).toBe(3);
            });
        });
    });

    describe("spawn (bound)", () => {
        test("does not run on creation; first run happens on dep change", () => {
            let runs = 0;
            root(() => {
                const s1 = signal(1);
                spawn(s1, async (v) => { runs++; }, OPT_DEFER);
                expect(runs).toBe(0);

                s1.set(2);
                expect(runs).toBe(1);
            });
        });
    });

    describe("unbound effect", () => {
        test("ignores OPT_DEFER — always runs initially", () => {
            let runs = 0;
            root(() => {
                effect(() => { runs++; }, OPT_DEFER);
                expect(runs).toBe(1);
            });
        });
    });

    describe("unbound watch", () => {
        test("ignores OPT_DEFER — must run once to register deps", () => {
            let runs = 0;
            root(() => {
                const s1 = signal(1);
                watch((e) => { runs++; e.read(s1); }, OPT_DEFER);
                expect(runs).toBe(1);

                s1.set(2);
                expect(runs).toBe(2);
            });
        });
    });

    describe("owned variants via proto", () => {
        test("r.derive(dep, fn, seed, OPT_DEFER) defers", () => {
            root((r) => {
                const s1 = signal(10);
                let runs = 0;
                const c1 = r.derive(s1, (v) => { runs++; return v * 2; }, undefined, OPT_DEFER);
                expect(runs).toBe(0);
                expect(c1.val()).toBe(20);
                expect(runs).toBe(1);
            });
        });

        test("r.watch(dep, fn, OPT_DEFER) defers until dep changes", () => {
            root((r) => {
                const s1 = signal("a");
                let runs = 0;
                r.watch(s1, () => { runs++; }, OPT_DEFER);
                expect(runs).toBe(0);
                s1.set("b");
                expect(runs).toBe(1);
            });
        });
    });
});
