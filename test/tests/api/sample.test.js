const { Test } = require('boer');
const { data, Data, run, root, sample } = require('../../..');

/**
 * @param {Test} t
 */
module.exports = function (t) {

	t.test('sample', t => {

		t.test('avoids dependency', t => {
			root(() => {
				let d1 = data(1);
				let d2 = data(2);
				let d3 = data(3);
				let count = 0;
				run(() => {
					count++;
					d1();
					sample(d2);
					d3();
				});
				t.equal(count, 1);
				d2(4);
				t.equal(count, 1);
				d1(5);
				d3(6);
				t.equal(count, 3);
			});
		});
		
		t.test('can sample functions and nodes', t => {
			root(() => {
				let d1 = data(1);
				let d2 = new Data(2);
				let d3 = new Data(3);
				let count = 0;
				run(() => {
					count++;
					sample(d1);
					sample(d2);
					d3.get();
				});
				t.equal(count, 1);
				d1(1);
				t.equal(count, 1);
				d2.set(1);
				t.equal(count, 1);
				d3.set(3);
				t.equal(count, 2);
			});
		});
	});
}
