import { describe, test, expect } from "bun:test";
import { signal, compute, effect, batch } from "anod";
import { list } from "../";

describe.skip("_mod encoding", () => {
    /** Helper: read _mod via .mod() on a derived compute */
    function getMod(l) {
        let mod = 0;
        let c = l.derive((c, source) => {
            mod = c.mod();
            return source;
        });
        return () => { c.val(); return mod; };
    }

    test("push sets MUT_ADD with correct position and length", () => {
        const l = list([1, 2, 3]);
        const readMod = getMod(l);
        readMod(); // initial run

        l.push(4);
        let mod = readMod();
        expect(mod & 7).toBe(1); // MUT_ADD
        expect((mod >>> 15) & 0x1FFFF).toBe(3); // pos = old length
        expect((mod >>> 3) & 0xFFF).toBe(1); // len = 1
    });

    test("push multiple items", () => {
        const l = list([1, 2]);
        const readMod = getMod(l);
        readMod();

        l.push(3, 4, 5);
        let mod = readMod();
        expect(mod & 7).toBe(1); // MUT_ADD
        expect((mod >>> 15) & 0x1FFFF).toBe(2); // pos = old length
        expect((mod >>> 3) & 0xFFF).toBe(3); // len = 3
    });

    test("pop sets MUT_DEL with correct position", () => {
        const l = list([1, 2, 3]);
        const readMod = getMod(l);
        readMod();

        l.pop();
        let mod = readMod();
        expect(mod & 7).toBe(2); // MUT_DEL
        expect((mod >>> 15) & 0x1FFFF).toBe(2); // pos = new length (index of removed)
        expect((mod >>> 3) & 0xFFF).toBe(1); // len = 1
    });

    test("shift sets MUT_DEL at position 0", () => {
        const l = list([1, 2, 3]);
        const readMod = getMod(l);
        readMod();

        l.shift();
        let mod = readMod();
        expect(mod & 7).toBe(2); // MUT_DEL
        expect((mod >>> 15) & 0x1FFFF).toBe(0); // pos = 0
        expect((mod >>> 3) & 0xFFF).toBe(1); // len = 1
    });

    test("unshift sets MUT_ADD at position 0", () => {
        const l = list([1, 2, 3]);
        const readMod = getMod(l);
        readMod();

        l.unshift(0);
        let mod = readMod();
        expect(mod & 7).toBe(1); // MUT_ADD
        expect((mod >>> 15) & 0x1FFFF).toBe(0); // pos = 0
        expect((mod >>> 3) & 0xFFF).toBe(1); // len = 1
    });

    test("sort sets MUT_SORT", () => {
        const l = list([3, 1, 2]);
        const readMod = getMod(l);
        readMod();

        l.sort();
        let mod = readMod();
        expect(mod & 7).toBe(4); // MUT_SORT
    });

    test("reverse sets MUT_SORT", () => {
        const l = list([1, 2, 3]);
        const readMod = getMod(l);
        readMod();

        l.reverse();
        let mod = readMod();
        expect(mod & 7).toBe(4); // MUT_SORT
    });

    test("fill sets _mod to 0", () => {
        const l = list([1, 2, 3]);
        const readMod = getMod(l);
        readMod();

        l.fill(0);
        let mod = readMod();
        expect(mod).toBe(0);
    });

    test("copyWithin sets _mod to 0", () => {
        const l = list([1, 2, 3, 4, 5]);
        const readMod = getMod(l);
        readMod();

        l.copyWithin(0, 3);
        let mod = readMod();
        expect(mod).toBe(0);
    });

    test("splice with delete only", () => {
        const l = list([1, 2, 3, 4, 5]);
        const readMod = getMod(l);
        readMod();

        l.splice(1, 2);
        let mod = readMod();
        expect(mod & 7).toBe(2); // MUT_DEL only
        expect((mod >>> 15) & 0x1FFFF).toBe(1); // pos = 1
        expect((mod >>> 3) & 0xFFF).toBe(2); // len = 2
    });

    test("splice with add only", () => {
        const l = list([1, 2, 3]);
        const readMod = getMod(l);
        readMod();

        l.splice(1, 0, 10, 20);
        let mod = readMod();
        expect(mod & 7).toBe(1); // MUT_ADD only
        expect((mod >>> 15) & 0x1FFFF).toBe(1); // pos = 1
        expect((mod >>> 3) & 0xFFF).toBe(2); // len = 2
    });

    test("splice with both add and delete", () => {
        const l = list([1, 2, 3, 4, 5]);
        const readMod = getMod(l);
        readMod();

        l.splice(1, 2, 10, 20, 30);
        let mod = readMod();
        expect(mod & 7).toBe(3); // MUT_ADD | MUT_DEL
        expect((mod >>> 15) & 0x1FFFF).toBe(1); // pos = 1
        expect((mod >>> 3) & 0xFFF).toBe(3); // len = max(2 del, 3 add)
    });

    test("multiple mutations in batch produce _mod = 0", () => {
        const l = list([1, 2, 3]);
        const readMod = getMod(l);
        readMod();

        batch(() => {
            l.push(4);
            l.push(5);
        });
        let mod = readMod();
        expect(mod).toBe(0);
    });

    test("single mutation in batch preserves _mod", () => {
        const l = list([1, 2, 3]);
        const readMod = getMod(l);
        readMod();

        batch(() => {
            l.push(4);
        });
        let mod = readMod();
        expect(mod & 7).toBe(1); // MUT_ADD
        expect((mod >>> 15) & 0x1FFFF).toBe(3); // pos = 3
    });
});

