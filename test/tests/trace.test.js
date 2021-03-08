const { Test } = require('boer');
const { data, Flag, fn, root, sample } = require('../..');

/**
 * 
 * @param {Test} t 
 */
module.exports = function (t) {

	t.test('trace', t => {
		t.test('does not trigger downstream computations unless changed', t => {
			root(() => {
				let d1 = data(1);
				let order = '';
				let t1 = fn(() => {
					order += 't1';
					return d1();
				}, null, Flag.Trace);
				let c1 = fn(() => {
					order += 'c1';
					return t1();
				});
				t.equal(order, 't1c1');
				order = '';
				d1(1);
				t.equal(order, 't1');
				order = '';
				d1(2);
				t.equal(order, 't1c1');
			});
		});

		t.test('updates downstream pending nodes', t => {
			root(() => {
        let d1 = data(0);
        let d2 = data(0);
        let order = '';
        let t1 = fn(() => {
          order += 't1';
          return d1() === 0;
        }, null, Flag.Trace);
        let c1 = fn(() => {
          order += 'c1';
          return d1();
        });
        let c2 = fn(() => {
          order += 'c2';
          t1();
          fn(() => {
            order += 'c2_1';
            return d2();
          });
        });
        order = '';
        d1(1);
        t.equal(order, 't1c1c2c2_1');
      });
		});

		t.test('does not execute pending disposed nodes', t => {
			root(() => {
				let d1 = data(0);
				let order = '';
				let t1 = fn(() => {
					order += 't1';
					return d1();
				}, null, Flag.Trace);
				let c1 = fn(() => {
					t1();
					order += 'c1';
					if (sample(d1) === 0) {
						let c2 = fn(() => {
							order += 'c2';
							d1();
						});
					}
				});
				t.equal(order, 't1c1c2');
				order = '';
				d1(1);
				t.equal(order, 't1c1');
			});
		});

		t.test('updates if dependent on both tracing and non-tracing node', t => {
			root(() => {
				let d1 = data(0);
				let count = 0;
				let t1 = fn(() => {
					return d1();
				}, null, Flag.Trace);
				let c1 = fn(() => {
					return d1();
				});
				let c2 = fn(() => {
					count++;
					return t1() + c1();
				});
				count = 0;
				d1(1);
				t.equal(count, 1);
				t.equal(c2(), 2);
			});
		});
	});
}