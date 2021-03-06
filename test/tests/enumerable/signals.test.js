const { Test } = require('boer');
const { list, cleanup, freeze, Flag, tie, } = require('../../..');
/**
 * 
 * @param {Test} t 
 */
module.exports = function (t) {

	t.test('every', t => {
		t.test('checks if every matches condition', t => {
			let d = list([1, 2, 3]);
			let c1 = d.every(x => x > 0);
			let c2 = d.every(x => x !== 2);
			
			t.equal(c1(), true);
			t.equal(c2(), false);
		});

		t.test('does not trigger unless condition changes', t => {
			let d = list([1, 2, 3]);
			let c1 = d.every(x => x !== 4);
			let count = 0;
			tie(c1, () => { count++; }, void 0, Flag.Wait);
			d.unshift(0);
			d.push(3);
			d.push(4);
			d.pop();
			
			t.equal(count, 2);
		});

		t.test('mutations', t => {

			t.test('insertAt', t => {
				let d = list([1,2,3]);
				let count = 0;
				let c1 = d.every(x => {
					count++;
					return x !== 4;
				});
				d.insertAt(0, 1);
				
				t.equal(count, 4);
				t.assert(c1());
				
				d.insertAt(4, 4);
				
				t.equal(count, 5);
				t.not.assert(c1());
				
				d.insertAt(3, 4);
				
				t.equal(count, 5);
				t.not.assert(c1());
			});

			t.test('insertAt beyond range', t => {
				let d = list([1,2,3]);
				let c1 = d.every(x =>  x !== 4);
				
				t.not.throws(() => d.insertAt(-1, 4));
				t.not.assert(c1());
				t.not.throws(() => d.insertAt(8, 4));
				t.not.assert(c1());
				
				d.set([]);
				t.not.throws(() => d.insertAt(2, 4));
				t.not.assert(c1());
			});

			t.test('insertRange', t => {
				let d = list([1,2,3]);
				let count = 0;
				let c1 = d.every(x => {
					count++;
					return x !== 4;
				});
				d.insertRange(0, [1,2,3]);
				t.equal(count, 6);
				t.assert(c1());
				d.insertRange(6, [6,7,8]);
				d.set([1]);
				t.equal(count, 10);
				t.assert(c1());
				d.insertRange(1, [5,4,1,1,1]);
				t.not.assert(c1());
			});

			t.test('move', t => {
				let d = list([1,2,3]);
				let count = 0;
				let c1 = d.every(x => {
					count++;
					return x !== 4;
				});
				d.move(2, 0);
				
				t.assert(c1());
			});
		});
	});

	t.test('find', t => {
		t.test('returns item or undefined when not found', t => {
			let d = list([1, 2, 3]);
			let c1 = d.find(x => x === 1);
			let c2 = d.find(x => x === 4);
			t.equal(c1(), 1);
			t.equal(c2(), undefined);
		});

		t.test('mutations', t => {
			t.test('handles insertion mutation correctly', t => {
				let d = list([1, 2, 3]);
				let count = 0;
				let c1 = d.find(x => {
					count++;
					return x === 4;
				});
				d.push(5);
				t.equal(count, 4);
				t.equal(c1(), void 0);
				d.push(4);
				t.equal(count, 5);
				t.equal(c1(), 4);
			});

			t.test('handles deletion mutation correctly', t => {
				let d = list([1, 2, 3]);
				let count = 0;
				let c1 = d.find(x => {
					count++;
					return x === 4;
				});
				d.shift();
				t.equal(count, 3);
				d.pop();
				t.equal(count, 3);
				d.set([4,1,2,3,4]);
				count = 0;
				d.shift();
				t.equal(count, 4);
			});
		});
	});

	t.test('findIndex', t => {
		t.test('returns index or -1 when not found', t => {
			let d = list([1, 2, 3]);
			let c1 = d.findIndex(x => x === 2);
			let c2 = d.findIndex(x => x === 4);
			t.equal(c1(), 1);
			t.equal(c2(), -1);
		});
	});

	t.test('includes', t => {
		t.test('returns boolean whether item is found', t => {
			let d = list([1, 2, 3]);
			let c1 = d.includes(3);
			let c2 = d.includes(1);
			let c3 = d.includes(4);
			t.equal(c1(), true);
			t.equal(c2(), true);
			t.equal(c3(), false);
		});
	});

	t.test('indexOf', t => {
		t.test('returns index of item or -1 if not found', t => {
			let d = list([1, 2, 3]);
			let c1 = d.indexOf(1);
			let c2 = d.indexOf(4);
			t.equal(c1(), 0);
			t.equal(c2(), -1);
		});
	});

	t.test('join', t => {
		t.test('returns string joined by optional separator', t => {
			let d = list([1, 2, 3]);
			let c1 = d.join('');
			let c2 = d.join(',');
			let c3 = d.join();
			t.equal(c1(), '123');
			t.equal(c2(), '1,2,3');
			t.equal(c3(), '1,2,3');
		});
	});

	t.test('lastIndexOf', t => {
		t.test('returns last index of item or -1 if not found', t => {
			let d = list([1, 2, 3, 1, 2, 3]);
			let c1 = d.lastIndexOf(1);
			let c2 = d.lastIndexOf(2);
			let c3 = d.lastIndexOf(4);
			t.equal(c1(), 3);
			t.equal(c2(), 4);
			t.equal(c3(), -1);
		});
	});

	t.test('reduce', t => {
		t.test('reduces initialValue to a single value', t => {
			let d = list([1, 2, 3]);
			let c1 = d.reduce((seed, x) => { seed.unshift(x); return seed; }, []);
			t.equal(c1(), [3, 2, 1]);
		});

		t.test('does not corrupt initial value', t => {
			let d = list([1, 2, 3]);
			let c1 = d.reduce((seed, x) => { seed[x] = x; return seed; }, {});
			let c2 = d.reduce((seed, x) => { seed[x] = -x; return seed; }, {});
			t.equal(c1(), { 1: 1, 2: 2, 3: 3 });
			t.equal(c2(), { 1: -1, 2: -2, 3: -3 });
			t.not.equal(c1(), c2());
			d.pop();
			d.push(4);
			t.equal(c1(), { 1: 1, 2: 2, 4: 4 });
			t.equal(c2(), { 1: -1, 2: -2, 4: -4 });
		});
	});

	t.test('reduceRight', t => {
		t.test('reduces initialValue from end to tart', t => {
			let d = list([1, 2, 3]);
			let c1 = d.reduceRight((seed, x) => { seed.push(x); return seed; }, []);
			t.equal(c1(), [3, 2, 1]);
		});
	});

	t.test('slice', t => {

		t.test('returns a copy of list', t => {
			let d = list([1, 2, 3]);
			let d1 = d.slice();
			t.equal(d1.get(), [1, 2, 3]);
		});

		t.test('accepts positive and negative indices', t => {
			let d = list([1, 2, 3, 4, 5, 6]);
			let d1 = d.slice(0, 3);
			let d2 = d.slice(0, -3);
			let d3 = d.slice(-2);
			t.equal(d1.get(), [1, 2, 3]);
			t.equal(d2.get(), [1, 2, 3]);
			t.equal(d3.get(), [5, 6]);
		});
	});

	t.test('some', t => {
		t.test('returns if any matches callback', t => {
			let d = list([1, 2, 3]);
			let c1 = d.some(x => x === 3);
			let c2 = d.some(x => x === 4);
			t.equal(c1(), true);
			t.equal(c2(), false);
		});
	});
}