describe.skip("every optimization", () => {
    test("short-circuits on pop when previous result was true", () => {
        let runs = 0;
        const l = list([1, 2, 3]);
        const c = l.every((v) => {
            runs++;
            return v > 0;
        });

        expect(c.val()).toBe(true);
        runs = 0;

        l.pop();
        expect(c.val()).toBe(true);
        /** Should have short-circuited — zero callback invocations */
        expect(runs).toBe(0);
    });

    test("short-circuits on shift when previous result was true", () => {
        let runs = 0;
        const l = list([1, 2, 3]);
        const c = l.every((v) => {
            runs++;
            return v > 0;
        });

        expect(c.val()).toBe(true);
        runs = 0;

        l.shift();
        expect(c.val()).toBe(true);
        expect(runs).toBe(0);
    });

    test("does NOT short-circuit on push (MUT_ADD)", () => {
        let runs = 0;
        const l = list([1, 2, 3]);
        const c = l.every((v) => {
            runs++;
            return v > 0;
        });

        expect(c.val()).toBe(true);
        runs = 0;

        l.push(4);
        c.val();
        /** Must do full recompute because items were added */
        expect(runs).toBeGreaterThan(0);
    });

    test("does NOT short-circuit when previous result was false", () => {
        let runs = 0;
        const l = list([1, -1, 3]);
        const c = l.every((v) => {
            runs++;
            return v > 0;
        });

        expect(c.val()).toBe(false);
        runs = 0;

        l.pop();
        c.val();
        /** Previous was false, must recheck */
        expect(runs).toBeGreaterThan(0);
    });

    test("does NOT short-circuit on sort", () => {
        let runs = 0;
        const l = list([1, 2, 3]);
        const c = l.every((v) => {
            runs++;
            return v > 0;
        });

        expect(c.val()).toBe(true);
        runs = 0;

        l.sort();
        c.val();
        expect(runs).toBeGreaterThan(0);
    });
});

describe.skip("some optimization", () => {
    test("short-circuits on pop when previous result was false", () => {
        let runs = 0;
        const l = list([1, 2, 3]);
        const c = l.some((v) => {
            runs++;
            return v > 10;
        });

        expect(c.val()).toBe(false);
        runs = 0;

        l.pop();
        expect(c.val()).toBe(false);
        expect(runs).toBe(0);
    });

    test("does NOT short-circuit on push when false", () => {
        let runs = 0;
        const l = list([1, 2, 3]);
        const c = l.some((v) => {
            runs++;
            return v > 10;
        });

        expect(c.val()).toBe(false);
        runs = 0;

        l.push(4);
        c.val();
        expect(runs).toBeGreaterThan(0);
    });

    test("does NOT short-circuit when previous result was true", () => {
        let runs = 0;
        const l = list([1, 2, 100]);
        const c = l.some((v) => {
            runs++;
            return v > 10;
        });

        expect(c.val()).toBe(true);
        runs = 0;

        l.pop();
        c.val();
        expect(runs).toBeGreaterThan(0);
    });
});

describe.skip("indexOf mutation optimization", () => {
    test("skips scan when push is after found index", () => {
        let runs = 0;
        const l = list([10, 20, 30]);
        const c = l.indexOf(20, true);

        expect(c.val()).toBe(1);

        /** Push at end (pos=3) > found index (1) → skip scan */
        l.push(40);
        expect(c.val()).toBe(1);
    });

    test("recomputes when push is before found index", () => {
        const l = list([10, 20, 30]);
        const c = l.indexOf(20, true);

        expect(c.val()).toBe(1);

        /** Unshift at pos=0 <= found index (1) → must recompute */
        l.unshift(5);
        expect(c.val()).toBe(2);
    });

    test("not found stays not found on delete", () => {
        const l = list([10, 20, 30]);
        const c = l.indexOf(99, true);

        expect(c.val()).toBe(-1);

        l.pop();
        expect(c.val()).toBe(-1);
    });

    test("recomputes on sort", () => {
        const l = list([30, 10, 20]);
        const c = l.indexOf(10, true);

        expect(c.val()).toBe(1);

        l.sort();
        expect(c.val()).toBe(0);
    });
});

