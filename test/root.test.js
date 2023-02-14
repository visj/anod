import assert from 'assert';
import { root, compute, data } from './helper/zorn.js';

describe("root()", function () {
    it("allows subcomputations to escape their parents", function () {
        root(function () {
            var outerTrigger = data(null);
            var innerTrigger = data(null);
            var innerRuns = 0;

            compute(function () {
                // register dependency to outer trigger
                outerTrigger.val;
                // inner computation
                root(function () {
                    compute(function () {
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
            outerTrigger.val = null;
            outerTrigger.val = null;

            assert.equal(innerRuns, 3);

            // now trigger inner signal: three orphaned computations should equal three runs
            innerRuns = 0;
            innerTrigger.val = null;

            assert.equal(innerRuns, 3);
        });
    });

    it("does not freeze updates when used at top level", function () {
        root(() => {
            var s = data(1);
            var c = compute(function () { return s.val; });

            assert.equal(c.val, 1);

            s.val = 2;

            assert.equal(c.val, 2);

            s.val = 3;

            assert.equal(c.val, 3);
        });
    });

    it("persists through entire scope when used at top level", () => {
        root(() => {
            var s = data(1);
            compute(function() { s.val; });
            s.val = 2;
            var c2 = compute(function(){ return s.val; });
            s.val = 3;
            assert.equal(c2.val, 3);
        });
    });
});
