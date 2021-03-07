const { Test } = require('boer');
const { array, cleanup, data, fn, Flag, on, freeze, root, value } = require('../../src');

/*
	forEach
	map
	sort
*/

/**
 * 
 * @param {Test} t 
 */
module.exports = function(t) {
	t.test('enumerable', t => {
		t.test('every checks if every matches condition', t => {
			let d = array([1,2,3]);
			let c1 = d.every(x => x > 0);
			let c2 = d.every(x => x !== 2);
			t.equal(c1(), true);
			t.equal(c2(), false);
		});

		t.test('every does not trigger unless condition changes', t => {
			let d = array([1,2,3]);
			let c1 = d.every(x => x !== 4);
			let count = 0;
			let c2 = on(c1, () => { count++; }, void 0, Flag.Wait);
			d.unshift(0);
			d.push(3);
			d.push(4);
			d.pop();
			t.equal(count, 2);
		});

		t.test('every does not recompute unless necessary', t => {
			let d = array([1,2,3]);
			let count = 0;
			let c1 = d.every(x => {
				count++;
				return x !== 4;
			});
			count = 0;
			freeze(() => { d.pop(); d.pop(); });
			t.equal(count, 0);
			d.insertRange(1, [2,3]);
			t.equal(count, 2);
			d.push(4);
			t.equal(count, 3);
			t.equal(c1(), false);
		});

		t.test('filter filters based on callback', t => {
			let d = array([1,2,3]);
			let d1 = d.filter(x => x !== 2);
			t.equal(d1.val(), [1,3]);
			let d2 = d.filter(x => false);
			t.equal(d2.val(), []);
		});

		t.test('find returns item or undefined when not found', t => {
			let d = array([1,2,3]);
			let c1 = d.find(x => x === 1);
			let c2 = d.find(x => x === 4);
			t.equal(c1(), 1);
			t.equal(c2(), undefined);
		});

		t.test('findIndex returns index or -1 when not found', t => {
			let d = array([1,2,3]);
			let c1 = d.findIndex(x => x === 2);
			let c2 = d.findIndex(x => x === 4);
			t.equal(c1(), 1);
			t.equal(c2(), -1);
		});

		t.test('includes returns boolean whether item is found', t => {
			let d = array([1,2,3]);
			let c1 = d.includes(3);
			let c2 = d.includes(1);
			let c3 = d.includes(4);
			t.equal(c1(), true);
			t.equal(c2(), true);
			t.equal(c3(), false);
		});

		t.test('indexOf returns index of item or -1 if not found', t => {
			let d = array([1,2,3]);
			let c1 = d.indexOf(1);
			let c2 = d.indexOf(4);
			t.equal(c1(), 0);
			t.equal(c2(), -1);
		});

		t.test('join returns string joined by optional separator', t => {
			let d = array([1,2,3]);
			let c1 = d.join('');
			let c2 = d.join(',');
			let c3 = d.join();
			t.equal(c1(), '123');
			t.equal(c2(), '1,2,3');
			t.equal(c3(), '1,2,3');
		});

		t.test('lastIndexOf returns last index of item or -1 if not found', t => {
			let d = array([1,2,3,1,2,3]);
			let c1 = d.lastIndexOf(1);
			let c2 = d.lastIndexOf(2);
			let c3 = d.lastIndexOf(4);
			t.equal(c1(), 3);
			t.equal(c2(), 4);
			t.equal(c3(), -1);
		});

		t.test('reduce reduces initialValue to a single value', t => {
			let d = array([1,2,3]);
			let c1 = d.reduce((seed, x) => { seed.unshift(x); return seed; }, []);
			t.equal(c1(), [3,2,1]);
		});

		t.test('reduce does not corrupt initial value', t => {
			let d = array([1,2,3]);
			let c1 = d.reduce((seed, x) => { seed[x] = x; return seed; }, {});
			let c2 = d.reduce((seed, x) => { seed[x] = -x; return seed; }, {});
			t.equal(c1(), { 1: 1, 2: 2, 3: 3 });
			t.equal(c2(), { 1: -1, 2: -2, 3: -3 });
			t.not.equal(c1(), c2());
			d.pop();
			d.push(4);
			t.equal(c1(), { 1: 1, 2: 2, 4: 4 });
			t.equal(c2(), { 1: -1, 2: -2, 4: -4 });
			console.log(c1());
		});

		t.test('reduceRight reduces initialValue from back to front', t => {
			let d = array([1,2,3]);
			let c1 = d.reduceRight((seed, x) => { seed.push(x); return seed; }, []);
			t.equal(c1(), [3,2,1]);
		});

		t.test('reverse reverses array', t => {
			let d = array([1,2,3]);
			let d1 = d.reverse();
			let d2 = d1.reverse();
			t.equal(d1.val(), [3,2,1]);
			t.equal(d2.val(), [1,2,3]);
		});
		
		t.test('slice returns a copy of array', t => {
			let d = array([1,2,3]);
			let d1 = d.slice();
			t.equal(d1.val(), [1,2,3]);
		});

		t.test('slice accepts positive and negative indices', t => {
			let d = array([1,2,3,4,5,6]);
			let d1 = d.slice(0, 3);
			let d2 = d.slice(0, -3);
			let d3 = d.slice(-2);
			t.equal(d1.val(), [1,2,3]);
			t.equal(d2.val(), [1,2,3]);
			t.equal(d3.val(), [5,6]);
		});

		t.test('some returns if any matches callback', t => {
			let d = array([1,2,3]);
			let c1 = d.some(x => x === 3);
			let c2 = d.some(x => x === 4);
			t.equal(c1(), true);
			t.equal(c2(), false);
		});
	});
}