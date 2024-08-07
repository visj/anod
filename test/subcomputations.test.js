import { test, root, compute, value } from './helper/anod.js';

describe("compute() with subcomputations", function () {

    it("does not register a dependency on the subcomputation", function () {
        root(function () {
            var d = value(1);
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
                    return d.val();
                });
            })

            outerCount = innerCount = 0;

            d.update(2);

            test.equals(innerCount , 1);
            test.equals(outerCount , 0);
        });
    });

    describe("with child", function () {
        var d, e, g, h,
            outerCount, outerCounter,
            innerCount, innerCounter;

        function init() {
            d = value(1);
            e = value(2);
            outerCount = innerCount = 0;
            outerCounter = function () {
                outerCount++;
            }
            innerCounter = function () {
                innerCount++;
            }
            compute(function () {
                outerCounter();
                d.val();
                g = compute(function () {
                    innerCounter();
                    return e.val();
                });
            });
            h = g;
            h.val();
        }

        it("creates child on initialization", function () {
            root(function () {
                init();
                test.equals(h.val() , 2);
            });
        });

        it("does not depend on child's dependencies", function () {
            root(function () {
                init();
                e.update(3);
                test.equals(outerCount , 1);
                test.equals(innerCount , 2);
            });
        });

        it("disposes child when it is disposed", function () {
            root(function (teardown) {
                init();
                teardown();
                e.update(3);
                test.equals(g.val() , null);
            });
        });
    });

    describe("which disposes sub that's being updated", function () {
        it("propagates successfully", function () {
            root(function () {
                var a = value(1);
                var b = compute(function () {
                    var c = compute(function () {
                        return a.val();
                    });
                    a.val();
                    return { c: c };
                });
                var d = compute(function () {
                    return b.val().c.val();
                });

                test.equals(d.val() , 1);
                a.update(2);
                test.equals(d.val() , 2);
                a.update(3);
                test.equals(d.val() , 3);
            });
        });
    });

    describe("which disposes a sub with a dependee with a sub", function () {
        it("propagates successfully", function () {
            root(function () {
                var a = value(1);
                var c;
                compute(function () {
                    c = compute(function () {
                        return a.val();
                    });
                    a.val();
                    return { c: c };
                });
                var d = compute(function () {
                    c.val();
                    var e = compute(function () {
                        return a.val();
                    });
                    return { e: e };
                });

                test.equals(d.val().e.val() , 1);
                a.update(2);
                test.equals(d.val().e.val() , 2);
                a.update(3);
                test.equals(d.val().e.val() , 3);
            });
        });
    });
});
