const { Test } = require('boer');
const { data, run, root } = require('../../..');

/**
 * @param {Test} t
 */
module.exports = function (t) {

	t.test('with sub computations', t => {

		t.test('does not register a dependency on the subcomputation', t => {
			root(() => {
				let d = data(1);
				let count = 0;
				let gcount = 0;
				let f = run(() => {
					count++;
					let g = run(() => {
						gcount++;
						return d();
					});
				});
				count = 0;
				gcount = 0;
				d(2);
				t.equal(gcount, 1);
				t.equal(count, 0);
			});
		});

		t.test('with child', t => {
			var d, e, fcount, gcount, g, h;

			function init() {
				d = data(1);
				e = data(2);
				fcount = 0;
				gcount = 0;
				f = run(() => {
					fcount++;
					d();
					g = run(() => {
						gcount++;
						return e();
					});
				});
				h = g;
				h();
			}

			t.test('creates child on init', t => {
				root(() => {
					init();
					t.equal(typeof h, 'function');
					t.equal(h(), 2);
				});
			});

			t.test('does not depend on child dependencies', t => {
				root(() => {
					init();
					e(3);
					t.equal(fcount, 1);
					t.equal(gcount, 2);
				});
			});

			t.test('disposes old child when updated', t => {
				root(() => {
					init();
					d(2);
					e(3);
					t.equal(h(), 2);
				});
			});

			t.test('disposes child when it is disposed', t => {
				const r1 = root(init);
				r1.dispose();
				e(3);
				t.equal(g(), 2);
			});
		});

		t.test('which disposes sub being updated', t => {
			t.test('propagates successfully', t => {
				root(() => {
					let a = data(1);
					let b = run(() => {
						let c = run(() => a());
						a();
						return { c: c };
					});
					let d = run(() => b().c());
					t.equal(d(), 1);
					a(2);
					t.equal(d(), 2);
					a(3);
					t.equal(d(), 3);
				});
			});
		});

		t.test('which disposes a sub with a dependee with a sub', t => {
			t.test('propagates successfully', t => {
				root(() => {
					let a = data(1);
					var c;
					let b = run(() => {
						c = run(() => a());
						a();
						return { c };
					});
					let d = run(() => {
						c();
						let e = run(() => a());
						return { e };
					});

					t.equal(d().e(), 1);
					a(2);
					t.equal(d().e(), 2);
					a(3);
					t.equal(d().e(), 3);
				});
			});
		});
	});
}