describe.skip("findIndex mutation optimization", () => {
    test("skips scan when push is after found index", () => {
        const l = list([10, 20, 30]);
        const c = l.findIndex((v) => v === 20, undefined, true);

        expect(c.val()).toBe(1);

        l.push(40);
        expect(c.val()).toBe(1);
    });

    test("not found stays not found on delete", () => {
        const l = list([10, 20, 30]);
        const c = l.findIndex((v) => v === 99, undefined, true);

        expect(c.val()).toBe(-1);

        l.pop();
        expect(c.val()).toBe(-1);
    });
});

describe.skip("includes mutation optimization", () => {
    test("skips scan when push is after found position", () => {
        const l = list([10, 20, 30]);
        const c = l.includes(20, true);

        expect(c.val()).toBe(true);

        l.push(40);
        expect(c.val()).toBe(true);
    });

    test("not included stays not included on delete", () => {
        const l = list([10, 20, 30]);
        const c = l.includes(99, true);

        expect(c.val()).toBe(false);

        l.pop();
        expect(c.val()).toBe(false);
    });

    test("recomputes correctly when mutation is before found position", () => {
        const l = list([10, 20, 30]);
        const c = l.includes(20, true);

        expect(c.val()).toBe(true);

        /** Shift at pos=0 is before found index → must recompute */
        l.shift();
        expect(c.val()).toBe(true);
    });

    test("detects when item is removed", () => {
        const l = list([10, 20, 30]);
        const c = l.includes(30, true);

        expect(c.val()).toBe(true);

        /** Remove the item we were tracking */
        l.splice(2, 1);
        expect(c.val()).toBe(false);
    });
});

describe.skip("find mutation optimization", () => {
    test("skips scan when push is after found index", () => {
        const l = list([10, 20, 30]);
        const c = l.find((v) => v === 20, undefined, true);

        expect(c.val()).toBe(20);

        l.push(40);
        expect(c.val()).toBe(20);
    });

    test("not found stays not found on delete", () => {
        const l = list([10, 20, 30]);
        const c = l.find((v) => v === 99, undefined, true);

        expect(c.val()).toBe(undefined);

        l.pop();
        expect(c.val()).toBe(undefined);
    });
});

describe.skip("findLastIndex mutation optimization", () => {
    test("skips scan when push is after found index", () => {
        const l = list([10, 20, 30]);
        const c = l.findLastIndex((v) => v === 20, undefined, true);

        expect(c.val()).toBe(1);

        l.push(40);
        expect(c.val()).toBe(1);
    });
});

/* ─── Inverse optimizations and partial recomputes ─── */

describe.skip("every inverse optimization", () => {
    test("prev=false + only ADD + cb.length<=1 → false", () => {
        let runs = 0;
        const l = list([1, -1, 3]);
        const c = l.every((v) => {
            runs++;
            return v > 0;
        });

        expect(c.val()).toBe(false);
        runs = 0;

        l.push(4);
        expect(c.val()).toBe(false);
        /** Callback does not use index → short-circuit */
        expect(runs).toBe(0);
    });

    test("prev=true + ADD → partial check on new items only", () => {
        let runs = 0;
        const l = list([1, 2, 3]);
        const c = l.every((v) => {
            runs++;
            return v > 0;
        });

        expect(c.val()).toBe(true);
        runs = 0;

        l.push(4, 5);
        expect(c.val()).toBe(true);
        /** Only the 2 new items should be checked */
        expect(runs).toBe(2);
    });

    test("prev=true + ADD with failing new item → false", () => {
        const l = list([1, 2, 3]);
        const c = l.every((v) => v > 0);

        expect(c.val()).toBe(true);

        l.push(-1);
        expect(c.val()).toBe(false);
    });

    test("prev=true + unshift → partial check with cb.length<=1", () => {
        let runs = 0;
        const l = list([1, 2, 3]);
        const c = l.every((v) => {
            runs++;
            return v > 0;
        });

        expect(c.val()).toBe(true);
        runs = 0;

        l.unshift(10);
        expect(c.val()).toBe(true);
        /** Only the 1 new item should be checked */
        expect(runs).toBe(1);
    });

    test("prev=false + only ADD + cb uses index → full recompute", () => {
        let runs = 0;
        const l = list([1, -1, 3]);
        const c = l.every((v, i) => {
            runs++;
            return v > 0;
        });

        expect(c.val()).toBe(false);
        runs = 0;

        l.push(4);
        c.val();
        /** cb.length > 1, so must do full recompute */
        expect(runs).toBeGreaterThan(0);
    });
});

