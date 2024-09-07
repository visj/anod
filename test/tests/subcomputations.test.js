import { test, assert, Anod } from "../helper/index.js";

/**
 * 
 * @param {Anod} anod 
 */
export function run(anod) {
    test("compute with subcomputations", function () {
        test("does not register a dependency on the subcomputation", function () {
            anod.root(function () {
                var d = anod.value(1);
                var outerCount = 0;
                var innerCount = 0;
                function outerCounter() {
                    outerCount++;
                }
                function innerCounter() {
                    innerCount++;
                }
                anod.compute(function () {
                    outerCounter();
                    anod.compute(function () {
                        innerCounter();
                        return d.val();
                    });
                })
    
                outerCount = innerCount = 0;
    
                d.update(2);
    
                assert(innerCount , 1);
                assert(outerCount , 0);
            });
        });
    
        test("disallows children in lazy computations", function () {
          anod.root(function () {
            var v1 = anod.value(1);
            var called = false;
            assert(function () {
              anod.compute(function () {
                v1.val();
                anod.compute(function () {
                  called = true;
                  v1.val();
                });
              }, void 0, { lazy: true });
            }, "throws");
            assert(called, false);
          });
        });
    
        test("wtesth child", function () {
            var d, e, g, h,
                outerCount, outerCounter,
                innerCount, innerCounter;
    
            function init() {
                d = anod.value(1);
                e = anod.value(2);
                outerCount = innerCount = 0;
                outerCounter = function () {
                    outerCount++;
                }
                innerCounter = function () {
                    innerCount++;
                }
                anod.compute(function () {
                    outerCounter();
                    d.val();
                    g = anod.compute(function () {
                        innerCounter();
                        return e.val();
                    });
                });
                h = g;
                h.val();
            }
    
            test("creates child on intestialization", function () {
                anod.root(function () {
                    init();
                    assert(h.val() , 2);
                });
            });
    
            test("does not depend on child's dependencies", function () {
                anod.root(function () {
                    init();
                    e.update(3);
                    assert(outerCount , 1);
                    assert(innerCount , 2);
                });
            });
    
            test("disposes child when test is disposed", function () {
                anod.root(function (teardown) {
                    init();
                    teardown();
                    e.update(3);
                    assert(g.val() , null);
                });
            });
        });
    
        test("which disposes sub that's being updated", function () {
            test("propagates successfully", function () {
                anod.root(function () {
                    var a = anod.value(1);
                    var b = anod.compute(function () {
                        var c = anod.compute(function () {
                            return a.val();
                        });
                        a.val();
                        return { c: c };
                    });
                    var d = anod.compute(function () {
                        return b.val().c.val();
                    });
    
                    assert(d.val() , 1);
                    a.update(2);
                    assert(d.val() , 2);
                    a.update(3);
                    assert(d.val() , 3);
                });
            });
        });
    
        test("which disposes a sub wtesth a dependee wtesth a sub", function () {
            test("propagates successfully", function () {
                anod.root(function () {
                    var a = anod.value(1);
                    var c;
                    anod.compute(function () {
                        c = anod.compute(function () {
                            return a.val();
                        });
                        a.val();
                        return { c: c };
                    });
                    var d = anod.compute(function () {
                        c.val();
                        var e = anod.compute(function () {
                            return a.val();
                        });
                        return { e: e };
                    });
    
                    assert(d.val().e.val() , 1);
                    a.update(2);
                    assert(d.val().e.val() , 2);
                    a.update(3);
                    assert(d.val().e.val() , 3);
                });
            });
        });
    });
}

