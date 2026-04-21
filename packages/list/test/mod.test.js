import { describe, test, expect } from "#test-runner";
import { c } from "@fyren/core";
import "../src/list.js";

/**
 * Mod bit layout (after >>> 6 to strip sender flags):
 *   Bits 0-2: op (MUT_ADD=1, MUT_DEL=2, MUT_SORT=4)
 *   Bits 3-8: length (6 bits, max 63)
 *   Bits 9-25: position (17 bits, max 131071)
 */

describe("_mod encoding", () => {
    /** Helper: create a derived compute that captures the mod on each run */
    function readMod(l) {
        let mod = 0;
        const comp = l.map((x) => { mod = comp._getMod(); return x; });
        comp.get(); // initial run
        return () => { comp.get(); return mod; };
    }

    test("push sets MUT_ADD with correct position and length", () => {
        const l = c.list([1, 2, 3]);
        const getMod = readMod(l);

        l.push(4);
        let mod = getMod();
        expect(mod & 7).toBe(1); // MUT_ADD
        expect((mod >>> 9) & 0x1FFFF).toBe(3); // pos = old length
        expect((mod >>> 3) & 0x3F).toBe(1); // len = 1
    });

    test("push multiple items", () => {
        const l = c.list([1, 2]);
        const getMod = readMod(l);

        l.push(3, 4, 5);
        let mod = getMod();
        expect(mod & 7).toBe(1); // MUT_ADD
        expect((mod >>> 9) & 0x1FFFF).toBe(2); // pos = old length
        expect((mod >>> 3) & 0x3F).toBe(3); // len = 3
    });

    test("pop sets MUT_DEL with correct position", () => {
        const l = c.list([1, 2, 3]);
        const getMod = readMod(l);

        l.pop();
        let mod = getMod();
        expect(mod & 7).toBe(2); // MUT_DEL
        expect((mod >>> 9) & 0x1FFFF).toBe(2); // pos = new length
        expect((mod >>> 3) & 0x3F).toBe(1); // len = 1
    });

    test("shift sets MUT_DEL at position 0", () => {
        const l = c.list([1, 2, 3]);
        const getMod = readMod(l);

        l.shift();
        let mod = getMod();
        expect(mod & 7).toBe(2); // MUT_DEL
        expect((mod >>> 9) & 0x1FFFF).toBe(0); // pos = 0
        expect((mod >>> 3) & 0x3F).toBe(1); // len = 1
    });

    test("unshift sets MUT_ADD at position 0", () => {
        const l = c.list([1, 2, 3]);
        const getMod = readMod(l);

        l.unshift(0);
        let mod = getMod();
        expect(mod & 7).toBe(1); // MUT_ADD
        expect((mod >>> 9) & 0x1FFFF).toBe(0); // pos = 0
        expect((mod >>> 3) & 0x3F).toBe(1); // len = 1
    });

    test("sort sets MUT_SORT", () => {
        const l = c.list([3, 1, 2]);
        const getMod = readMod(l);

        l.sort();
        let mod = getMod();
        expect(mod & 7).toBe(4); // MUT_SORT
    });

    test("reverse sets MUT_SORT", () => {
        const l = c.list([1, 2, 3]);
        const getMod = readMod(l);

        l.reverse();
        let mod = getMod();
        expect(mod & 7).toBe(4); // MUT_SORT
    });

    test("fill sets mod to 0", () => {
        const l = c.list([1, 2, 3]);
        const getMod = readMod(l);

        l.fill(0);
        let mod = getMod();
        expect(mod).toBe(0);
    });

    test("copyWithin sets mod to 0", () => {
        const l = c.list([1, 2, 3, 4, 5]);
        const getMod = readMod(l);

        l.copyWithin(0, 3);
        let mod = getMod();
        expect(mod).toBe(0);
    });

    test("splice with delete only", () => {
        const l = c.list([1, 2, 3, 4, 5]);
        const getMod = readMod(l);

        l.splice(1, 2);
        let mod = getMod();
        expect(mod & 7).toBe(2); // MUT_DEL only
        expect((mod >>> 9) & 0x1FFFF).toBe(1); // pos = 1
        expect((mod >>> 3) & 0x3F).toBe(2); // len = 2
    });

    test("splice with add only", () => {
        const l = c.list([1, 2, 3]);
        const getMod = readMod(l);

        l.splice(1, 0, 10, 20);
        let mod = getMod();
        expect(mod & 7).toBe(1); // MUT_ADD only
        expect((mod >>> 9) & 0x1FFFF).toBe(1); // pos = 1
        expect((mod >>> 3) & 0x3F).toBe(2); // len = 2
    });

    test("splice with both add and delete", () => {
        const l = c.list([1, 2, 3, 4, 5]);
        const getMod = readMod(l);

        l.splice(1, 2, 10, 20, 30);
        let mod = getMod();
        expect(mod & 7).toBe(3); // MUT_ADD | MUT_DEL
        expect((mod >>> 9) & 0x1FFFF).toBe(1); // pos = 1
        expect((mod >>> 3) & 0x3F).toBe(3); // len = max(2 del, 3 add)
    });
});

