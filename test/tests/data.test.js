const { Test } = require('boer');
const { data, freeze } = require('../../src');

/**
 * @param {Test} t
 */
module.exports = function (t) {
	t.test('data', t => {
		t.test('returns initial value', t => {
			let d = data(1);
			t.equal(d(), 1);
		});

		t.test('can be set by passing in new value', t => {
			let d = data(1);
			d(2);
			t.equal(d(), 2);
		});

		t.test('set returns value being set', t => {
			let d = data(1);
			t.equal(d(2), 2);
		});

		t.test('does not throw if set to the same value twice in a freeze', t => {
			let d = data(1);
			t.not.throws(() => {
				freeze(() => { d(2); d(2); });
			});
			t.equal(d(), 2);
		});

		t.test('throws if set to two different values in a freeze', t => {
			let d = data(1);
			freeze(() => {
				d(2);
				t.throws(() => { d(3); });
			});
		});
	});
}
