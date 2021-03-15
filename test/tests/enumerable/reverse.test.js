const { Test } = require('boer');
const { array, cleanup, Flag, tie, } = require('../../..');
/**
 * 
 * @param {Test} t 
 */
module.exports = function(t) {
	t.test('reverse reverses array', t => {
		let d = array([1,2,3]);
		let d1 = d.reverse();
		let d2 = d1.reverse();
		t.equal(d1.get(), [3,2,1]);
		t.equal(d2.get(), [1,2,3]);
	});

	t.test('mutations', t => {


		t.test('move', t => {
			let d = array([1,2,3,4,5]);
			let c1 = d.reverse();
			d.move(3,1);
			t.equal(c1.get(), [5,3,2,4,1]);
		})
	});
}