describe("every optimization", () => {
    test("short-circuits on pop when previous result was true", () => {
        let runs = 0;
        const l = c.list([1, 2, 3]);
        const ev = l.every((v) => {
            runs++;
            return v > 0;
        });

        expect(ev.get()).toBe(true);
        runs = 0;

        l.pop();
        expect(ev.get()).toBe(true);
        expect(runs).toBe(0);
    });

    test("short-circuits on shift when previous result was true", () => {
        let runs = 0;
        const l = c.list([1, 2, 3]);
        const ev = l.every((v) => {
            runs++;
            return v > 0;
        });

        expect(ev.get()).toBe(true);
        runs = 0;

        l.shift();
        expect(ev.get()).toBe(true);
        expect(runs).toBe(0);
    });

    test("does NOT short-circuit on push (MUT_ADD)", () => {
        let runs = 0;
        const l = c.list([1, 2, 3]);
        const ev = l.every((v) => {
            runs++;
            return v > 0;
        });

        expect(ev.get()).toBe(true);
        runs = 0;

        l.push(4);
        ev.get();
        expect(runs > 0).toBe(true);
    });

    test("does NOT short-circuit when previous result was false", () => {
        let runs = 0;
        const l = c.list([1, -1, 3]);
        const ev = l.every((v) => {
            runs++;
            return v > 0;
        });

        expect(ev.get()).toBe(false);
        runs = 0;

        l.pop();
        ev.get();
        expect(runs > 0).toBe(true);
    });

    test("does NOT short-circuit on sort", () => {
        let runs = 0;
        const l = c.list([1, 2, 3]);
        const ev = l.every((v) => {
            runs++;
            return v > 0;
        });

        expect(ev.get()).toBe(true);
        runs = 0;

        l.sort();
        ev.get();
        expect(runs > 0).toBe(true);
    });
});

describe("some optimization", () => {
    test("short-circuits on pop when previous result was false", () => {
        let runs = 0;
        const l = c.list([1, 2, 3]);
        const s = l.some((v) => {
            runs++;
            return v > 10;
        });

        expect(s.get()).toBe(false);
        runs = 0;

        l.pop();
        expect(s.get()).toBe(false);
        expect(runs).toBe(0);
    });

    test("does NOT short-circuit on push when false", () => {
        let runs = 0;
        const l = c.list([1, 2, 3]);
        const s = l.some((v) => {
            runs++;
            return v > 10;
        });

        expect(s.get()).toBe(false);
        runs = 0;

        l.push(4);
        s.get();
        expect(runs > 0).toBe(true);
    });

    test("does NOT short-circuit when previous result was true", () => {
        let runs = 0;
        const l = c.list([1, 2, 100]);
        const s = l.some((v) => {
            runs++;
            return v > 10;
        });

        expect(s.get()).toBe(true);
        runs = 0;

        l.pop();
        s.get();
        expect(runs > 0).toBe(true);
    });
});
