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
			let c1 = d.filter(x => x !== 2);
			t.equal(c1.get(), [1, 3]);
			let c2 = d.filter(x => false);
			t.equal(c2.get(), []);
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

			t.test('insertRange', t => {
				let d = list([1,2,3,4,5,6]);
				let c1 = d.filter(x => x % 2 === 1 && x !== 3);
				d.insertRange(5, [1,2,3,4]);
				t.equal(c1.get(), [1,5,1]);

				d.insertRange(3, [5,6,7,8,9,10,11]);
				t.equal(c1.get(), [1,5,7,9,11,5,1]);
			});

			t.test('insertRange on empty array', t => {
				let d = list([]);
				let c1 = d.filter(x => x % 2 === 1 && x !== 3);
				d.insertRange(4, [1,2,3,4,5]);
				t.equal(c1.get(), [1,5]);
			});

			t.test('insertRange beyond range of array', t => {
				let d = list([1,2,3,4,5,6]);
				let c1 = d.filter(x => x % 2 === 1 && x !== 3);
				d.insertRange(6, [1,2,3,4,5]);
				t.equal(c1.get(), [1,5,1,5]);
			});

			t.test('move', t => {
				let d = list([1,2,3,4,5,6,7]);
				let c1 = d.filter(x => x % 2 === 1 && x !== 3);
				d.move(5, 2);
				t.equal(c1.get(), [1,5,7]);
			});

			t.test('move from existing to existing', t => {
				let d = list([1,2,3,4,5,6,7]);
				let c1 = d.filter(x => x % 2 === 1 && x !== 3);
				d.move(4,0);
				t.equal(c1.get(), [5,1,7]);
			});

			t.test('move from existing to non existing', t => {
				let d = list([1,2,3,4,5,6,7]);
				let c1 = d.filter(x => x % 2 === 1 && x !== 3);
				d.move(0, 5);
				t.equal(c1.get(), [5,1,7]);
			});

			t.test('move from non existing to existing', t => {
				let d = list([1,2,3,4,5,6,7]);
				let c1 = d.filter(x => x % 2 === 1 && x !== 3);
				d.move(2, 4);
				t.equal(c1.get(), [1,5,7]);
			});

			t.test('move from non existing to non existing', t => {
				let d = list([1,2,3,4,5,6,7]);
				let c1 = d.filter(x => x % 2 === 1 && x !== 3);
				d.move(1, 3);
				t.equal(c1.get(), [1,5,7]);
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

