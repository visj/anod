const { Test } = require('boer');
const { data, fn, root, sample } = require('../..');

/**
 * @param {Test} t
 */
module.exports = function (t) {

	t.test('sample', t => {

		t.test('avoids dependency', t => {
			root(() => {
				let a = data(1);
				let b = data(2);
				let c = data(3);
				let d = 0;
				fn(() => {
					d++;
					a();
					sample(b);
					c();
				});
				t.equal(d, 1);
				b(4);
				t.equal(d, 1);
				a(5);
				c(6);
				t.equal(d, 3);
			});
		});
	});
}
