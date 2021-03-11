const { Test } = require('boer');
const { data, Flag, tie, root } = require('../..');

/**
 * @param {Test} t
 */
module.exports = function (t) {

	t.test('on', t => {
		t.test('registers a dependency', t => {
			root(() => {
				let d = data(1);
				let count = 0;
				tie(d, () => { count++; });
				t.equal(count, 1);
				d(2);
				t.equal(count, 2);
			});
		});

		t.test('prohibits dynamic dependencies', t => {
			let d = data(1);
			let count = 0;
			tie(() => { }, () => { count++; return d(); });

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
				tie(() => { a(); b(); c(); }, () => { count++; });

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
				tie([a,b,c], () => count++);
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
				let c = tie(a, sum => sum + a(), 0);
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
				let c = tie(a, () => a() * 2, 0, Flag.Wait);
				t.equal(c(), 0);
				a(2);
				t.equal(c(), 4);
			});
		});
	});
}
