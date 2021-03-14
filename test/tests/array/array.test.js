const { Test } = require('boer');
const { array, run, freeze } = require('../../..');

/**
 * 
 * @param {Test} t 
 */
module.exports = function (t) {
	t.test('array', t => {
		t.test('returns initial value', t => {
			let d = array([1]);
			t.equal(d.get(), [1]);
		});

		t.test('can be set by passing in new value', t => {
			let d = array([1]);
			d.set([2]);
			t.equal(d.get(), [2]);
		});

		t.test('does not throw if set to same value in freeze', t => {
			let d = array([1]);
			let next = [2];
			t.not.throws(() => {
				freeze(() => { d.set(next); d.set(next); })
			});
		});

		t.test('throws if set to two different values in a freeze', t => {
			let d = array([1]);
			t.throws(() => {
				freeze(() => { d.set([2]); d.set([2]); });
			});
		});

		t.test('throws if mutated and set inside a freeze', t => {
			let d = array([1]);
			t.throws(() => {
				freeze(() => { d.set([2]); d.push(3); });
			});
		});

		t.test('reactivity', t => {
			t.test('can be listened to by nodes', t => {
				let d = array([1, 2, 3]);
				let c1 = run(() => d.get());
				t.equal(c1(), [1, 2, 3]);
			});

			t.test('updates node on change', t => {
				let d = array([1, 2, 3]);
				let c1 = run(() => d.get());
				d.set([4, 5, 6]);
				t.equal(c1(), [4, 5, 6]);
			});
		});
	});
}
