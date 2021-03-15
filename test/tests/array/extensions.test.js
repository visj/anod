const { Test } = require('boer');
const { array, run, freeze } = require('../../..');

/**
 * 
 * @param {Test} t 
 */
module.exports = function (t) {
	t.test('array extension methods', t => {

		t.test('insertAt', t => {
			t.test('inserts at index', t => {
				let d = array([1, 2]);
				d.insertAt(1, 3);
				t.equal(d.get(), [1, 3, 2]);
			});

			t.test('works at beginning and end', t => {
				let d = array([1, 2, 3]);
				d.insertAt(0, 0);
				d.insertAt(4, 4);
				t.equal(d.get(), [0, 1, 2, 3, 4]);
			});

			t.test('handles negative and out of bounds indices', t => {
				let d = array([1, 2, 3]);
				d.insertAt(-1, 4);
				t.equal(d.get(), [1, 2, 4, 3]);
				d.insertAt(8, 5);
				t.equal(d.get(), [1, 2, 4, 3, 5]);
			});
		});

		t.test('insertRange', t => {

			t.test('inserts range into array handling out of bounds indices', t => {
				let d = array([1, 2, 3]);
				d.insertRange(1, [4, 5, 6]);
				t.equal(d.get(), [1, 4, 5, 6, 2, 3]);
				d.insertRange(0, [7]);
				d.insertRange(15, [8]);
				t.equal(d.get(), [7, 1, 4, 5, 6, 2, 3, 8]);
			});
		});

		t.test('removeAt', t => {

			t.test('removes at index', t => {
				let d = array([1, 2, 3]);
				d.removeAt(1);
				t.equal(d.get(), [1, 3]);
				d.removeAt(0);
				t.equal(d.get(), [3]);
			});

			t.test('handles negative and out of bounds indices', t => {
				let d = array([1, 2, 3]);
				d.removeAt(-1);
				t.equal(d.get(), [1, 3]);
				d.removeAt(-5);
				t.equal(d.get(), [3]);
			});
		});

		t.test('removeRange', t => {

			t.test('removes range from array', t => {
				let d = array([1, 2, 3, 4, 5, 6]);
				d.removeRange(3, 3);
				t.equal(d.get(), [1, 2, 3]);
			});

			t.test('handles negative and out of bounds indices', t => {
				let d = array([1, 2, 3, 4, 5, 6]);
				d.removeRange(-4, 2);
				t.equal(d.get(), [1, 2, 5, 6]);
				d.removeRange(8, 2);
				t.equal(d.get(), [1, 2, 5, 6]);
			});
		})

	})
}