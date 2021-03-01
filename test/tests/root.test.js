const { Test } = require('boer');
const { data, fn, on, freeze, root } = require('../../src');

/**
 * @param {Test} t
 */
module.exports = function (t) {

	t.test('root', t => {

		t.test('allows subcomputations to escape their parents', t => {
			root(() => {
				let outerTrigger = data(null);
				let innerTrigger = data(null);
				let outer, innerRuns = 0;

				outer = fn(() => {
					outerTrigger();
					root(() => {
						fn(() => {
							innerTrigger();
							innerRuns++;
						})
					});
				});

				t.equal(innerRuns, 1);

				outerTrigger(null);
				outerTrigger(null);

				t.equal(innerRuns, 3);
				innerRuns = 0;
				innerTrigger(null);
				t.equal(innerRuns, 3);
			});
		});

		t.test('does not freeze updates when used at top level', t => {
			root(() => {
				let s = data(1);
				let c = fn(() => s());
				t.equal(c(), 1);
				s(2);

				t.equal(c(), 2);

				s(3);
				t.equal(c(), 3);
			});
		});

		t.test('persists through entire scope when used at top level', t => {
			root(() => {
				let s = data(1);
				let c1 = fn(() => s());
				s(2);
				let c2 = fn(() => s());
				s(3);
				t.equal(c2(), 3);;
			})
		});
	});
}
