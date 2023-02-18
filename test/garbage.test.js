import assert from 'assert';
import { root, dispose, effect, cleanup, compute, value } from './helper/zorn.js';

if (globalThis.gc) {

    /**
     * 
     * @param {function(): void} callback 
     */
    function collect(callback) {
        setTimeout(function () {
            globalThis.gc();
            callback();
        });
    }

    describe("garbage collection", function () {

        it("should not be collected when referenced", function (done) {
            var d1 = value(1);
            var ref = new WeakRef(effect(function () {
                d1.val;
            }));
            collect(function () {
                assert.notEqual(ref.deref(), void 0);
                done();
            });
        });

        it("should be collected when disposed", function (done) {
            var d1 = value(1);
            var ref = new WeakRef(effect(function () {
                d1.val;
            }));
            dispose(d1);
            collect(function () {
                assert.equal(ref.deref(), void 0);
                done();
            });
        });

        it("should not be collected when it has chilren", function(done) {
            root(function(teardown) {
                var d1 = value(1);
                var ref = new WeakRef(effect(function() {
                    effect(function() {
                        d1.val;
                    });
                }));
                collect(function() {
                    assert.notEqual(ref.deref(), void 0);
                    done();
                });
            });
        });
    });
}