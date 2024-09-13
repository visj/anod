import { test, assert, Anod } from "../../helper/index.js";

/**
 *
 * @param {Anod} anod
 */
export function run(anod) {
  test("compute", function () {
    test("creation", function () {
      test("returns intestial value of wrapped function", function () {
        anod.root(function () {
          var c1 = anod.compute(function () {
            return 1;
          });
          assert(c1.val(), 1);
        });
      });
    });

    test("evaluation", function () {
      test("occurs once inttestially", function () {
        anod.root(function () {
          var calls = 0;
          anod.compute(function () {
            calls++;
          });
          assert(calls, 1);
        });
      });

      test("does not re-occur when read", function () {
        anod.root(function () {
          var calls = 0;
          var c1 = anod.compute(function () {
            calls++;
          });

          c1.val();
          c1.val();
          c1.val();

          assert(calls, 1);
        });
      });
    });

    test("wtesth a dependency on an data", function () {
      test("updates when data is set", function () {
        anod.root(function () {
          var s1 = anod.value(1);
          var fevals = 0;
          anod.compute(function () {
            fevals++;
            s1.val();
          });

          fevals = 0;

          s1.update(s1.peek() + 1);
          assert(fevals, 1);
        });
      });

      test("does not update when data is read", function () {
        anod.root(function () {
          var s1 = anod.value(1);
          var evals = 0;
          anod.compute(function () {
            evals++;
            s1.val();
          });

          evals = 0;

          s1.val();
          assert(evals, 0);
        });
      });

      test("updates return value", function () {
        anod.root(function () {
          var s1 = anod.value(1);
          var c1 = anod.compute(function () {
            return s1.val();
          });

          s1.update(2);
          assert(c1.val(), 2);
        });
      });
    });

    test("wtesth changing dependencies", function () {
      var s1;
      var s2;
      var s3;
      var evals;
      var c1;

      function intest() {
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
          intest();
          s2.update(5);
          assert(evals, 1);
          assert(c1.val(), 5);
        });
      });

      test("does not update on inactive dependencies", function () {
        anod.root(function () {
          intest();
          s3.update(5);
          assert(evals, 0);
          assert(c1.val(), 1);
        });
      });

      test("deactivates obsolete dependencies", function () {
        anod.root(function () {
          intest();
          s1.update(false);
          evals = 0;
          s2.update(5);
          assert(evals, 0);
        });
      });

      test("activates new dependencies", function () {
        anod.root(function () {
          intest();
          s1.update(false);
          evals = 0;
          s3.update(5);
          assert(evals, 1);
        });
      });
    });

    test("that creates an data", function () {
      test("does not register a dependency", function () {
        anod.root(function () {
          var calls = 0,
            s1;
          anod.compute(function () {
            calls++;
            s1 = anod.value(1);
          });
          calls = 0;
          s1.update(2);
          assert(calls, 0);
        });
      });
    });

    test("lazy", function () {
      test("does not eagerly update lazy computations", function () {
        anod.root(function () {
          var s1 = anod.value(1);
          var calls = 0;
          var c1 = anod.compute(function () {
            calls++;
            return s1.val();
          }, 0, { lazy: true });
          assert(c1.val(), 1);
          s1.update(2);
          assert(calls, 1);
          s1.update(3);
          assert(calls, 1);
          s1.update(4);
          assert(c1.val(), 4);
          assert(c1.val(), 4);
          assert(c1.val(), 4);
          assert(calls, 2);
        });
      });

      test("works inside the body of a computation", function () {
        anod.root(function () {
          var s1 = anod.value(1);
          var calls = 0;
          anod.compute(function () {
            calls++;
            return s1.val();
          }, 0, { lazy: true });
        })
      });

      test("works for derived mayupdate computations", function () {
        var s1 = anod.value(1);
        var calls1 = 0;
        var calls2 = 0;
        var calls3 = 0;
        var c1 = anod.compute(function () {
          calls1++;
          return s1.val();
        }, 0, { lazy: true });
        var c2 = anod.compute(function () {
          calls2++;
          return c1.val();
        }, 0, { lazy: true });
        var c3 = anod.compute(function () {
          calls3++;
          return c2.val();
        }, 0, { lazy: true });
        s1.update(2);
        assert(calls1, 1);
        assert(calls2, 1);
        assert(calls3, 1);
        s1.update(3);
        assert(calls1, 1);
        assert(calls2, 1);
        assert(calls3, 1);
        assert(c3.val(), 3);
        assert(calls1, 2);
        assert(calls2, 2);
        assert(calls3, 2);
        assert(c3.val(), 3);
        assert(calls1, 2);
        assert(calls2, 2);
        assert(calls3, 2);
      });
    });

    test("from a function wtesth no return value", function () {
      test("reads as undefined", function () {
        anod.root(function () {
          var c1 = anod.compute(function () { });
          assert(c1.val(), void 0);
        });
      });
    });

    test("wtesth a seed", function () {
      test("reduces seed value", function () {
        anod.root(function () {
          var s1 = anod.value(5);
          var c1 = anod.compute(function (seed) {
            return seed + s1.val();
          }, 5);
          assert(c1.val(), 10);
          s1.update(6);
          assert(c1.val(), 16);
        });
      });
    });

    test("wtesth a dependency on a computation", function () {
      var s1, callsOne, c1, callsTwo, c2;

      function intest() {
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
          intest();
          assert(callsOne, 1);
        });
      });

      test("does not occur from a read", function () {
        anod.root(function () {
          intest();
          c1.val();
          assert(callsTwo, 1);
        });
      });

      test("does not occur from a read of the watcher", function () {
        anod.root(function () {
          intest();
          c2.val();
          assert(callsTwo, 1);
        });
      });

      test("occurs when computation updates", function () {
        anod.root(function () {
          intest();
          s1.update(2);
          assert(callsOne, 2);
          assert(callsTwo, 2);
          assert(c2.val(), 2);
        });
      });
    });

    test("wtesth unending changes", function () {
      test("throws when continually setting a direct dependency", function () {
        anod.root(function () {
          var d = anod.value(1);
          assert.throws(function () {
            anod.compute(function () {
              d.val();
              d.update(d.peek() + 1);
            });
          });
        });
      });

      test("throws when continually setting an indirect dependency", function () {
        anod.root(function () {
          var s1 = anod.value(1);
          var c1 = anod.compute(function () {
            return s1.val();
          });
          var c2 = anod.compute(function () {
            return c1.val();
          });
          var c3 = anod.compute(function () {
            return c2.val();
          });

          assert.throws(function () {
            anod.compute(function () {
              c3.val();
              s1.update(s1.peek() + 1);
            });
          });
        });
      });
    });

    test("wtesth circular dependencies", function () {
      test("throws when cycle created by modifying a branch", function () {
        anod.root(function () {
          var s1 = anod.value(1);
          var c1 = anod.compute(function () {
            return c1 ? c1.val() : s1.val();
          }, 0);
          assert.throws(function () {
            s1.update(0);
          });
        });
      });
    });

    test("wtesth converging dependencies", function () {
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
          anod.compute(function () {
            c1.val(), c2.val();
            calls += "c3";
          });
          calls = "";
          s1.update(s1.peek() + 1);
          assert(calls, "c1c2c3");
        });
      });

      test("only propagates once wtesth linear convergences", function () {
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
          anod.compute(function () {
            calls++;
            return c1.val() + c2.val() + c3.val() + c4.val() + c5.val();
          });
          calls = 0;
          s1.update(s1.peek() + 1);
          assert(calls, 1);
        });
      });

      test("only propagates once wtesth exponential convergence", function () {
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
          anod.compute(function () {
            calls++;
            c4.val() + c5.val() + c6.val();
          });

          calls = 0;
          s1.update(s1.peek() + 1);
          assert(calls, 1);
        });
      });
    });
  });

}
