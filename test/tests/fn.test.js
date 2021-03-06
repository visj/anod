const { Test } = require('boer');
const { data, fn, root } = require('../../src');

/**
 * @param {Test} t
 */
module.exports = function (t) {

	t.test('fn', t => {
		t.test('creation', t => {
			t.test('throws if no function passed in', t => {
				root(() => { t.throws(() => { fn(); }); });
			});

			t.test('throws if arg is not a function', t => {
				root(() => { t.throws(() => { fn(1); }) });
			});

			t.test('generates a function', t => {
				root(() => {
					let f = fn(() => 1);
					t.equal(typeof f, 'function');
				});
			});

			t.test('returns initial value of wrapped function', t => {
				root(() => {
					let f = fn(() => 1);
					t.equal(f(), 1);
				});
			});
		});

		t.test('evaluation', t => {
			t.test('occurs once initially', t => {
				root(() => {
					let count = 0;
					fn(() => { count++; });
					t.equal(count, 1);
				});
			});

			t.test('does not re-occur when read', t => {
				root(() => {
					let count = 0;
					let f = fn(() => { count++; });
					f(); f(); f();
					t.equal(count, 1);
				});
			});
		});

		t.test('with a dependency on data signal', t => {
			t.test('updates when data is set', t => {
				root(() => {
					let d = data(1);
					let count = 0;
					fn(() => { count++; return d(); });

					count = 0;
					d();
					t.equal(count, 0);
				});
			});

			t.test('updates return value', t => {
				root(() => {
					let d = data(1);
					let count = 0;
					let f = fn(() => { count++; return d(); });

					count = 0;
					d(2);
					t.equal(f(), 2);
					t.equal(count, 1);
				});
			});
		});

		t.test('with changing dependencies', t => {
			var i, j, e, count, f;

			function init() {
				i = data(true);
				j = data(1);
				e = data(2);
				count = 0;
				f = fn(() => { count++; return i() ? j() : e(); });
				count = 0;
			}

			t.test('updates on active dependencies', t => {
				root(() => {
					init();
					j(5);
					t.equal(count, 1);
					t.equal(f(), 5);
				});
			});

			t.test('does not update on inactive dependencies', t => {
				root(() => {
					init();
					e(5);
					t.equal(count, 0);
					t.equal(f(), 1);
				});
			});

			t.test('deactives obsolete dependencies', t => {
				root(() => {
					init();
					i(false);
					count = 0;
					j(5);
					t.equal(count, 0);
				});
			});

			t.test('activates new dependencies', t => {
				root(() => {
					init();
					i(false);
					count = 0;
					e(5);
					t.equal(count, 1);
				});
			});
		});

		t.test('ensures that new dependencies are updated before dependee', t => {
			root(() => {
				let order = '';
				let a = data(0);
				let b = fn(() => { order += 'b'; return a() + 1; });
				let c = fn(() => { order += 'c'; return b() || d(); });
				let d = fn(() => { order += 'd'; return a() + 10; });

				t.equal(order, 'bcd');
				order = '';
				a(-1);
				t.equal(order, 'bcd');
				t.equal(c(), 9);
				order = '';
				a(0);
				t.equal(order, 'bcd');
				t.equal(c(), 1);
			});
		});

		t.test('from a function with no return value', t => {
			t.test('reads as undefined', t => {
				root(() => {
					let f = fn(() => { });
					t.equal(f(), undefined);
				});
			});
		});

		t.test('with a seed', t => {
			t.test('reduces seed value', t => {
				root(() => {
					let a = data(5);
					let f = fn(v => v + a(), 5);
					t.equal(f(), 10);
					a(6);
					t.equal(f(), 16);
				});
			});
		});

		t.test('with a dependency on a computation', t => {
			var d, fcount, f, gcount, g;

			function init() {
				d = data(1);
				fcount = 0;
				f = fn(() => { fcount++; return d(); });
				gcount = 0;
				g = fn(() => { gcount++; return f(); });
			}

			t.test('does not cause re-evaluation', t => {
				root(() => {
					init();
					t.equal(fcount, 1);
				});
			});

			t.test('does not occur from a read', t => {
				root(() => {
					init();
					f();
					t.equal(gcount, 1);
				});
			});

			t.test('does not occur from a read of the watcher', t => {
				root(() => {
					init();
					g();
					t.equal(gcount, 1);
				});
			});

			t.test('occurs when computation updates', t => {
				root(() => {
					init();
					d(2);
					t.equal(fcount, 2);
					t.equal(gcount, 2);
					t.equal(g(), 2);
				});
			});
		});

		t.test('with unending changes', t => {
			t.test('throws when continually setting a direct dependency', t => {
				root(() => {
					let d = data(1);
					t.throws(() => {
						fn(() => { d(); d(2); });
					});
				});
			});

			t.test('throws when continually setting an indirect dependency', t => {
				root(() => {
					let d = data(1);
					let f1 = fn(() => d());
					let f2 = fn(() => f1());
					let f3 = fn(() => f2());
					t.throws(() => {
						fn(() => { f3(); d(2); });
					});
				});
			});
		});

		t.test('with circular dependencies', t => {
			t.test('throws when cycle created by modifying a branch', t => {
				root(() => {
					var d = data(1);
					var f = fn(() => f ? f() : d());
					t.throws(() => { d(0); });
				});
			});
		});

		t.test('with converging dependencies', t => {
			t.test('propagates in topological order', t => {
				root(() => {
					let seq = '';
					let a1 = data(true);
					let b1 = fn(() => { a1(); seq += 'b1'; });
					let b2 = fn(() => { a1(); seq += 'b2'; });
					let c1 = fn(() => { b1(), b2(); seq += 'c1'; });

					seq = '';
					a1(true);
					t.equal(seq, 'b1b2c1');
				});
			});

			t.test('only propagates once with linear convergences', t => {
				root(() => {
					let d = data(0);
					let f1 = fn(() => d());
					let f2 = fn(() => d());
					let f3 = fn(() => d());
					let f4 = fn(() => d());
					let f5 = fn(() => d());
					let gcount = 0;
					fn(() => { gcount++; return f1() + f2() + f3() + f4() + f5(); });
					gcount = 0;
					d(0);
					t.equal(gcount, 1);
				});
			});

			t.test('only propagates once with exponential convergence', t => {
				root(() => {
					let d = data(0);
					let f1 = fn(() => d());
					let f2 = fn(() => d());
					let f3 = fn(() => d());
					let g1 = fn(() => f1() + f2() + f3());
					let g2 = fn(() => f1() + f2() + f3());
					let g3 = fn(() => f1() + f2() + f3());

					let hcount = 0;
					let h = fn(() => { hcount++; return g1() + g2() + g3(); });
					hcount = 0;
					d(0);
					t.equal(hcount, 1);
				});
			});
		});
	});
}
