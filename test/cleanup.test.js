import { test, root, cleanup, compute, value } from "./helper/anod.js";

describe("cleanup", function () {
    it("is called when a computation is disposed", function () {
        var s1 = value(1);
        var calls = 0;
        compute(function () {
            s1.val();
            cleanup(function () {
                calls++;
            });
        });
        test.equals(calls, 0);
        s1.update(s1.peek() + 1);
        test.equals(calls, 1);
    });

    it("can be called from within a subcomputation", function () {
        var s1 = value(1);
        var calls = 0;
        compute(function () {
            s1.val();
            compute(function () {
                cleanup(function () {
                    calls++;
                });
            });
        });
        test.equals(calls, 0);
        s1.update(s1.peek() + 1);
        test.equals(calls, 1);
    });

    it("accepts multiple cleanup functions", function () {
        var s1 = value(1);
        var calls = 0;
        compute(function () {
            s1.val();
            cleanup(function () {
                calls++;
            });
            cleanup(function () {
                calls++;
            });
        });
        test.equals(calls, 0);
        s1.update(s1.peek() + 1);
        test.equals(calls, 2);
    });

    it("runs cleanups in reverse order", function () {
        var s1 = value(1);
        var calls = "";
        compute(function () {
            s1.val();
            cleanup(function () {
                calls += "a";
            });
            cleanup(function () {
                calls += "b";
            });
        });
        test.equals(calls, "");
        s1.update(s1.peek() + 1);
        test.equals(calls, "ba");
    });

    it("can be run within root scope", function () {
        var calls = 0;
        root(function (teardown) {
            cleanup(function () {
                calls++;
            });
            teardown();
            test.equals(calls, 1);
        });
    });

    it("is run only once when a computation is disposed", function () {
        var s1 = value(1);
        var calls = 0;
        root(function (teardown) {
            compute(function () {
                s1.val();
                cleanup(function () {
                    calls++;
                });
            });
            test.equals(calls, 0);
            s1.update(s1.peek() + 1);
            test.equals(calls, 1);
            teardown();
            test.equals(calls, 2);
            s1.update(s1.peek() + 1);
            test.equals(calls, 2);
        });
    });
});
