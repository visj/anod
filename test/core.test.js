import { test, root, compute, value } from "./helper/anod.js";

describe("compute()", function () {
  describe("creation", function () {
    it("returns initial value of wrapped function", function () {
      root(function () {
        var c1 = compute(function () {
          return 1;
        });
        test.equals(c1.val(), 1);
      });
    });
  });

  describe("evaluation", function () {
    it("occurs once intitially", function () {
      root(function () {
        var calls = 0;
        compute(function () {
          calls++;
        });
        test.equals(calls, 1);
      });
    });

    it("does not re-occur when read", function () {
      root(function () {
        var calls = 0;
        var c1 = compute(function () {
          calls++;
        });

        c1.val();
        c1.val();
        c1.val();

        test.equals(calls, 1);
      });
    });
  });

  describe("with a dependency on an data", function () {
    it("updates when data is set", function () {
      root(function () {
        var s1 = value(1);
        var fevals = 0;
        compute(function () {
          fevals++;
          s1.val();
        });

        fevals = 0;

        s1.update(s1.peek() + 1);
        test.equals(fevals, 1);
      });
    });

    it("does not update when data is read", function () {
      root(function () {
        var s1 = value(1);
        var evals = 0;
        compute(function () {
          evals++;
          s1.val();
        });

        evals = 0;

        s1.val();
        test.equals(evals, 0);
      });
    });

    it("updates return value", function () {
      root(function () {
        var s1 = value(1);
        var c1 = compute(function () {
          return s1.val();
        });

        s1.update(2);
        test.equals(c1.val(), 2);
      });
    });
  });

  describe("with changing dependencies", function () {
    var s1;
    var s2;
    var s3;
    var evals;
    var c1;

    function init() {
      s1 = value(true);
      s2 = value(1);
      s3 = value(2);
      c1 = compute(
        function () {
          evals++;
          return s1.val() ? s2.val() : s3.val();
        },
        0,
        { unstable: true }
      );
      evals = 0;
    }

    it("updates on active dependencies", function () {
      root(function () {
        init();
        s2.update(5);
        test.equals(evals, 1);
        test.equals(c1.val(), 5);
      });
    });

    it("does not update on inactive dependencies", function () {
      root(function () {
        init();
        s3.update(5);
        test.equals(evals, 0);
        test.equals(c1.val(), 1);
      });
    });

    it("deactivates obsolete dependencies", function () {
      root(function () {
        init();
        s1.update(false);
        evals = 0;
        s2.update(5);
        test.equals(evals, 0);
      });
    });

    it("activates new dependencies", function () {
      root(function () {
        init();
        s1.update(false);
        evals = 0;
        s3.update(5);
        test.equals(evals, 1);
      });
    });
  });

  describe("that creates an data", function () {
    it("does not register a dependency", function () {
      root(function () {
        var calls = 0,
          s1;
        compute(function () {
          calls++;
          s1 = value(1);
        });
        calls = 0;
        s1.update(2);
        test.equals(calls, 0);
      });
    });
  });

  describe("lazy", function () {
    it("does not eagerly update lazy computations", function () {
      root(function () {
        var s1 = value(1);
        var calls = 0;
        var c1 = compute(function () {
          calls++;
          return s1.val();
        }, 0, { lazy: true });
        test.equals(c1.val(), 1);
        s1.update(2);
        test.equals(calls, 1);
        s1.update(3);
        test.equals(calls, 1);
        s1.update(4);
        test.equals(c1.val(), 4);
        test.equals(c1.val(), 4);
        test.equals(c1.val(), 4);
        test.equals(calls, 2);
      });
    });

    it("works inside the body of a computation", function () {
      root(function() {
        var s1 = value(1);
        var calls = 0;
        compute(function () {
          calls++;
          return s1.val();
        }, 0, { lazy: true });
      })
    });

    it("works for derived mayupdate computations", function () {
      var s1 = value(1);
      var calls1 = 0;
      var calls2 = 0;
      var calls3 = 0;
      var c1 = compute(function () {
        calls1++;
        return s1.val();
      }, 0, { lazy: true });
      var c2 = compute(function () {
        calls2++;
        return c1.val();
      }, 0, { lazy: true });
      var c3 = compute(function () {
        calls3++;
        return c2.val();
      }, 0, { lazy: true });
      s1.update(2);
      test.equals(calls1, 1);
      test.equals(calls2, 1);
      test.equals(calls3, 1);
      s1.update(3);
      test.equals(calls1, 1);
      test.equals(calls2, 1);
      test.equals(calls3, 1);
      test.equals(c3.val(), 3);
      test.equals(calls1, 2);
      test.equals(calls2, 2);
      test.equals(calls3, 2);
      test.equals(c3.val(), 3);
      test.equals(calls1, 2);
      test.equals(calls2, 2);
      test.equals(calls3, 2);
    });
  });

  describe("from a function with no return value", function () {
    it("reads as undefined", function () {
      root(function () {
        var c1 = compute(function () {});
        test.equals(c1.val(), void 0);
      });
    });
  });

  describe("with a seed", function () {
    it("reduces seed value", function () {
      root(function () {
        var s1 = value(5);
        var c1 = compute(function (seed) {
          return seed + s1.val();
        }, 5);
        test.equals(c1.val(), 10);
        s1.update(6);
        test.equals(c1.val(), 16);
      });
    });
  });

  describe("with a dependency on a computation", function () {
    var s1, callsOne, c1, callsTwo, c2;

    function init() {
      s1 = value(1);
      callsOne = 0;
      c1 = compute(function () {
        callsOne++;
        return s1.val();
      });
      callsTwo = 0;
      c2 = compute(function () {
        callsTwo++;
        return c1.val();
      });
    }

    it("does not cause re-evaluation", function () {
      root(function () {
        init();
        test.equals(callsOne, 1);
      });
    });

    it("does not occur from a read", function () {
      root(function () {
        init();
        c1.val();
        test.equals(callsTwo, 1);
      });
    });

    it("does not occur from a read of the watcher", function () {
      root(function () {
        init();
        c2.val();
        test.equals(callsTwo, 1);
      });
    });

    it("occurs when computation updates", function () {
      root(function () {
        init();
        s1.update(2);
        test.equals(callsOne, 2);
        test.equals(callsTwo, 2);
        test.equals(c2.val(), 2);
      });
    });
  });

  describe("with unending changes", function () {
    it("throws when continually setting a direct dependency", function () {
      root(function () {
        var d = value(1);
        test.throws(function () {
          compute(function () {
            d.val();
            d.update(d.peek() + 1);
          });
        });
      });
    });

    it("throws when continually setting an indirect dependency", function () {
      root(function () {
        var s1 = value(1);
        var c1 = compute(function () {
          return s1.val();
        });
        var c2 = compute(function () {
          return c1.val();
        });
        var c3 = compute(function () {
          return c2.val();
        });

        test.throws(function () {
          compute(function () {
            c3.val();
            s1.update(s1.peek() + 1);
          });
        });
      });
    });
  });

  describe("with circular dependencies", function () {
    it("throws when cycle created by modifying a branch", function () {
      root(function () {
        var s1 = value(1);
        var c1 = compute(function () {
          return c1 ? c1.val() : s1.val();
        }, 0);
        test.throws(function () {
          s1.update(0);
        });
      });
    });
  });

  describe("with converging dependencies", function () {
    it("propagates in topological order", function () {
      root(function () {
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
        var s1 = value(0);
        var c1 = compute(function () {
          calls += "c1";
          return s1.val();
        });
        var c2 = compute(function () {
          calls += "c2";
          return s1.val();
        });
        compute(function () {
          c1.val(), c2.val();
          calls += "c3";
        });
        calls = "";
        s1.update(s1.peek() + 1);
        test.equals(calls, "c1c2c3");
      });
    });

    it("only propagates once with linear convergences", function () {
      root(function () {
        //         d
        //         |
        // +---+---+---+---+
        // v   v   v   v   v
        // f1  f2  f3  f4  f5
        // |   |   |   |   |
        // +---+---+---+---+
        //         v
        //         g
        var s1 = value(0);
        var c1 = compute(function () {
          return s1.val();
        });
        var c2 = compute(function () {
          return s1.val();
        });
        var c3 = compute(function () {
          return s1.val();
        });
        var c4 = compute(function () {
          return s1.val();
        });
        var c5 = compute(function () {
          return s1.val();
        });
        var calls = 0;
        compute(function () {
          calls++;
          return c1.val() + c2.val() + c3.val() + c4.val() + c5.val();
        });
        calls = 0;
        s1.update(s1.peek() + 1);
        test.equals(calls, 1);
      });
    });

    it("only propagates once with exponential convergence", function () {
      root(function () {
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
        var s1 = value(0);
        var c1 = compute(function () {
          return s1.val();
        });
        var c2 = compute(function () {
          return s1.val();
        });
        var c3 = compute(function () {
          return s1.val();
        });
        var c4 = compute(function () {
          return c1.val() + c2.val() + c3.val();
        });
        var c5 = compute(function () {
          return c1.val() + c2.val() + c3.val();
        });
        var c6 = compute(function () {
          return c1.val() + c2.val() + c3.val();
        });

        var calls = 0;
        compute(function () {
          calls++;
          c4.val() + c5.val() + c6.val();
        });

        calls = 0;
        s1.update(s1.peek() + 1);
        test.equals(calls, 1);
      });
    });
  });
});
