const { Test } = require('boer');
const { data, fn, root, sample } = require('../..');

/**
 * @param {Test} t
 */
module.exports = function (t) {

	t.test('sample', t => {

		t.test('avoids dependency', t => {
			root(() => {
				let d1 = data(1);
				let d2 = data(2);
				let d3 = data(3);
				let d = 0;
				fn(() => {
					d++;
					d1();
					sample(d2);
					d3();
				});
				t.equal(d, 1);
				d2(4);
				t.equal(d, 1);
				d1(5);
				d3(6);
				t.equal(d, 3);
			});
		});
	});
}
