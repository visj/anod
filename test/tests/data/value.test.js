const { Test } = require('boer');
const { run, root, value } = require('../../..');

/**
 * @param {Test} t
 */
module.exports = function (t) {

	t.test('value', t => {

		t.test('takes and returns an initial value', t => {
			t.equal(value(1)(), 1);
		});

		t.test('can be set by passing in a new value', t => {
			let d = value(1);
			d(2);
			t.equal(d(), 2);
		});

		t.test('returns value being set', t => {
			let d = value(1);
			t.equal(d(2), 2);
		});

		t.test('does not propagate if set to equal value', t => {
			root(() => {
				let d = value(1);
				let e = 0;
				let f = run(() => { d(); return ++e; });
				t.equal(f(), 1);
				d(1);
				t.equal(f(), 1);
			});
		});

		t.test('propagates if set to unequal value', t => {
			root(() => {
				let d = value(1);
				let e = 0;
				let f = run(() => { d(); return ++e; });
				t.equal(f(), 1);
				d(1);
				t.equal(f(), 1);
				d(2);
				t.equal(f(), 2);
			});
		});

		t.test('can take an equality predicate', t => {
			root(() => {
				let d = value([1], (a,b) => a[0] === b[0]);
				let e = 0;
				let f = run(() => { d(); return ++e; });
				t.equal(f(), 1);
				d([1]);
				t.equal(f(), 1);
				d([2]);
				t.equal(f(), 2);
			});
		});
	});
}
