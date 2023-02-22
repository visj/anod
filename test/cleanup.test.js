import { test, root, dispose, cleanup, compute, value } from './helper/zorn.js';

describe("cleanup", function () {
    it("is called when a computation is disposed", function () {
        var d = value(1);
        var called = false;
        compute(function () {
            d.val;
            cleanup(function () {
                called = true;
            });
        });
        test.equals(called , false);
        d.set(d.peek + 1);
        test.equals(called , true);
    });

    it("can be called from within a subcomputation", function () {
        var d = value(1);
        var called = false;
        compute(function () {
            d.val;
            compute(function () {
                cleanup(function () {
                    called = true;
                });
            });
        });
        test.equals(called , false);
        d.set(d.peek + 1);
        test.equals(called , true);
    });

    it("accepts multiple cleanup functions", function () {
        var d = value(1);
        var called = 0;
        compute(function () {
            d.val;
            cleanup(function () {
                called++;
            });
            cleanup(function () {
                called++;
            });
        });
        test.equals(called , 0);
        d.set(d.peek + 1);
        test.equals(called , 2);
    });

    it("runs cleanups in order", function () {
        var d = value(1);
        var called = '';
        compute(function () {
            d.val;
            cleanup(function () {
                called += 'a';
            });
            cleanup(function () {
                called += 'b';
            });
        });
        test.equals(called , '');
        d.set(d.peek + 1);
        test.equals(called , 'ab');
    });

    it("can be run within root scope", function () {
        var called = false;
        root(function (teardown) {
            cleanup(function () {
                called = true;
            });

            teardown();
            test.equals(called , true);
        });
    });

    it("is run only once when a computation is disposed", function () {
        var d = value(1);
        var called = 0;
        root(function (teardown) {

            compute(function () {
                d.val;
                cleanup(function () {
                    called++;
                });
            });
            test.equals(called , 0);
            d.set(d.peek + 1);
            test.equals(called , 1);
            teardown();
            test.equals(called , 2);
            d.set(d.peek + 1);
            test.equals(called , 2);
        });
    });
});
