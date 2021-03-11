const { Test } = require('boer');
const { array, run, freeze } = require('../..');

/**
 * 
 * @param {Test} t 
 */
module.exports = function(t) {
	t.test('array', t => {
		t.test('returns initial value', t => {
			let d = array([1]);
			t.equal(d.get(), [1]);
		});

		t.test('can be set by passing in new value', t => {
			let d = array([1]);
			d.set([2]);
			t.equal(d.get(), [2]);
		});

		t.test('does not throw if set to same value in freeze', t => {
			let d = array([1]);
			let next = [2];
			t.not.throws(() => {
				freeze(() => { d.set(next); d.set(next); })
			});
		});

		t.test('throws if set to two different values in a freeze', t => {
			let d = array([1]);
			t.throws(() => {
				freeze(() => { d.set([2]); d.set([2]); });
			});
		});

		t.test('methods', t => {
			t.test('pop removes item fromm end', t => {
				let d = array([1,2,3]);
				d.pop();
				t.equal(d.get(), [1,2]);
			});

			t.test('pop handles empty arrays', t => {
				let d = array([1]);
				t.not.throws(() => {
					d.pop(); 
					d.pop();
				});
				t.equal(d.get(), []);
			});

			t.test('pop works inside a freeze', t => {
				let d = array([1,2,3]);
				freeze(() => {
					d.pop(); d.pop(); d.pop(); d.pop();
				});
				t.equal(d.get(), []);
			})

			t.test('push adds item to end of array', t => {
				let d = array([1,2,3]);
				d.push(4);
				t.equal(d.get(), [1,2,3,4]);
			});

			t.test('push adds to empty array', t => {
				let d = array([]);
				d.push(3);
				t.equal(d.get(), [3]);
			});

			t.test('push works inside freeze', t => {
				let d = array([]);
				freeze(() => {
					d.push(1);
					d.push(2);
					d.push(3);
				});
				t.equal(d.get(), [1,2,3]);
			});

			t.test('shift removes item in front', t => {
				let d = array([1,2]);
				d.shift();
				t.equal(d.get(), [2]);
			});

			t.test('shift works on empty arrays', t => {
				let d = array([]);
				t.not.throws(() => {
					d.shift();
					d.shift();
				});
				t.equal(d.get(), []);
			});

			t.test('shift works inside freeze', t => {
				let d = array([1,2,3]);
				t.not.throws(() => {
					freeze(() => { d.shift(); d.shift(); });
				});
				t.equal(d.get(), [3]);
			});

			t.test('unshift adds item to front', t => {
				let d = array([1]);
				d.unshift(2);
				t.equal(d.get(), [2,1]);
			});

			t.test('unshift handles empty arrays', t => {
				let d = array([]);
				d.unshift(2);
				d.unshift(1);
				t.equal(d.get(), [1,2]);
			});

			t.test('insertAt inserts at index', t => {
				let d = array([1,2]);
				d.insertAt(1, 3);
				t.equal(d.get(), [1,3,2]);
			});

			t.test('insertAt works at beginning and end', t => {
				let d = array([1,2,3]);
				d.insertAt(0, 0);
				d.insertAt(4, 4);
				t.equal(d.get(), [0,1,2,3,4]);
			});

			t.test('insertAt handles negative and out of bounds indices', t => {
				let d = array([1,2,3]);
				d.insertAt(-1, 4);
				t.equal(d.get(), [1,2,4,3]);
				d.insertAt(8, 5);
				t.equal(d.get(), [1,2,4,3,5]);
			});

			t.test('insertRange inserts range into array handling out of bounds indices', t => {
				let d = array([1,2,3]);
				d.insertRange(1, [4,5,6]);
				t.equal(d.get(), [1,4,5,6,2,3]);
				d.insertRange(0, [7]);
				d.insertRange(15, [8]);
				t.equal(d.get(), [7,1,4,5,6,2,3,8]);
			});

			t.test('removeAt removes at index', t => {
				let d = array([1,2,3]);
				d.removeAt(1);
				t.equal(d.get(), [1,3]);
				d.removeAt(0);
				t.equal(d.get(), [3]);
			});
			
			t.test('removeAt handles negative and out of bounds indices', t => {
				let d = array([1,2,3]);
				d.removeAt(-1);
				t.equal(d.get(), [1,3]);
				d.removeAt(-5);
				t.equal(d.get(), [3]);
			});

			t.test('removeRange removes range from array', t => {
				let d = array([1,2,3,4,5,6]);
				d.removeRange(3, 3);
				t.equal(d.get(), [1,2,3]);
			});

			t.test('removeRange handles negative and out of bounds indices', t => {
				let d = array([1,2,3,4,5,6]);
				d.removeRange(-4, 2);
				t.equal(d.get(), [1,2,5,6]);
				d.removeRange(8, 2);
				t.equal(d.get(), [1,2,5,6]);
			});
		});

		t.test('reactivity', t => {
			t.test('can be listened to by nodes', t => {
				let d = array([1,2,3]);
				let c1 = run(() => d.get());
				t.equal(c1(), [1,2,3]);
			});

			t.test('updates node on change', t => {
				let d = array([1,2,3]);
				let c1 = run(() => d.get());
				let c2 = run(() => d.get());
				d.set([4,5,6]);
				t.equal(c1(), [4,5,6]);
				t.equal(c2(), [4,5,6]);
			});
		});
	});
}
