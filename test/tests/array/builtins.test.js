const { Test } = require('boer');
const { array, run, freeze } = require('../../..');

/**
 * 
 * @param {Test} t 
 */
module.exports = function(t) {
	t.test('array builtins', t => {
		t.test('pop removes item from end', t => {
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
		
		t.test('unshift works inside freeze', t => {
			let d = array([]);
			t.not.throws(() => {
				freeze(() => { d.unshift(2); d.unshift(4); });
			});
		});
	});
}