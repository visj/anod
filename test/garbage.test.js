import { test, compute, value } from './helper/zorn.js';

if (global.gc) {

    /**
     * 
     * @param {function(): void} callback 
     */
    function collect(callback) {
        setTimeout(function () {
            global.gc();
            callback();
        });
    }

    describe("garbage collection", function () {

        it("should not be collected when referenced", function (done) {
            var d1 = value(1);
            var ref = new WeakRef(compute(function () {
                d1.val();
            }));
            collect(function () {
                test.ok(ref.deref() !== void 0);
                done();
            });
        });

        it("should be collected when disposed", function (done) {
            var s1 = value(1);
            var c1 = new WeakRef(compute(function () {
                s1.val();
            }));
            s1.dispose();
            collect(function () {
                test.equals(c1.deref() , void 0);
                done();
            });
        });

        it("should be collected when only referenced locally", function(done) {
            function local() {
                var s1 = new WeakRef(value(1));
                var c1 = new WeakRef(compute(function() {
                    return s1.deref().val();
                }));
                return { s1, c1 };
            }
            var { s1, c1 } = local();
            test.equals(c1.deref().val(), 1);
            collect(function() {
                test.equals(s1.deref(), void 0);
                test.equals(c1.deref(), void 0);
                done();
            });
        });
    });
}
