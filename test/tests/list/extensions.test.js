const { Test } = require('boer');
const { list, run, freeze, Mod } = require('../../..');

/**
 * 
 * @param {Test} t 
 */
module.exports = function (t) {
	t.test('list extensions', t => {

		t.test('insertAt', t => {
			t.test('inserts at index', t => {
				let d = list([1, 2]);
				d.insertAt(1, 3);
				t.equal(d.get(), [1, 3, 2]);
			});

			t.test('works at beginning and end', t => {
				let d = list([1, 2, 3]);
				d.insertAt(0, 0);
				d.insertAt(4, 4);
				t.equal(d.get(), [0, 1, 2, 3, 4]);
			});

			t.test('handles negative indices', t => {
				let d = list([1, 2, 3]);
				d.insertAt(-1, 4);
				t.equal(d.get(), [1, 2, 4, 3]);
			});

			t.test('handles out of bounds indices', t => {
				let d = list([1, 2, 3, 4, 5]);
				d.insertAt(3, 6);
				d.insertAt(8, 7);
				t.equal(d.get(), [1, 2, 3, 6, 4, 5, 7]);
			});

			t.test('converts to push when added to end', t => {
				let d = list([1,2,3]);
				d.insertAt(3, 4);
				t.equal(d.cs.type, Mod.Push);
			});

			t.test('converts to unshift when added to start', t => {
				let d = list([1,2,3]);
				d.insertAt(0, 0);
				t.equal(d.cs.type, Mod.Unshift);
			})
		});

		t.test('insertRange', t => {

			t.test('inserts range into array', t => {
				let d = list([1, 2, 3]);
				d.insertRange(1, [4, 5]);
				t.equal(d.get(), [1, 4, 5, 2, 3]);
			});

			t.test('inserts at start', t => {
				let d = list([1, 2, 3]);
				d.insertRange(0, [4, 5]);
				t.equal(d.get(), [4, 5, 1, 2, 3]);
			});

			t.test('inserts at end', t => {
				let d = list([1, 2, 3]);
				d.insertRange(3, [4, 5]);
				t.equal(d.get(), [1, 2, 3, 4, 5]);
			});

			t.test('handles negative indices', t => {
				let d = list([1, 2, 3]);
				d.insertRange(-2, [4, 5]);
				t.equal(d.get(), [1, 4, 5, 2, 3]);
			});

			t.test('handles out of bounds indices', t => {
				let d = list([1, 2, 3]);
				d.insertRange(1, [4, 5, 6]);
				t.equal(d.get(), [1, 4, 5, 6, 2, 3]);
				d.insertRange(0, [7]);
				d.insertRange(15, [8]);
				t.equal(d.get(), [7, 1, 4, 5, 6, 2, 3, 8]);
			});
		});

		t.test('move', t => {
			t.test('moves between indices inside list', t => {
				let d = list([1, 2, 3, 4, 5]);
				d.move(2, 4);
				t.equal(d.get(), [1, 2, 4, 5, 3]);
			});

			t.test('handles negative indices', t => {
				let d = list([1, 2, 3, 4, 5]);
				d.move(-1, -3);
				t.equal(d.get(), [1, 2, 5, 3, 4]);
			});

			t.test('handles out of bounds indices', t => {
				let d = list([1, 2, 3, 4, 5]);
				d.move(7, -8);
				t.equal(d.get(), [5, 1, 2, 3, 4]);
				d.move(2, 6);
				t.equal(d.get(), [5, 1, 3, 4, 2]);
			});
		});

		t.test('removeAt', t => {

			t.test('removes at index', t => {
				let d = list([1, 2, 3]);
				d.removeAt(1);
				t.equal(d.get(), [1, 3]);
				d.removeAt(0);
				t.equal(d.get(), [3]);
			});

			t.test('removes at start', t => {
				let d = list([1, 2, 3]);
				d.removeAt(0);
				d.removeAt(0);
				t.equal(d.get(), [3]);
			});

			t.test('handles negative indices', t => {
				let d = list([1, 2, 3]);
				d.removeAt(-1);
				t.equal(d.get(), [1, 2]);
				d.removeAt(-5);
				t.equal(d.get(), [2]);
			});

			t.test('handles out of range indices', t => {
				let d = list([1, 2, 3]);
				d.removeAt(4);
				t.equal(d.get(), [1, 2]);
			});

			t.test('converts to pop when removed at end', t => {
				let d = list([1,2,3]);
				d.removeAt(4);
				t.equal(d.cs.type, Mod.Pop);
			});

			t.test('converts to shift when removed at start', t => {
				let d = list([1,2,3]);
				d.removeAt(0);
				t.equal(d.cs.type, Mod.Shift);
			});
		});

		t.test('removeRange', t => {

			t.test('removes range from list', t => {
				let d = list([1, 2, 3, 4, 5, 6]);
				d.removeRange(3, 3);
				t.equal(d.get(), [1, 2, 3]);
			});

			t.test('handles negative indices', t => {
				let d = list([1, 2, 3, 4, 5, 6]);
				d.removeRange(-4, 2);
				t.equal(d.get(), [1, 2, 5, 6]);
				d.removeRange(8, 2);
				t.equal(d.get(), [1, 2, 5, 6]);
			});
			t.test('handles out of range indices', t => {
				let d = list([1, 2, 3, 4, 5, 6]);
				d.removeRange(8, 2);
				t.equal(d.get(), [1, 2, 3, 4, 5, 6]);
			});
		});

		t.test('swap', t => {
			t.test('swaps item forward', t => {
				let d = list([1,2,3,4,5]);
				d.swap(1, 3);
				t.equal(d.get(), [1,4,3,2,5]);
			});

			t.test('swaps item backwards', t => {
				let d = list([1,2,3,4,5]);
				d.swap(3,1);
				t.equal(d.get(), [1,4,3,2,5]);
			});

			t.test('swaps from start', t => {
				let d = list([1,2,3,4,5]);
				d.swap(0, 3);
				t.equal(d.get(), [4,2,3,1,5]);
			});

			t.test('swaps to start', t => {
				let d = list([1,2,3,4,5]);
				d.swap(4,0);
				t.equal(d.get(), [5,2,3,4,1]);
			});
		});

	})
}