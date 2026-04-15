import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { signal, compute, Signal, Compute } from "./_helper.js";

describe("compute", () => {
    it("returns initial value of wrapped function", () => {
        const c1 = compute(() => 1);
        assert.strictEqual(c1.val(), 1);
    });

    it("does not re-occur when read multiple times", () => {
        let count = 0;
        const c1 = compute(() => { count++; });
        c1.val();
        c1.val();
        c1.val();
        assert.strictEqual(count, 1);
    });

    describe("with a dependency on signal", () => {
        it("updates when data is set", () => {
            const s1 = signal(1);
            let count = 0;
            const c1 = compute((c) => {
                count++;
                return c.read(s1);
            });
            s1.set(2);
            assert.strictEqual(c1.val(), 2);
            assert.strictEqual(count, 2);
        });

        it("does not update when data is merely read", () => {
            const s1 = signal(1);
            let count = 0;
            compute((c) => {
                count++;
                return c.read(s1);
            });
            s1.val();
            assert.strictEqual(count, 1);
        });
    });

    describe("with changing dependencies", () => {
        it("updates on active dependencies", () => {
            const s1 = signal(true);
            const s2 = signal(1);
            const s3 = signal(2);
            let count = 0;
            const c1 = compute((c) => {
                count++;
                return c.read(s1) ? c.read(s2) : c.read(s3);
            });
            c1.val();
            count = 0;
            s2.set(5);
            assert.strictEqual(c1.val(), 5);
            assert.strictEqual(count, 1);
        });

        it("does not update on inactive dependencies", () => {
            const s1 = signal(true);
            const s2 = signal(1);
            const s3 = signal(2);
            let count = 0;
            const c1 = compute((c) => {
                count++;
                return c.read(s1) ? c.read(s2) : c.read(s3);
            });
            c1.val();
            count = 0;
            s3.set(5);
            assert.strictEqual(count, 0);
            assert.strictEqual(c1.val(), 1);
        });

        it("deactivates obsolete dependencies", () => {
            const s1 = signal(true);
            const s2 = signal(1);
            const s3 = signal(2);
            let count = 0;
            const c1 = compute((c) => {
                count++;
                return c.read(s1) ? c.read(s2) : c.read(s3);
            });
            c1.val();
            s1.set(false);
            count = 0;
            s2.set(6);
            assert.strictEqual(count, 0);
        });

        it("activates new dependencies", () => {
            const s1 = signal(true);
            const s2 = signal(1);
            const s3 = signal(2);
            let count = 0;
            const c1 = compute((c) => {
                count++;
                return c.read(s1) ? c.read(s2) : c.read(s3);
            });
            c1.val();
            s1.set(false);
            count = 0;
            s3.set(7);
            assert.strictEqual(c1.val(), 7);
            assert.strictEqual(count, 1);
        });
    });

    it("does not register dependency when creating signals inside compute", () => {
        let s1;
        let count = 0;
        const c1 = compute(() => {
            count++;
            s1 = signal(1);
        });
        c1.val();
        count = 0;
        s1.set(2);
        c1.val();
        assert.strictEqual(count, 0);
    });

    it("returns undefined from void function", () => {
        const c1 = compute(() => {});
        assert.strictEqual(c1.val(), undefined);
    });

    describe("with a dependency on a computation", () => {
        it("does not cause re-evaluation prematurely", () => {
            const s1 = signal(1);
            let countOne = 0;
            const c1 = compute((c) => {
                countOne++;
                return c.read(s1);
            });
            const c2 = compute((c) => {
                return c.read(c1);
            });
            c2.val();
            assert.strictEqual(countOne, 1);
        });

        it("occurs when computation updates", () => {
            const s1 = signal(1);
            let countOne = 0;
            let countTwo = 0;
            const c1 = compute((c) => {
                countOne++;
                return c.read(s1);
            });
            const c2 = compute((c) => {
                countTwo++;
                return c.read(c1);
            });
            c2.val();
            s1.set(2);
            assert.strictEqual(c2.val(), 2);
            assert.strictEqual(countOne, 2);
            assert.strictEqual(countTwo, 2);
        });
    });

    describe("with circular dependencies", () => {
        it("throws when cycle created by modifying a branch", () => {
            const s1 = signal(1);
            var c1 = compute((c) => c.read(s1) > 1 ? c1.val() : c.read(s1));
            c1.val();
            assert.throws(() => {
                s1.set(2);
                c1.val();
            });
        });
    });

    describe("with converging dependencies", () => {
        it("propagates in topological order", () => {
            let order = "";
            const s1 = signal(0);
            const c1 = compute((c) => { order += "c1"; return c.read(s1); });
            const c2 = compute((c) => { order += "c2"; return c.read(s1); });
            const c3 = compute((c) => { c.read(c1); c.read(c2); order += "c3"; });
            order = "";
            s1.set(1);
            c3.val();
            assert.strictEqual(order, "c1c2c3");
        });

        it("only propagates once with linear convergences", () => {
            const s1 = signal(0);
            const c1 = compute((c) => c.read(s1));
            const c2 = compute((c) => c.read(s1));
            const c3 = compute((c) => c.read(s1));
            const c4 = compute((c) => c.read(s1));
            const c5 = compute((c) => c.read(s1));
            let count = 0;
            const c6 = compute((c) => {
                count++;
                return (c.read(c1)) + (c.read(c2)) + (c.read(c3)) + (c.read(c4)) + (c.read(c5));
            });
            count = 0;
            s1.set(1);
            c6.val();
            assert.strictEqual(count, 1);
        });
    });
});
