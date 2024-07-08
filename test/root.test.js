import { test, root, compute, cleanup, value } from './helper/anod.js';

describe("root()", function () {
    it("allows subcomputations to escape their parents", function () {
        root(function () {
            var outerTrigger = value(0);
            var innerTrigger = value(0);
            var innerRuns = 0;

            compute(function () {
                // register dependency to outer trigger
                outerTrigger.val();
                // inner computation
                root(function () {
                    compute(function () {
                        // register dependency on inner trigger
                        innerTrigger.val();
                        // count total runs
                        innerRuns++;
                    });
                });
            });

            // at start, we have one inner computation, that's run once
            test.equals(innerRuns , 1);

            // trigger the outer computation, making more inners
            outerTrigger.update(outerTrigger.peek() + 1);
            outerTrigger.update(outerTrigger.peek() + 1);

            test.equals(innerRuns , 3);

            // now trigger inner value: three orphaned computations should equal three runs
            innerRuns = 0;
            innerTrigger.update(innerTrigger.peek() + 1);

            test.equals(innerRuns , 3);
        });
    });

    it("does not batch updates when used at top level", function () {
        root(function() {
            var s = value(1);
            var c = compute(function () { return s.val(); });

            test.equals(c.val() , 1);

            s.update(2);

            test.equals(c.val() , 2);

            s.update(3);

            test.equals(c.val() , 3);
        });
    });

    it("persists through entire scope when used at top level", function() {
        root(function() {
            var s = value(1);
            compute(function() { s.val(); });
            s.update(2);
            var c2 = compute(function(){ return s.val(); });
            s.update(3);
            test.equals(c2.val() , 3);
        });
    });

    it("disposes owned root nodes", function() {
        root(function(teardown) {
            var d1;
            var count = 0;
            var cleanups = 0;
            compute(function() {
                root(function() {
                    cleanup(function(final) {
                        if (final) {
                            cleanups++;
                        }
                    });
                    d1 = value(0);
                    compute(function() { 
                        d1.val();
                        count++;
                    });
                });
            });
            d1.update(d1.peek() + 1);
            test.equals(count , 2);
            teardown();
            d1.update(d1.peek() + 1);
            test.equals(count , 2);
            test.equals(cleanups , 1);
        });
    });
});
