import { describe, test, expect } from "bun:test";
import { signal, compute, effect, root, batch, Signal, Compute } from "../";

describe("compute", () => {
    test("returns initial value of wrapped function", () => {
        const c1 = compute(() => 1);
        expect(c1.val()).toBe(1); // "Should compute initial value"
    });

    test("does not re-occur when read multiple times", () => {
        let count = 0;
        const c1 = compute(() => { count++; });

        c1.val();
        c1.val();
        c1.val();
        expect(count).toBe(1);
    });

    describe("with a dependency on signal", () => {
        test("updates when data is set", () => {
            const s1 = signal(1);
            let count = 0;
            const c1 = compute(() => {
                count++;
                return s1.val();
            });

            s1.set(2);
            expect(c1.val()).toBe(2);
            expect(count).toBe(2);
        });

        test("does not update when data is merely read", () => {
            const s1 = signal(1);
            let count = 0;
            compute(() => {
                count++;
                return s1.val();
            });

            s1.val();
            expect(count).toBe(1);
        });
    });

    describe("with changing dependencies", () => {
        const s1 = signal(true);
        const s2 = signal(1);
        const s3 = signal(2);
        let count = 0;

        const c1 = compute(() => {
            count++;
            return s1.val() ? s2.val() : s3.val();
        });

        c1.val();
        count = 0;

        test("updates on active dependencies", () => {
            s2.set(5);
            expect(c1.val()).toBe(5);
            expect(count).toBe(1);
            count = 0;
        });

        test("does not update on inactive dependencies", () => {
            s3.set(5);
            expect(count).toBe(0);
            expect(c1.val()).toBe(5);
        });

        test("deactivates obsolete dependencies", () => {
            s1.set(false);
            count = 0;
            s2.set(6);
            expect(count).toBe(0);
        });

        test("activates new dependencies", () => {
            s3.set(7);
            expect(c1.val()).toBe(7);
            expect(count).toBe(1);
        });
    });

    test("does not register dependency when creating signals inside compute", () => {
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
        expect(count).toBe(0);
    });

    test("returns undefined from void function", () => {
        const c1 = compute(() => {});
        expect(c1.val()).toBeUndefined();
    });

    describe("with a dependency on a computation", () => {
        const s1 = signal(1);
        let countOne = 0;
        let countTwo = 0;

        const c1 = compute(() => {
            countOne++;
            return s1.val();
        });

        const c2 = compute(() => {
            countTwo++;
            return c1.val();
        });

        test("does not cause re-evaluation prematurely", () => {
            c2.val();
            expect(countOne).toBe(1);
        });

        test("occurs when computation updates", () => {
            s1.set(2);
            expect(c2.val()).toBe(2);
            expect(countOne).toBe(2);
            expect(countTwo).toBe(2);
        });
    });

    describe("with converging dependencies", () => {
        test("propagates in topological order", () => {
            let order = "";
            const s1 = signal(0);

            const c1 = compute(() => { order += "c1"; return s1.val(); });
            const c2 = compute(() => { order += "c2"; return s1.val(); });
            const c3 = compute(() => { c1.val(); c2.val(); order += "c3"; });

            order = "";
            s1.set(1);
            c3.val();
            expect(order).toBe("c1c2c3"); // "Should execute strictly left-to-right topological order"
        });

        test("only propagates once with linear convergences", () => {
            const s1 = signal(0);
            const c1 = compute(() => s1.val());
            const c2 = compute(() => s1.val());
            const c3 = compute(() => s1.val());
            const c4 = compute(() => s1.val());
            const c5 = compute(() => s1.val());

            let count = 0;
            const c6 = compute(() => {
                count++;
                return (c1.val()) + (c2.val()) + (c3.val()) + (c4.val()) + (c5.val());
            });

            count = 0;
            s1.set(1);
            c6.val();
            expect(count).toBe(1); // "Converging nodes should only trigger the sink once"
        });
    });

    describe("writable (set on compute)", () => {
        test("set overrides the derived value and val() returns it", () => {
            const s1 = signal(5);
            const c1 = compute(() => s1.val() * 2);
            expect(c1.val()).toBe(10);

            c1.set(99);
            expect(c1.val()).toBe(99);
        });

        test("set does not re-run the compute's fn", () => {
            const s1 = signal(1);
            let runs = 0;
            const c1 = compute(() => {
                runs++;
                return s1.val();
            });
            expect(c1.val()).toBe(1);
            expect(runs).toBe(1);

            c1.set(42);
            expect(c1.val()).toBe(42);
            expect(runs).toBe(1);
        });

        test("setting the same value is a no-op (no notification)", () => {
            const s1 = signal(3);
            const c1 = compute(() => s1.val());
            let downstream = 0;
            const c2 = compute(() => {
                downstream++;
                return c1.val();
            });
            expect(c2.val()).toBe(3);
            expect(downstream).toBe(1);

            c1.set(3);
            c2.val();
            expect(downstream).toBe(1);
        });

        test("set propagates to downstream computes", () => {
            const s1 = signal(1);
            const c1 = compute(() => s1.val());
            const c2 = compute(() => c1.val() + 10);
            expect(c2.val()).toBe(11);

            c1.set(100);
            expect(c2.val()).toBe(110);
        });

        test("set propagates to downstream effects", () => {
            root(() => {
                const s1 = signal(1);
                const c1 = compute(() => s1.val());
                let observed;
                effect(() => {
                    observed = c1.val();
                });
                expect(observed).toBe(1);

                c1.set(7);
                expect(observed).toBe(7);
            });
        });

        test("upstream change after set re-runs the fn and clobbers the override", () => {
            const s1 = signal(1);
            const c1 = compute(() => s1.val() * 10);
            expect(c1.val()).toBe(10);

            c1.set(999);
            expect(c1.val()).toBe(999);

            s1.set(3);
            expect(c1.val()).toBe(30);
        });

        test("batched sets coalesce and fire subs once", () => {
            const s1 = signal(1);
            const c1 = compute(() => s1.val());
            let runs = 0;
            const c2 = compute(() => {
                runs++;
                return c1.val();
            });
            expect(c2.val()).toBe(1);
            expect(runs).toBe(1);

            batch(() => {
                c1.set(2);
                c1.set(3);
                c1.set(4);
            });
            expect(c2.val()).toBe(4);
            expect(runs).toBe(2);
        });

        describe("form field defaulted from server data", () => {
            test("tracks the source until user edits, then holds the edit", () => {
                const serverValue = signal("alice");
                /** Derived initial value for the input; user can overwrite. */
                const draft = compute(() => serverValue.val());
                expect(draft.val()).toBe("alice");

                /** User types — overwrite the derived value. */
                draft.set("alice the great");
                expect(draft.val()).toBe("alice the great");

                /** Another field change from the server arrives for an
                 *  unrelated key — shouldn't trample the user's edit
                 *  because `serverValue` didn't change. */
                const unrelated = signal(0);
                unrelated.set(1);
                expect(draft.val()).toBe("alice the great");

                /** The server sends an authoritative overwrite. The
                 *  derived value recomputes, replacing the user's draft. */
                serverValue.set("bob");
                expect(draft.val()).toBe("bob");
            });
        });

        describe("optimistic local state", () => {
            test("local set shows immediately; later server value replaces", () => {
                const serverCount = signal(0);
                const displayed = compute(() => serverCount.val());
                let rendered = null;

                root(() => {
                    effect(() => {
                        rendered = displayed.val();
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

        test("set on a compute that was STALE still propagates the new value", () => {
            const s1 = signal(1);
            const c1 = compute(() => s1.val());
            expect(c1.val()).toBe(1);

            /** Mark STALE by setting upstream, but don't read c1 yet. */
            s1.set(2);
            /** Overwrite before the lazy re-run would have seen s1=2. */
            c1.set(50);
            expect(c1.val()).toBe(50);
        });

        test("set on an initialized compute triggers stale notifications synchronously", () => {
            const s1 = signal(1);
            const c1 = compute(() => s1.val());
            let seen = [];
            root(() => {
                effect(() => {
                    seen.push(c1.val());
                });
            });
            expect(seen).toEqual([1]);

            c1.set(2);
            c1.set(3);
            expect(seen).toEqual([1, 2, 3]);
        });
    });
});