const { Test } = require('boer');
const { list, run, freeze, Mod } = require('../../..');

/**
 * 
 * @param {Test} t 
 */
module.exports = function (t) {
	t.test('list', t => {
		t.test('returns initial value', t => {
			let d = list([1]);
			t.equal(d.get(), [1]);
		});

		t.test('can be set by passing in new value', t => {
			let d = list([1]);
			d.set([2]);
			t.equal(d.get(), [2]);
		});

		t.test('does not throw if set to same value in freeze', t => {
			let d = list([1]);
			let next = [2];
			t.not.throws(() => {
				freeze(() => { d.set(next); d.set(next); })
			});
		});

		t.test('throws if set to two different values in a freeze', t => {
			let d = list([1]);
			t.throws(() => {
				freeze(() => { d.set([2]); d.set([2]); });
			});
		});

		t.test('throws if mutated and set inside a freeze', t => {
			let d = list([1]);
			t.throws(() => {
				freeze(() => { d.set([2]); d.push(3); });
			});
		});

		t.test('reactivity', t => {
			t.test('can be listened to by nodes', t => {
				let d = list([1, 2, 3]);
				let c1 = run(() => d.get());
				t.equal(c1(), [1, 2, 3]);
			});

			t.test('updates node on change', t => {
				let d = list([1, 2, 3]);
				let c1 = run(() => d.get());
				d.set([4, 5, 6]);
				t.equal(c1(), [4, 5, 6]);
			});
		});

		t.test('mutation', t => {
			t.test('creates single mutations on each update', t => {
				let d = list([1,2,3]);
				t.equal(d.cs, null);
				d.push(4);
				t.equal(typeof d.cs, 'object');
				t.equal(d.cs.type, Mod.Push);
			});

			t.test('creates array of mutations when set inside freeze', t => {
				let d = list([1,2,3]);
				freeze(() => { d.push(4); d.removeAt(1); });
				t.assert(Array.isArray(d.cs));
				t.equal(d.cs.length, 2);
			});

			t.test('sets changeset to null when setting new value', t => {
				let d = list([1,2,3]);
				d.shift();
				t.not.equal(d.cs, null);
				d.set([1,2,3]);
				t.equal(d.cs, null);
			});
		});
	});
}
