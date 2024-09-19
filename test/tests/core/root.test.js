import { test, assert, Anod } from "../../helper/index.js";

/**
 *
 * @param {Anod} anod
 */
export function run(anod) {
    test("root", function () {
        test("allows subcomputations to escape their parents", function () {
            anod.root(function () {
                var outerTrigger = anod.value(0);
                var innerTrigger = anod.value(0);
                var innerRuns = 0;

                anod.effect(function () {
                    // register dependency to outer trigger
                    outerTrigger.val();
                    // inner computation
                    anod.root(function () {
                        anod.effect(function () {
                            // register dependency on inner trigger
                            innerTrigger.val();
                            // count total runs
                            innerRuns++;
                        });
                    });
                });

                // at start, we have one inner computation, that's run once
                assert(innerRuns , 1);

                // trigger the outer computation, making more inners
                outerTrigger.update(outerTrigger.peek() + 1);
                outerTrigger.update(outerTrigger.peek() + 1);

                assert(innerRuns , 3);

                // now trigger inner value: three orphaned computations should equal three runs
                innerRuns = 0;
                innerTrigger.update(innerTrigger.peek() + 1);

                assert(innerRuns , 3);
            });
        });

        test("does not batch updates when used at top level", function () {
            anod.root(function() {
                var s = anod.value(1);
                var c = anod.compute(function () { return s.val(); });

                assert(c.val() , 1);

                s.update(2);

                assert(c.val() , 2);

                s.update(3);

                assert(c.val() , 3);
            });
        });

        test("persists through entire scope when used at top level", function() {
            anod.root(function() {
                var s = anod.value(1);
                anod.compute(function() { s.val(); });
                s.update(2);
                var c2 = anod.compute(function(){ return s.val(); });
                s.update(3);
                assert(c2.val() , 3);
            });
        });
    });
}
