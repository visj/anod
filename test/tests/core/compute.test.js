import { test, assert, Anod } from "../../helper/index.js";

/**
 *
 * @param {Anod} anod
 */
export function run(anod) {
  var { value, compute } = anod;
  test("compute", function () {
    test("returns initial value of wrapped function", function () {
      var c1 = compute(function () {
        return 1;
      });
      assert(c1.val(), 1);
    });

    test("does not run until read", function () {
      var calls = 0;
      var c1 = compute(function () {
        calls++;
      });
      assert(calls, 0);
      c1.val();
      assert(calls, 1);
    });

    test("does not re-occur when read", function () {
      var calls = 0;
      var c1 = compute(function () {
        calls++;
      });
      c1.val();
      c1.val();
      c1.val();
      assert(calls, 1);
    });

    test("with a dependency on signal", function () {
      test("updates when data is set", function () {
        var s1 = value(1);
        var count = 0;
        var c1 = compute(function () {
          count++;
          return s1.val();
        });
        count = 0;
        s1.set(2);
        assert(c1.val(), 2);
        assert(count, 1);
      });

      test("does not update when data is read", function () {
        var s1 = value(1);
        var count = 0;
        compute(function () {
          count++;
          return s1.val();
        });
        count = 0;
        s1.val();
        assert(count, 0);
      });

      test("updates return value", function () {
        var s1 = value(1);
        var c1 = compute(function () {
          return s1.val();
        });
        s1.set(2);
        assert(c1.val(), 2);
      });
    });

    test("with changing dependencies", function () {
      var s1;
      var s2;
      var s3;
      var evals;
      var c1;

      function init() {
        s1 = anod.value(true);
        s2 = anod.value(1);
        s3 = anod.value(2);
        c1 = anod.compute(
          function () {
            evals++;
            return s1.val() ? s2.val() : s3.val();
          },
          0,
          { unstable: true }
        );
        evals = 0;
      }

      test("updates on active dependencies", function () {
        anod.root(function () {
          init();
          s2.set(5);
          assert(c1.val(), 5);
          assert(evals, 1);
        });
      });

      test("does not update on inactive dependencies", function () {
        anod.root(function () {
          init();
          s3.set(5);
          assert(evals, 0);
          assert(c1.val(), 1);
        });
      });

      test("deactivates obsolete dependencies", function () {
        anod.root(function () {
          init();
          s1.set(false);
          evals = 0;
          s2.set(5);
          assert(evals, 0);
        });
      });

      test("activates new dependencies", function () {
        anod.root(function () {
          init();
          s1.set(false);
          evals = 0;
          s3.set(5);
          c1.val();
          assert(evals, 1);
        });
      });
    });

    test("that creates an data", function () {
      test("does not register a dependency", function () {
        anod.root(function () {
          var calls = 0;
          var s1;
          var c1 = anod.compute(function () {
            calls++;
            s1 = anod.value(1);
          });
          c1.val();
          calls = 0;
          s1.set(2);
          c1.val();
          assert(calls, 0);
        });
      });
    });

    test("from a function with no return value", function () {
      test("reads as undefined", function () {
        anod.root(function () {
          var c1 = anod.compute(function () { });
          assert(c1.val(), void 0);
        });
      });
    });

    test("with a dependency on a computation", function () {
      var s1, callsOne, c1, callsTwo, c2;

      function init() {
        s1 = anod.value(1);
        callsOne = 0;
        c1 = anod.compute(function () {
          callsOne++;
          return s1.val();
        });
        callsTwo = 0;
        c2 = anod.compute(function () {
          callsTwo++;
          return c1.val();
        });
      }

      test("does not cause re-evaluation", function () {
        anod.root(function () {
          init();
          c2.val();
          assert(callsOne, 1);
        });
      });

      test("does not occur from a read", function () {
        anod.root(function () {
          init();
          c1.val();
          assert(callsTwo, 0);
        });
      });

      test("does not occur from a read of the watcher", function () {
        anod.root(function () {
          init();
          c2.val();
          assert(callsTwo, 1);
        });
      });

      test("occurs when computation updates", function () {
        anod.root(function () {
          init();
          s1.set(2);
          assert(c2.val(), 2);
          assert(callsOne, 1);
          assert(callsTwo, 1);
        });
      });
    });

    test("with circular dependencies", function () {
      test("throws when cycle created by modifying a branch", function () {
        anod.root(function () {
          var s1 = anod.value(1);
          var c1 = anod.compute(function () {
            return c1 ? c1.val() : s1.val();
          }, 0);
          assert.throws(function () {
            s1.set(0);
            c1.val();
          });
        });
      });
    });

    test("with converging dependencies", function () {
      test("propagates in topological order", function () {
        anod.root(function () {
          //
          //     c1
          //    /  \
          //   /    \
          //  b1     b2
          //   \    /
          //    \  /
          //     a1
          //
          var calls = "";
          var s1 = anod.value(0);
          var c1 = anod.compute(function () {
            calls += "c1";
            return s1.val();
          });
          var c2 = anod.compute(function () {
            calls += "c2";
            return s1.val();
          });
          var c3 = anod.compute(function () {
            c1.val(), c2.val();
            calls += "c3";
          });
          calls = "";
          s1.set(s1.peek() + 1);
          c3.val();
          assert(calls, "c1c2c3");
        });
      });

      test("only propagates once with linear convergences", function () {
        anod.root(function () {
          //         d
          //         |
          // +---+---+---+---+
          // v   v   v   v   v
          // f1  f2  f3  f4  f5
          // |   |   |   |   |
          // +---+---+---+---+
          //         v
          //         g
          var s1 = anod.value(0);
          var c1 = anod.compute(function () {
            return s1.val();
          });
          var c2 = anod.compute(function () {
            return s1.val();
          });
          var c3 = anod.compute(function () {
            return s1.val();
          });
          var c4 = anod.compute(function () {
            return s1.val();
          });
          var c5 = anod.compute(function () {
            return s1.val();
          });
          var calls = 0;
          var c6 = anod.compute(function () {
            calls++;
            return c1.val() + c2.val() + c3.val() + c4.val() + c5.val();
          });
          calls = 0;
          s1.set(s1.peek() + 1);
          c6.val();
          assert(calls, 1);
        });
      });

      test("only propagates once with exponential convergence", function () {
        anod.root(function () {
          //     d
          //     |
          // +---+---+
          // v   v   v
          // c1  c2 c3
          //   \ | /
          //     O
          //   / | \
          // v   v   v
          // c4  c5  c6
          // +---+---+
          //     v
          //     h
          var s1 = anod.value(0);
          var c1 = anod.compute(function () {
            return s1.val();
          });
          var c2 = anod.compute(function () {
            return s1.val();
          });
          var c3 = anod.compute(function () {
            return s1.val();
          });
          var c4 = anod.compute(function () {
            return c1.val() + c2.val() + c3.val();
          });
          var c5 = anod.compute(function () {
            return c1.val() + c2.val() + c3.val();
          });
          var c6 = anod.compute(function () {
            return c1.val() + c2.val() + c3.val();
          });

          var calls = 0;
          var c7 = anod.compute(function () {
            calls++;
            c4.val() + c5.val() + c6.val();
          });

          calls = 0;
          s1.set(s1.peek() + 1);
          c7.val();
          assert(calls, 1);
        });
      });
    });
  });

}
