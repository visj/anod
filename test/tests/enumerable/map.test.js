const { Test } = require('boer');
const { list, cleanup, root, Flag, tie, } = require('../../..');
/**
 * 
 * @param {Test} t 
 */
module.exports = function (t) {

	t.test('map', t => {
		t.test('calls and returns list of callback results', t => {
			let d1 = list([1, 2, 3]);
			let c1 = d1.map(val => val + 1);
			t.equal(c1.get(), [2, 3, 4]);
		});

		t.test('truncates non-empty list', t => {
			let d1 = list([1, 2, 3]);
			let c1 = d1.map(val => val + 1);
			d1.set([]);
			t.equal(c1.get(), []);
		});

		t.test('re-initiates empty list', t => {
			let d1 = list([1, 2, 3]);
			let c1 = d1.map(val => val + 1);
			d1.set([]);
			d1.set([4, 5, 6]);
			t.equal(c1.get(), [5, 6, 7]);
		});

		t.test('handles common prefix', t => {
			let d1 = list([1, 2, 3, 4, 5]);
			let c1 = d1.map(val => val + 1);
			d1.set([1, 2, 6, 7]);
			t.equal(c1.get(), [2, 3, 7, 8]);
		});

		t.test('handles common suffix', t => {
			let d1 = list([1, 2, 3, 4, 5]);
			let c1 = d1.map(val => val + 1);
			d1.set([6, 7, 4, 5]);
			t.equal(c1.get(), [7, 8, 5, 6]);
		})
	});
}