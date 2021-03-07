const { Test } = require('boer');
const { data, fn, root } = require('../..');

/**
 * @param {Test} t
 */
module.exports = function (t) {

	t.test('dispose', t => {
		t.test('disables updates and sets computations value to undefined', t => {
			root(function(dispose) {
				let c = 0;
				let d = data(0);
				let f = fn(() => { c++; return d(); });

				t.equal(c, 1);
				t.equal(f(), 0);

				d(1);

				t.equal(c, 2);
				t.equal(f(), 1);

				dispose();

				d(2);

				t.equal(c, 2);
				t.equal(f(), 1);
			});
		});

		t.test('works from the body of its own computation', t => {
			root(function(dispose) {
				let c = 0;
				let d = data(0);
				fn(() => { 
					c++;
					if (d()) {
						dispose();
					}
					d();
				});
				t.equal(c, 1);
				d(1);
				t.equal(c,2);
				d(2);
				t.equal(c,2);
			});
		});

		t.test('works from the body of a subcomputation', t => {
			root(function(dispose) {
				let c = 0;
				let d = data(0);
				fn(() => {
					c++;
					d();
					fn(() => {
						if (d()) {
							dispose();
						}
					});
				});
				t.equal(c, 1);
				d(1);
				t.equal(c, 2);
				d(2);
				t.equal(c,2);
			});
		});
	});
}
