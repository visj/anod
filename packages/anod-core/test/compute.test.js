import { describe, test, expect } from "#test-runner";
import { signal, root, batch } from "#anod";

let c; root((_c) => { c = _c; });

describe("compute", () => {
    test("returns initial value of wrapped function", () => {
        const c1 = c.compute(() => 1);
        expect(c1.get()).toBe(1); // "Should compute initial value"
    });

    test("does not re-occur when read multiple times", () => {
        let count = 0;
        const c1 = c.compute(() => { count++; });

        c1.get();
        c1.get();
        c1.get();
        expect(count).toBe(1);
    });

    describe("with a dependency on signal", () => {
        test("updates when data is set", () => {
            const s1 = signal(1);
            let count = 0;
            const c1 = c.compute(c => {
                count++;
                return c.val(s1);
            });

            s1.set(2);
            expect(c1.get()).toBe(2);
            expect(count).toBe(2);
        });

        test("does not update when data is merely read", () => {
            const s1 = signal(1);
            let count = 0;
            c.compute(c => {
                count++;
                return c.val(s1);
            });

            s1.get();
            expect(count).toBe(1);
        });
    });

    describe("with changing dependencies", () => {
        const s1 = signal(true);
        const s2 = signal(1);
        const s3 = signal(2);
        let count = 0;

        const c1 = c.compute(c => {
            count++;
            return c.val(s1) ? c.val(s2) : c.val(s3);
        });

        c1.get();
        count = 0;

        test("updates on active dependencies", () => {
            s2.set(5);
            expect(c1.get()).toBe(5);
            expect(count).toBe(1);
            count = 0;
        });

        test("does not update on inactive dependencies", () => {
            s3.set(5);
            expect(count).toBe(0);
            expect(c1.get()).toBe(5);
        });

        test("deactivates obsolete dependencies", () => {
            s1.set(false);
            count = 0;
            s2.set(6);
            expect(count).toBe(0);
        });

        test("activates new dependencies", () => {
            s3.set(7);
            expect(c1.get()).toBe(7);
            expect(count).toBe(1);
        });
    });

    test("does not register dependency when creating signals inside compute", () => {
        let s1;
        let count = 0;

        const c1 = c.compute(() => {
            count++;
            s1 = signal(1);
        });

        c1.get();
        count = 0;
        s1.set(2);

        c1.get();
        expect(count).toBe(0);
    });

    test("returns undefined from void function", () => {
        const c1 = c.compute(() => {});
        expect(c1.get()).toBeUndefined();
    });

    describe("with a dependency on a computation", () => {
        const s1 = signal(1);
        let countOne = 0;
        let countTwo = 0;

        const c1 = c.compute(c => {
            countOne++;
            return c.val(s1);
        });

        const c2 = c.compute(c => {
            countTwo++;
            return c.val(c1);
        });

        test("does not cause re-evaluation prematurely", () => {
            c2.get();
            expect(countOne).toBe(1);
        });

        test("occurs when computation updates", () => {
            s1.set(2);
            expect(c2.get()).toBe(2);
            expect(countOne).toBe(2);
            expect(countTwo).toBe(2);
        });
    });

    describe("with converging dependencies", () => {
        test("propagates in topological order", () => {
            let order = "";
            const s1 = signal(0);

            const c1 = c.compute(c => { order += "c1"; return c.val(s1); });
            const c2 = c.compute(c => { order += "c2"; return c.val(s1); });
            const c3 = c.compute(c => { c.val(c1); c.val(c2); order += "c3"; });

            order = "";
            s1.set(1);
            c3.get();
            expect(order).toBe("c1c2c3"); // "Should execute strictly left-to-right topological order"
        });

        test("only propagates once with linear convergences", () => {
            const s1 = signal(0);
            const c1 = c.compute(c => c.val(s1));
            const c2 = c.compute(c => c.val(s1));
            const c3 = c.compute(c => c.val(s1));
            const c4 = c.compute(c => c.val(s1));
            const c5 = c.compute(c => c.val(s1));

            let count = 0;
            const c6 = c.compute(c => {
                count++;
                return (c.val(c1)) + (c.val(c2)) + (c.val(c3)) + (c.val(c4)) + (c.val(c5));
            });

            count = 0;
            s1.set(1);
            c6.get();
            expect(count).toBe(1); // "Converging nodes should only trigger the sink once"
        });
    });

    describe("writable (set on compute)", () => {
        test("set overrides the derived value and val() returns it", () => {
            const s1 = signal(5);
            const c1 = c.compute(c => c.val(s1) * 2);
            expect(c1.get()).toBe(10);

            c1.set(99);
            expect(c1.get()).toBe(99);
        });

        test("set does not re-run the compute's fn", () => {
            const s1 = signal(1);
            let runs = 0;
            const c1 = c.compute(c => {
                runs++;
                return c.val(s1);
            });
            expect(c1.get()).toBe(1);
            expect(runs).toBe(1);

            c1.set(42);
            expect(c1.get()).toBe(42);
            expect(runs).toBe(1);
        });

        test("setting the same value is a no-op (no notification)", () => {
            const s1 = signal(3);
            const c1 = c.compute(c => c.val(s1));
            let downstream = 0;
            const c2 = c.compute(c => {
                downstream++;
                return c.val(c1);
            });
            expect(c2.get()).toBe(3);
            expect(downstream).toBe(1);

            c1.set(3);
            c2.get();
            expect(downstream).toBe(1);
        });

        test("set propagates to downstream computes", () => {
            const s1 = signal(1);
            const c1 = c.compute(c => c.val(s1));
            const c2 = c.compute(c => c.val(c1) + 10);
            expect(c2.get()).toBe(11);

            c1.set(100);
            expect(c2.get()).toBe(110);
        });

        test("set propagates to downstream effects", () => {
            root(r => {
                const s1 = signal(1);
                const c1 = r.compute(c => c.val(s1));
                let observed;
                r.effect(c => {
                    observed = c.val(c1);
                });
                expect(observed).toBe(1);

                c1.set(7);
                expect(observed).toBe(7);
            });
        });

        test("upstream change after set re-runs the fn and clobbers the override", () => {
            const s1 = signal(1);
            const c1 = c.compute(c => c.val(s1) * 10);
            expect(c1.get()).toBe(10);

            c1.set(999);
            expect(c1.get()).toBe(999);

            s1.set(3);
            expect(c1.get()).toBe(30);
        });

        test("batched sets coalesce and fire subs once", () => {
            const s1 = signal(1);
            const c1 = c.compute(c => c.val(s1));
            let runs = 0;
            const c2 = c.compute(c => {
                runs++;
                return c.val(c1);
            });
            expect(c2.get()).toBe(1);
            expect(runs).toBe(1);

            batch(() => {
                c1.set(2);
                c1.set(3);
                c1.set(4);
            });
            expect(c2.get()).toBe(4);
            expect(runs).toBe(2);
        });

        describe("form field defaulted from server data", () => {
            test("tracks the source until user edits, then holds the edit", () => {
                const serverValue = signal("alice");
                /** Derived initial value for the input; user can overwrite. */
                const draft = c.compute(c => c.val(serverValue));
                expect(draft.get()).toBe("alice");

                /** User types — overwrite the derived value. */
                draft.set("alice the great");
                expect(draft.get()).toBe("alice the great");

                /** Another field change from the server arrives for an
                 *  unrelated key — shouldn't trample the user's edit
                 *  because `serverValue` didn't change. */
                const unrelated = signal(0);
                unrelated.set(1);
                expect(draft.get()).toBe("alice the great");

                /** The server sends an authoritative overwrite. The
                 *  derived value recomputes, replacing the user's draft. */
                serverValue.set("bob");
                expect(draft.get()).toBe("bob");
            });
        });

        describe("optimistic local state", () => {
            test("local set shows immediately; later server value replaces", () => {
                const serverCount = signal(0);
                const displayed = c.compute(c => c.val(serverCount));
                let rendered = null;

                root(r => {
                    r.effect(c => {
                        rendered = c.val(displayed);
                    });
                });
                expect(rendered).toBe(0);

                /** Optimistic local increment while the server round-trip
                 *  is in flight. */
                displayed.set(1);
                expect(rendered).toBe(1);

                /** Server returns the real count; derived fn re-runs and
                 *  the authoritative value wins. */
                serverCount.set(5);
                expect(rendered).toBe(5);
            });
        });

        test("dep update takes precedence over manual set in the same cycle", () => {
            const s1 = signal(1);
            const c1 = c.compute(c => c.val(s1));
            expect(c1.get()).toBe(1);

            /** Mark STALE by setting upstream, but don't read c1 yet. */
            s1.set(2);
            /** Manually write — but c1 is still stale from s1's change.
             *  On the next read, the dep update re-runs fn and wins. */
            c1.set(50);
            expect(c1.get()).toBe(2);
        });

        test("set on an initialized compute triggers stale notifications synchronously", () => {
            const s1 = signal(1);
            const c1 = c.compute(c => c.val(s1));
            let seen = [];
            root(r => {
                r.effect(c => {
                    seen.push(c.val(c1));
                });
            });
            expect(seen).toEqual([1]);

            c1.set(2);
            c1.set(3);
            expect(seen).toEqual([1, 2, 3]);
        });
    });
});
