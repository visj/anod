import { test, assert, throws } from "../helper/index.js";

export function run(anod) {
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
  
    test("garbage collection", function () {
      test("should not be collected when referenced", function (done) {
        var d1 = anod.value(1);
        var ref = new WeakRef(
          anod.compute(function () {
            d1.val();
          }),
        );
        collect(function () {
          assert(ref.deref() !== void 0, true);
          done();
        });
      });
  
      test("should be collected when disposed", function (done) {
        var s1 = anod.value(1);
        var c1 = new WeakRef(
          anod.compute(function () {
            s1.val();
          }),
        );
        anod.dispose(s1);
        collect(function () {
          assert(c1.deref(), void 0);
          done();
        });
      });
  
      test("should be collected when only referenced locally", function (done) {
        function local() {
          var s1 = new WeakRef(anod.value(1));
          var c1 = new WeakRef(
            anod.compute(function () {
              return s1.deref().val();
            }),
          );
          return { s1, c1 };
        }
        var { s1, c1 } = local();
        assert(c1.deref().val(), 1);
        collect(function () {
          assert(s1.deref(), void 0);
          assert(c1.deref(), void 0);
          done();
        });
      });
    });
  }  
}