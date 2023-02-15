import assert from 'assert';
import { root, compute, signal, dispose } from './helper/zorn.js';

describe("compute() with subcomputations", function () {

    it("does not register a dependency on the subcomputation", function () {
        root(function () {
            var d = signal(1);
            var outerCount = 0;
            var innerCount = 0;
            function outerCounter() {
                outerCount++;
            }
            function innerCounter() {
                innerCount++;
            }
            compute(function () {
                outerCounter();
                compute(function () {
                    innerCounter();
                    return d.val;
                });
            })

            outerCount = innerCount = 0;

            d.val = 2;

            assert.equal(innerCount, 1);
            assert.equal(outerCount, 0);
        });
    });

    describe("with child", function () {
        var d, e, g, h,
            outerCount, outerCounter,
            innerCount, innerCounter;

        function init() {
            d = signal(1);
            e = signal(2);
            outerCount = innerCount = 0;
            outerCounter = function () {
                outerCount++;
            }
            innerCounter = function () {
                innerCount++;
            }
            compute(function () {
                outerCounter();
                d.val;
                g = compute(function () {
                    innerCounter();
                    return e.val;
                });
            });
            h = g;
            h.val;
        }

        it("creates child on initialization", function () {
            root(function () {
                init();
                assert.equal(h.val, 2);
            });
        });

        it("does not depend on child's dependencies", function () {
            root(function () {
                init();
                e.val = 3;
                assert.equal(outerCount, 1);
                assert.equal(innerCount, 2);
            });
        });

        it("disposes child when it is disposed", function () {
            var owner = root(function () {
                init();
            });

            dispose(owner);
            e.val = 3;
            assert.equal(g.val, void 0);
        });
    });

    describe("which disposes sub that's being updated", function () {
        it("propagates successfully", function () {
            root(function () {
                var a = signal(1);
                var b = compute(function () {
                    var c = compute(function () {
                        return a.val;
                    });
                    a.val;
                    return { c: c };
                });
                var d = compute(function () {
                    return b.val.c.val;
                });

                assert.equal(d.val, 1);
                a.val = 2;
                assert.equal(d.val, 2);
                a.val = 3;
                assert.equal(d.val, 3);
            });
        });
    });

    describe("which disposes a sub with a dependee with a sub", function () {
        it("propagates successfully", function () {
            root(function () {
                var a = signal(1);
                var c;
                compute(function () {
                    c = compute(function () {
                        return a.val;
                    });
                    a.val;
                    return { c: c };
                });
                var d = compute(function () {
                    c.val;
                    var e = compute(function () {
                        return a.val;
                    });
                    return { e: e };
                });

                assert.equal(d.val.e.val, 1);
                a.val = 2;
                assert.equal(d.val.e.val, 2);
                a.val = 3;
                assert.equal(d.val.e.val, 3);
            });
        });
    });
});
