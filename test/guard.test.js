import { describe, test, expect } from "#test-runner";
import { signal, resource, c } from "#anod";

describe("signal equality", () => {
    test("a write notifies when the value is not === the current one", () => {
        const s = signal(5);
        let runs = 0;
        c.effect(s, () => { runs++; });
        expect(s.set(5)).toBe(false);
        expect(runs).toBe(1);
        expect(s.set(6)).toBe(true);
        expect(runs).toBe(2);
    });

    test("a function in place of false is ignored: writes compare with ===", () => {
        const s = signal({ id: 1 }, (prev, next) => prev.id === next.id);
        let runs = 0;
        c.effect(s, () => { runs++; });
        s.set({ id: 1 });
        expect(runs).toBe(2);
        const r = resource({ id: 1 }, (prev, next) => prev.id === next.id);
        let reads = 0;
        c.effect(r, () => { reads++; });
        r.set({ id: 1 });
        expect(reads).toBe(2);
    });

    test("a compute over one field cuts off its readers, in place of an equality function", () => {
        const user = signal({ id: 1, name: "a" });
        const name = c.compute(user, (u) => u.name);
        const seen = [];
        c.effect(name, (n) => { seen.push(n); });
        user.set({ id: 2, name: "a" });
        user.set({ id: 2, name: "b" });
        expect(seen).toEqual(["a", "b"]);
    });
});
