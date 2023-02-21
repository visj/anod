import { test, root, effect, compute, cleanup, value } from './helper/zorn.js';

describe("root()", function () {
    it("allows subcomputations to escape their parents", function () {
        root(function () {
            var outerTrigger = value(0);
            var innerTrigger = value(0);
            var innerRuns = 0;

            effect(function () {
                // register dependency to outer trigger
                outerTrigger.val;
                // inner computation
                root(function () {
                    effect(function () {
                        // register dependency on inner trigger
                        innerTrigger.val;
                        // count total runs
                        innerRuns++;
                    });
                });
            });

            // at start, we have one inner computation, that's run once
            test.ok(innerRuns === 1);

            // trigger the outer computation, making more inners
            outerTrigger.set(outerTrigger.peek + 1);
            outerTrigger.set(outerTrigger.peek + 1);

            test.ok(innerRuns === 3);

            // now trigger inner value: three orphaned computations should equal three runs
            innerRuns = 0;
            innerTrigger.set(innerTrigger.peek + 1);

            test.ok(innerRuns === 3);
        });
    });

    it("does not batch updates when used at top level", function () {
        root(function() {
            var s = value(1);
            var c = compute(function () { return s.val; });

            test.ok(c.val === 1);

            s.set(2);

            test.ok(c.val === 2);

            s.set(3);

            test.ok(c.val === 3);
        });
    });

    it("persists through entire scope when used at top level", function() {
        root(function() {
            var s = value(1);
            effect(function() { s.val; });
            s.set(2);
            var c2 = compute(function(){ return s.val; });
            s.set(3);
            test.ok(c2.val === 3);
        });
    });

    it("disposes owned root nodes", function() {
        root(function(teardown) {
            var d1;
            var count = 0;
            var cleanups = 0;
            effect(function() {
                root(function() {
                    cleanup(function(final) {
                        if (final) {
                            cleanups++;
                        }
                    });
                    d1 = value(0);
                    effect(function() { 
                        d1.val;
                        count++;
                    });
                });
            });
            d1.set(d1.peek + 1);
            test.ok(count === 2);
            teardown();
            d1.set(d1.peek + 1);
            test.ok(count === 2);
            test.ok(cleanups === 1);
        });
    });
});
