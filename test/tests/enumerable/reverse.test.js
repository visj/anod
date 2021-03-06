const {Test} = require('boer');
const {list, cleanup, freeze, Flag, tie, } = require('../../..');
/**
 * 
 * @param {Test} t 
 */
module.exports = function (t) {

	t.test('reverse', t => {
		t.test('reverse reverses list', t => {
			let d = list([1, 2, 3]);
			let c1 = d.reverse();
			let c2 = c1.reverse();
			t.equal(c1.get(), [3, 2, 1]);
			t.equal(c2.get(), [1, 2, 3]);
		});

		t.test('works on empty arrays', t => {
			let d = list([1, 2, 3]);
			let c1 = d.reverse();
			d.set([]);
			t.equal(c1.get(), []);
			d.insertRange(3, [1, 2, 3]);
			t.equal(c1.get(), [3, 2, 1]);
		});

		t.test('mutations', t => {

			t.test('insertAt', t => {
				let d = list([1, 2, 3, 4, 5]);
				let c1 = d.reverse();
				d.insertAt(3, 6);

				t.equal(c1.get(), [5, 4, 6, 3, 2, 1]);

				d.insertAt(8, 7);
				t.equal(c1.get(), [7, 5, 4, 6, 3, 2, 1]);
			});

			t.test('insertRange', t => {
				let d = list([1, 2, 3, 4, 5]);
				let c1 = d.reverse();

				d.insertRange(3, [6, 7, 8]);
				t.equal(c1.get(), [5, 4, 8, 7, 6, 3, 2, 1]);
			});

			t.test('insertRange at index zero', t => {
				let d = list([1, 2, 3]);
				let c1 = d.reverse();
				d.insertRange(0, [10, 11, 12]);
				t.equal(c1.get(), [3, 2, 1, 12, 11, 10]);
			});

			t.test('insertRange into empty array', t => {
				let d = list([1, 2, 3]);
				let c1 = d.reverse();
				d.set([]);
				d.insertRange(0, [1, 2, 3]);
				t.equal(c1.get(), [3, 2, 1]);
			});

			t.test('insertRange inserts beyond end of array', t => {
				let d = list([1, 2, 3]);
				let c1 = d.reverse();
				d.insertRange(5, [4, 5, 6]);
				t.equal(c1.get(), [6, 5, 4, 3, 2, 1]);
			});

			t.test('move', t => {
				let d = list([1, 2, 3, 4, 5]);
				let c1 = d.reverse();
				d.move(3, 1);
				t.equal(c1.get(), [5, 3, 2, 4, 1]);
			});

			t.test('push', t => {
				let d = list([1, 2, 3]);
				let c1 = d.reverse();
				d.push(4);
				t.equal(c1.get(), [4, 3, 2, 1]);
			});

			t.test('push to empty array', t => {
				let d = list([1, 2, 3]);
				let c1 = d.reverse();
				d.set([]);
				d.push(1);
				d.push(2);
				t.equal(c1.get(), [2, 1]);
			});

			t.test('pop', t => {
				let d = list([1, 2, 3]);
				let c1 = d.reverse();
				d.pop();
				t.equal(c1.get(), [2, 1]);
			});

			t.test('pop all elements returns empty array', t => {
				let d = list([1, 2]);
				let c1 = d.reverse();
				freeze(() => {d.pop(); d.pop();});
				t.equal(c1.get(), []);
			});

			t.test('pop empty array does nothing', t => {
				let d = list([1, 2]);
				let c1 = d.reverse();
				d.set([]);
				d.pop();
				t.equal(c1.get(), []);
			});

			t.test('removeAt', t => {
				let d = list([1, 2, 3, 4]);
				let c1 = d.reverse();
				d.removeAt(2);
				t.equal(c1.get(), [4, 2, 1]);
			});

			t.test('removeAt end', t => {
				let d = list([1, 2, 3, 4]);
				let c1 = d.reverse();
				d.removeAt(4);
				t.equal(c1.get(), [3, 2, 1]);
			});

			t.test('removeAt start', t => {
				let d = list([1, 2, 3, 4]);
				let c1 = d.reverse();
				d.removeAt(0);
				t.equal(c1.get(), [4, 3, 2]);
			});

			t.test('removeRange', t => {
				let d = list([1, 2, 3, 4]);
				let c1 = d.reverse();
				d.removeRange(1, 2);
				t.equal(c1.get(), [4, 1]);
			});

			t.test('removeRange at start', t => {
				let d = list([1, 2, 3, 4]);
				let c1 = d.reverse();
				d.removeRange(0, 2);
				t.equal(c1.get(), [4, 3]);
			});

			t.test('removeRange at end', t => {
				let d = list([1, 2, 3, 4]);
				let c1 = d.reverse();
				d.removeRange(3, 1);
				t.equal(c1.get(), [3, 2, 1]);
			});

			t.test('replace', t => {
				let d = list([1, 2, 3, 4]);
				let c1 = d.reverse();
				d.replace(2, 5);
				t.equal(c1.get(), [4, 5, 2, 1]);
			});

			t.test('replace at end', t => {
				let d = list([1, 2, 3]);
				let c1 = d.reverse();
				d.replace(2, 4);
				t.equal(c1.get(), [4, 2, 1]);
			});

			t.test('replace at start', t => {
				let d = list([1, 2, 3]);
				let c1 = d.reverse();
				d.replace(0, 0);
				t.equal(c1.get(), [3, 2, 0]);
			});

			t.test('swap forward', t => {
				let d = list([1, 2, 3, 4, 5]);
				let c1 = d.reverse();
				d.swap(1, 3); // 1,4,3,2,5
				t.equal(c1.get(), [5, 2, 3, 4, 1]);
			});

			t.test('swap backwards', t => {
				let d = list([1, 2, 3, 4, 5]);
				let c1 = d.reverse();
				d.swap(3, 2);
				t.equal(c1.get(), [5, 3, 4, 2, 1]);
			});

			t.test('swap from end to mid', t => {
				let d = list([1, 2, 3, 4, 5]);
				let c1 = d.reverse();
				d.swap(4, 2);
				t.equal(c1.get(), [3, 4, 5, 2, 1]);
			});

			t.test('swap from start to mid', t => {
				let d = list([1, 2, 3, 4, 5]);
				let c1 = d.reverse();
				d.swap(0, 2);
				t.equal(c1.get(), [5, 4, 1, 2, 3]);
			});

			t.test('unshift', t => {
				let d = list([1, 2, 3]);
				let c1 = d.reverse();
				d.unshift(0);
				t.equal(c1.get(), [3, 2, 1, 0]);
			});
		});

		t.test('Array compatibility', t => {
			let ar = [];
			let ft1 = function () {
				return ar.slice().reverse();
			}
			let ft2 = function () {
				return ft1().reverse();
			}

			let as = list([]);
			let es1 = as.reverse();
			let es2 = es1.reverse();

			function check(t) {
				t.equal(es1.get(), ft1());
				t.equal(es2.get(), ft2());
			}

			t.test('sets value', t => {
				ar = [1, 2, 3];
				as.set([1, 2, 3]);
				check(t);
			});

			t.test('inserts at index', t => {
				ar.splice(1, 0, 4);
				as.insertAt(1, 4);
				check(t);
			});

			// t.test('inserts range', t => {
			// 	ar.splice(2, 0, 5, 6, 7);
			// 	as.insertRange(2, [5, 6, 7]);
			// 	check(t);
			// });

		});
	});
}
