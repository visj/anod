const { Test } = require('boer');
const { array, run, freeze } = require('../../..');

/**
 * 
 * @param {Test} t 
 */
module.exports = function (t) {
	t.test('array builtins', t => {

		t.test('pop', t => {
			t.test('removes item from end', t => {
				let d = array([1, 2, 3]);
				d.pop();
				t.equal(d.get(), [1, 2]);
			});

			t.test('handles empty arrays', t => {
				let d = array([1]);
				t.not.throws(() => {
					d.pop();
					d.pop();
				});
				t.equal(d.get(), []);
			});

			t.test('works inside a freeze', t => {
				let d = array([1, 2, 3]);
				freeze(() => {
					d.pop(); d.pop(); d.pop(); d.pop();
				});
				t.equal(d.get(), []);
			});
		});

		t.test('push', t => {
			t.test('adds item to end of array', t => {
				let d = array([1, 2, 3]);
				d.push(4);
				t.equal(d.get(), [1, 2, 3, 4]);
			});

			t.test('adds to empty array', t => {
				let d = array([]);
				d.push(3);
				t.equal(d.get(), [3]);
			});

			t.test('works inside freeze', t => {
				let d = array([]);
				freeze(() => {
					d.push(1);
					d.push(2);
					d.push(3);
				});
				t.equal(d.get(), [1, 2, 3]);
			});

		});

		t.test('shift', t => {
			t.test('removes item in front', t => {
				let d = array([1, 2]);
				d.shift();
				t.equal(d.get(), [2]);
			});

			t.test('works on empty arrays', t => {
				let d = array([]);
				t.not.throws(() => {
					d.shift();
					d.shift();
				});
				t.equal(d.get(), []);
			});

			t.test('works inside freeze', t => {
				let d = array([1, 2, 3]);
				t.not.throws(() => {
					freeze(() => { d.shift(); d.shift(); });
				});
				t.equal(d.get(), [3]);
			});
		});

		t.test('unshift', t => {
			t.test('adds item to front', t => {
				let d = array([1]);
				d.unshift(2);
				t.equal(d.get(), [2, 1]);
			});
	
			t.test('handles empty arrays', t => {
				let d = array([]);
				d.unshift(2);
				d.unshift(1);
				t.equal(d.get(), [1, 2]);
			});
	
			t.test('works inside freeze', t => {
				let d = array([]);
				t.not.throws(() => {
					freeze(() => { d.unshift(2); d.unshift(4); });
				});
			});
		});
	});
}