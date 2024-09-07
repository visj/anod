import { test, assert, Anod } from "../helper/index.js";

/**
 * 
 * @param {Anod} anod 
 */
export async function run(anod) {
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
  
    await test("garbage collection", async function () {
      await test("should not be collected when referenced", function () {
        var d1 = anod.value(1);
        var ref = new WeakRef(
          anod.compute(function () {
            d1.val();
          }),
        );
        return new Promise(function(resolve) {
          collect(function () {
            assert(ref.deref() !== void 0, true);
            resolve();
          });
        })
      });
  
      await test("should be collected when disposed", async function () {
        var s1 = anod.value(1);
        var c1 = new WeakRef(
          anod.compute(function () {
            s1.val();
          }),
        );
        anod.dispose(s1);
        return new Promise(function(resolve) {
          collect(function () {
            assert(c1.deref(), void 0);
            resolve();
          });
        });
      });
  
      await test("should be collected when only referenced locally", function () {
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
        return new Promise(function(resolve) {
          collect(function () {
            assert(s1.deref(), void 0);
            assert(c1.deref(), void 0);
            resolve();
          });
        });
      });
    });
  }  
}