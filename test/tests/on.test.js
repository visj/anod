const { Test } = require('boer');
const { data, Flag, fn, on, freeze, root } = require('../../src');

/**
 * @param {Test} t
 */
module.exports = function (t) {

	t.test('on', t => {
		t.test('registers a dependency', t => {
			root(() => {
				let d = data(1);
				let count = 0;
				on(d, () => { count++; });
				t.equal(count, 1);
				d(2);
				t.equal(count, 2);
			});
		});

		t.test('prohibits dynamic dependencies', t => {
			let d = data(1);
			let count = 0;
			on(() => { }, () => { count++; return d(); });

			t.equal(count, 1);
			d(2);
			t.equal(count, 1);
		});

		t.test('allows multiple dependencies', t => {
			root(() => {
				let a = data(1);
				let b = data(2);
				let c = data(3);
				let count = 0;
				on(() => { a(); b(); c(); }, () => { count++; });

				t.equal(count, 1);
				a(4);
				b(5);
				c(6);

				t.equal(count, 4);
			});
		});

		t.test('allows an array of dependencies', t => {
			root(() => {
				let a = data(1);
				let b = data(2);
				let c = data(3);
				let count = 0;
				on([a,b,c], () => count++);
				t.equal(count, 1);
				a(4);
				b(5);
				c(6);
				t.equal(count, 4);
			});
		});

		t.test('modifies its accumulator when reducing', t => {
			root(() => {
				let a = data(1);
				let c = on(a, sum => sum + a(), 0);
				t.equal(c(), 1);
				a(2);
				t.equal(c(), 3);
				a(3);
				a(4);
				t.equal(c(), 10);
			});
		});
		
		t.test('suppresses initial run when run with OnChange', t => {
			root(() => {
				let a = data(1);
				let c = on(a, () => a() * 2, 0, Flag.OnChanges);
				t.equal(c(), 0);
				a(2);
				t.equal(c(), 4);
			});
		});
	});
}
