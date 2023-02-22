import { test, root, dispose, effect, cleanup, compute, value } from './helper/zorn.js';

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
                d1.val;
            }));
            collect(function () {
                test.ok(ref.deref() !== void 0);
                done();
            });
        });

        it("should be collected when disposed", function (done) {
            var d1 = value(1);
            var ref = new WeakRef(compute(function () {
                d1.val;
            }));
            dispose(d1);
            collect(function () {
                test.equals(ref.deref() , void 0);
                done();
            });
        });
    });
}
