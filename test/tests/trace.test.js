const { Test } = require('boer');
const { array, data, Flag, freeze, fn, on } = require('../../src');

/**
 * 
 * @param {Test} t 
 */
module.exports = function(t) {

	t.test('trace', t => {
		var d = data(1);
		var f0 = fn(() => {
			console.log('f0');
			return d() === 1 ? null : f2();
		}, null, Flag.Trace);
		var f1 = fn(() => {
			console.log('f1');
			return d();
		}, null, Flag.Trace);
		var f2 = fn(() => {
			console.log('f2');
			return f1();
		});
		fn(() => {
			d();
			console.log('f0: ' + f0());
			console.log('f1: ' + f1());
			console.log('f2: ' + f2());
		});
		d(1);
		
		d(2);
	});
}