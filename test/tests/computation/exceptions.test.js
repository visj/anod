const { Test } = require('boer');
const { data, run, freeze, root } = require('../../..');

/**
 * @param {Test} t
 */
module.exports = function (t) {

	t.test('exceptions', t => {

		t.test('halts updating', t => {
			root(() => {
				let a = data(false);
				let b = data(1);
				let c = run(() => { if (a()) { throw new Error('xxx'); }});
				let d = run(() => b());

				t.throws(() => {
					freeze(() => {
						a(true);
						b(2);
					});
				});
				t.equal(b(), 2);
				t.equal(d(), 1);
			});
		});

		t.test('do not leave stale scheduled updates', t => {
			root(() => {
				let a = data(false);
				let b = data(1);
				let c = run(() => { if (a()) { throw new Error('xxx'); }});
				let d = run(() => b());

				t.throws(() => {
					freeze(() => {
						a(true);
						b(2);
					});
				});

				t.equal(d(), 1);

				a(false);

				t.equal(d(), 1);
			});
		});

		t.test('leave non-excepted parts of dependency tree intact', t => {
			root(() => {
				let a = data(false);
				let b = data(1);
				let c = run(() => { if (a()) { throw new Error('xxx'); }});
				let d = run(() => b());

				t.throws(() => {
					freeze(() => {
						a(true);
						b(2);
					});
				});

				t.equal(b(), 2);
				t.equal(d(), 1);

				b(3);

				t.equal(b(), 3);
				t.equal(d(), 3);
			});
		});
	});
}
