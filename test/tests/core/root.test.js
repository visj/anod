import { test, assert, Anod } from "../../helper/index.js";

/**
 *
 * @param {Anod} anod
 */
export function run(anod) {
    var { value, root, effect, compute } = anod;
    test("root", function () {
        test("allows subcomputations to escape their parents", function () {
            root(function () {
                var s1 = value(0);
                var s2 = value(0);
                var count = 0;

                anod.effect(function () {
                    // register dependency to outer trigger
                    s1.val();
                    // inner computation
                    anod.root(function () {
                        anod.effect(function () {
                            // register dependency on inner trigger
                            s2.val();
                            // count total runs
                            count++;
                        });
                    });
                });

                // at start, we have one inner computation, that's run once
                assert(count, 1);

                // trigger the outer computation, making more inners
                s1.set(s1.peek() + 1);
                s1.set(s1.peek() + 1);

                assert(count, 3);

                // now trigger inner value: three orphaned computations should equal three runs
                count = 0;
                s2.set(s2.peek() + 1);

                assert(count, 3);
            });
        });

        test("does not batch updates when used at top level", function () {
            root(function () {
                var s1 = value(1);
                var c1 = compute(function () {
                    return s1.val();
                });
                assert(c1.val(), 1);
                s1.set(2);
                assert(c1.val(), 2);
                s1.set(3);
                assert(c1.val(), 3);
            });
        });

        test("persists through entire scope when used at top level", function () {
            root(function () {
                var s1 = value(1);
                effect(function () { 
                    s1.val();
                });
                s1.set(2);
                var c2 = compute(function () {
                    return s1.val();
                });
                s1.set(3);
                assert(c2.val(), 3);
            });
        });
    });
}
