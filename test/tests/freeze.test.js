const { Test } = require('boer');
const { data, on, freeze, root } = require('../..');

/**
 * @param {Test} t
 */
module.exports = function (t) {

	t.test('freeze', t => {
		t.test('batches changes until end', t => {
			let d = data(1);
			freeze(() => {
				d(2);
				t.equal(d(), 1);
			});
		});

		t.test('halts propagation within its scope', t => {
			root(() => {
				let d = data(1);
				let f = on(d, () => d());
				freeze(() => {
					d(2);
					t.equal(f(), 1);
				});
				t.equal(f(), 2);
			});
		});
	});
}