describe.skip("some inverse optimization", () => {
    test("prev=true + only ADD + cb.length<=1 → true", () => {
        let runs = 0;
        const l = list([1, 2, 100]);
        const c = l.some((v) => {
            runs++;
            return v > 50;
        });

        expect(c.val()).toBe(true);
        runs = 0;

        l.push(4);
        expect(c.val()).toBe(true);
        expect(runs).toBe(0);
    });

    test("prev=false + ADD → partial check finds new match", () => {
        const l = list([1, 2, 3]);
        const c = l.some((v) => v > 50);

        expect(c.val()).toBe(false);

        l.push(100);
        expect(c.val()).toBe(true);
    });

    test("prev=false + ADD → partial check no match", () => {
        let runs = 0;
        const l = list([1, 2, 3]);
        const c = l.some((v) => {
            runs++;
            return v > 50;
        });

        expect(c.val()).toBe(false);
        runs = 0;

        l.push(4, 5);
        expect(c.val()).toBe(false);
        /** Only 2 new items checked */
        expect(runs).toBe(2);
    });
});

describe.skip("indexOf DEL-shift optimization", () => {
    test("delete before found index shifts left", () => {
        const l = list([10, 20, 30, 40, 50]);
        const c = l.indexOf(40, true);

        expect(c.val()).toBe(3);

        /** Delete at pos=0, len=1 → found shifts from 3 to 2 */
        l.shift();
        expect(c.val()).toBe(2);
    });

    test("splice delete before found shifts left", () => {
        const l = list([10, 20, 30, 40, 50]);
        const c = l.indexOf(50, true);

        expect(c.val()).toBe(4);

        l.splice(0, 2);
        expect(c.val()).toBe(2);
    });

    test("delete overlapping found position recomputes", () => {
        const l = list([10, 20, 30, 40, 50]);
        const c = l.indexOf(30, true);

        expect(c.val()).toBe(2);

        /** Delete at pos=1, len=2 overlaps found index 2 */
        l.splice(1, 2);
        expect(c.val()).toBe(-1);
    });
});

describe.skip("indexOf ADD-region optimization", () => {
    test("unshift with target in new region finds it", () => {
        const l = list([10, 20, 30]);
        const c = l.indexOf(20, true);

        expect(c.val()).toBe(1);

        /** Unshift 20 at pos=0 → new region contains target */
        l.unshift(20);
        expect(c.val()).toBe(0);
    });

    test("unshift without target in new region shifts right", () => {
        const l = list([10, 20, 30]);
        const c = l.indexOf(20, true);

        expect(c.val()).toBe(1);

        l.unshift(5);
        expect(c.val()).toBe(2);
    });

    test("not found + push adds target → found in new region", () => {
        const l = list([10, 20, 30]);
        const c = l.indexOf(99, true);

        expect(c.val()).toBe(-1);

        l.push(99);
        expect(c.val()).toBe(3);
    });

    test("not found + push without target → still not found", () => {
        const l = list([10, 20, 30]);
        const c = l.indexOf(99, true);

        expect(c.val()).toBe(-1);

        l.push(88);
        expect(c.val()).toBe(-1);
    });
});

describe.skip("includes DEL-shift optimization", () => {
    test("delete before found shifts internal index", () => {
        const l = list([10, 20, 30, 40]);
        const c = l.includes(30, true);

        expect(c.val()).toBe(true);

        l.shift();
        expect(c.val()).toBe(true);
    });

    test("not found + push with target → found", () => {
        const l = list([10, 20, 30]);
        const c = l.includes(99, true);

        expect(c.val()).toBe(false);

        l.push(99);
        expect(c.val()).toBe(true);
    });
});

describe.skip("FLAG_INIT prevents optimization on first run", () => {
    test("every does not optimize on first run even with stale _mod", () => {
        const l = list([1, 2, 3]);
        l.pop(); // sets _mod to MUT_DEL

        /** Create compute AFTER the mutation — first run sees stale _mod */
        let runs = 0;
        const c = l.every((v) => {
            runs++;
            return v > 0;
        });

        /** Must do full computation on first run */
        expect(c.val()).toBe(true);
        expect(runs).toBe(2); // [1, 2] after pop
    });

    test("indexOf does not optimize on first run", () => {
        const l = list([10, 20, 30]);
        l.push(40); // sets _mod

        const c = l.indexOf(20, true);
        expect(c.val()).toBe(1);
    });
});
