import assert from 'assert';
import { root, effect, compute, value } from './helper/zorn.js';

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
            assert.equal(innerRuns, 1);

            // trigger the outer computation, making more inners
            outerTrigger.val++;
            outerTrigger.val++;

            assert.equal(innerRuns, 3);

            // now trigger inner value: three orphaned computations should equal three runs
            innerRuns = 0;
            innerTrigger.val++;

            assert.equal(innerRuns, 3);
        });
    });

    it("does not batch updates when used at top level", function () {
        root(function() {
            var s = value(1);
            var c = compute(function () { return s.val; });

            assert.equal(c.val, 1);

            s.val = 2;

            assert.equal(c.val, 2);

            s.val = 3;

            assert.equal(c.val, 3);
        });
    });

    it("persists through entire scope when used at top level", function() {
        root(function() {
            var s = value(1);
            effect(function() { s.val; });
            s.val = 2;
            var c2 = compute(function(){ return s.val; });
            s.val = 3;
            assert.equal(c2.val, 3);
        });
    });
});
