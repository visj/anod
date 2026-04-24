import { describe, test, expect } from "#test-runner";
import { signal, root } from "#anod";

describe("sync compute with channel", () => {
    test("controller is aborted on re-run", () => {
        const s = signal(0);
        let aborted = false;
        let c1;
        root((r) => {
            c1 = r.compute((cx) => {
                let v = cx.val(s);
                let ctrl = cx.controller();
                ctrl.signal.addEventListener("abort", () => { aborted = true; });
                return v * 10;
            });
            r.effect(c1, () => {});
        });
        expect(c1.get()).toBe(0);
        expect(aborted).toBe(false);
        s.set(1);
        expect(c1.get()).toBe(10);
        expect(aborted).toBe(true);
    });

    test("controller is aborted on dispose", () => {
        let aborted = false;
        const r = root((r) => {
            r.compute((cx) => {
                let ctrl = cx.controller();
                ctrl.signal.addEventListener("abort", () => { aborted = true; });
                return 1;
            }).get();
        });
        expect(aborted).toBe(false);
        r.dispose();
        expect(aborted).toBe(true);
    });

    test("each re-run gets a fresh controller", () => {
        const s = signal(0);
        let controllers = [];
        let c1;
        root((r) => {
            c1 = r.compute((cx) => {
                let v = cx.val(s);
                controllers.push(cx.controller());
                return v;
            });
            r.effect(c1, () => {});
        });
        s.set(1);
        s.set(2);
        expect(controllers.length).toBe(3);
        expect(controllers[0]).not.toBe(controllers[1]);
        expect(controllers[1]).not.toBe(controllers[2]);
        expect(controllers[0].signal.aborted).toBe(true);
        expect(controllers[1].signal.aborted).toBe(true);
        expect(controllers[2].signal.aborted).toBe(false);
    });
});
