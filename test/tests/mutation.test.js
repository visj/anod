const { Test } = require('boer');
const { data, on, fn, freeze, root } = require('../../src');

/**
 * @param {Test} t
 */
module.exports = function (t) {

	t.test('mutations', t => {

		t.test('freeze data while executing computation', t => {
			root(() => {
				let a = data(false);
				let b = data(0);

				let cb;
				let c = fn(() => {
					if (a()) {
						b(1); 
						cb = b(); 
						a(false);
					}
				});

				b(0);
				a(true);

				t.equal(b(), 1);
				t.equal(cb, 0);
			});
		});

		t.test('freeze data while propagating', t => {
			root(() => {
				let seq = '';
				let a = data(false);
				let b = data(0);
				let db;
				let c = fn(() => {
					if (a()) {
						seq += 'c';
						b(1);
						a(false);
					}
				});
				let d = fn(() => {
					if (a()) {
						seq += 'd';
						db = b();
					}
				});
				b(0);
				seq = '';
				a(true);

				t.equal(seq, 'cd');
				t.equal(b(), 1);
				t.equal(db, 0);
			});
		});

		t.test('continue running until changes stop', t => {
			root(() => {
				let seq = '';
				let a = data(0);

				fn(() => {
					seq += a();
					if (a() < 10) {
						a(a() + 1);
					}
				});
				t.equal(seq, '012345678910');
				t.equal(a(), 10);
			});
		});

		t.test('propagate changes toplogically', t => {
			root(() => {
				let seq = '';
				let a1 = data(0);
				let c1 = data(0);
				let b1 = fn(() => { a1(); });
				let b2 = fn(() => { c1(a1()); });
				let b3 = fn(() => { a1(); });
				let d1 = fn(() => { b1(); seq += 'c4(' + c1() + ')'; });
				let d2 = fn(() => { b3(); seq += 'c5(' + c1() + ')'; });

				seq = '';
				a1(1);

				t.equal(seq, 'c4(0)c5(0)c4(1)c5(1)');
			});
		});
	});
}
