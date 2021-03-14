const { Test } = require('boer');
const { cleanup, data, run, root } = require('../../..');

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

				outer = run(() => {
					outerTrigger();
					root(() => {
						run(() => {
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
				let c = run(() => s());
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
				let c1 = run(() => s());
				s(2);
				let c2 = run(() => s());
				s(3);
				t.equal(c2(), 3);;
			})
		});

		t.test('can extend existing root computation nodes', t => {
			let count = 0;
			let node = root(() => {
				cleanup(() => { count++; });
			});
			root(node, () => {
				cleanup(() => { count += 2; });
			});
			node.dispose();
			t.equal(count, 3);
		});

		t.test('owned nodes in extended node are properly disposed', t => {
			let d1 = data(1);
			let count = 0;
			let disposed = false;
			let node = root(() => {
				cleanup(() => { disposed = true; });
			});
			root(node, () => {
				run(() => {
					d1();
					count++;
				});
			});
			d1(2);
			t.equal(count, 2);
			t.equal(disposed, false);
			node.dispose();
			d1(3);
			t.equal(count, 2);
			t.equal(disposed, true);
		})
	});
}
