const { Test } = require('boer');
const { list, cleanup, root, Flag, tie, } = require('../../..');
/**
 * 
 * @param {Test} t 
 */
module.exports = function (t) {
	t.test('filter', t => {
		t.test('filters based on callback', t => {
			let d = list([1, 2, 3]);
			let d1 = d.filter(x => x !== 2);
			t.equal(d1.get(), [1, 3]);
			let d2 = d.filter(x => false);
			t.equal(d2.get(), []);
		});

		t.test('mutations', t => {
			t.test('insertAt', t => {
				let d = list([1,2,3,4]);
				let count = 0;
				let c1 = d.filter(x => {
					count++;
					return x % 2 === 0;
				});
				d.insertAt(2, 6);
				d.insertAt(2, 5);
				d.insertAt(4, 8);
				d.insertAt(0, 10);
				t.equal(c1.get(), [10, 2, 6, 8, 4]);
				t.equal(count, 8);
			});
			
			t.test('insertAt with missing indices', t => {
				let d = list([1,2,3,4,5,6]);
				let c1 = d.filter(x => x < 5 && x !== 2 && x !== 3);
				d.insertAt(1, 0);
				t.equal(c1.get(), [1,0,4]);
			});

			t.test('push', t => {
				let d = list([1,2,3,4,5,6]);
				let c1 = d.filter(x => x % 2 === 1 && x !== 3);
				d.push(3);
				t.equal(c1.get(), [1,5]);
				d.push(7);
				t.equal(c1.get(), [1,5,7]);
			});

			t.test('pop', t => {
				let d = list([1,2,3,4,5,6]);
				let c1 = d.filter(x => x % 2 === 1 && x !== 3);
				d.pop();
				t.equal(c1.get(), [1,5]);
				d.pop();
				t.equal(c1.get(), [1]);
			});
		});
	});
}

