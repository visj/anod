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
}