const { Test } = require('boer');
const { list, run, freeze } = require('../../..');

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

			t.test('handles negative and out of bounds indices', t => {
				let d = list([1, 2, 3]);
				d.insertAt(-1, 4);
				t.equal(d.get(), [1, 2, 4, 3]);
				d.insertAt(8, 5);
				t.equal(d.get(), [1, 2, 4, 3, 5]);
			});
		});

		t.test('insertRange', t => {

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
				let d = list([1,2,3,4,5]);
				d.move(2, 4);
				t.equal(d.get(), [1,2,4,5,3]);
			});

			t.test('handles negative indices', t => {
				let d = list([1,2,3,4,5]);
				d.move(-1, -3);
				t.equal(d.get(), [1,2,5,3,4]);
			});

			t.test('handles out of bounds indices', t => {
				let d = list([1,2,3,4,5]);
				d.move(7, -8);
				t.equal(d.get(), [5,1,2,3,4]);
				d.move(2, 6);
				t.equal(d.get(), [5,1,3,4,2]);

			})
		});

		t.test('removeAt', t => {

			t.test('removes at index', t => {
				let d = list([1, 2, 3]);
				d.removeAt(1);
				t.equal(d.get(), [1, 3]);
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

		})

	})
}