const { Test } = require('boer');
const { array, data, Flag, freeze, fn, on, root, sample } = require('../../src');

/**
 * 
 * @param {Test} t 
 */
module.exports = function (t) {

	t.test('trace', t => {
		t.test('does not trigger downstream computations unless changed', t => {
			root(() => {
				let s1 = data(1);
				let order = '';
				let t1 = fn(() => {
					order += 't1';
					return s1();
				}, null, Flag.Trace);
				let c1 = fn(() => {
					order += 'c1';
					return t1();
				});
				t.equal(order, 't1c1');
				order = '';
				s1(1);
				t.equal(order, 't1');
				order = '';
				s1(2);
				t.equal(order, 't1c1');
			});
		});

		t.test('applies updates to changed dependees as fn', t => {
			root(() => {
				let s1 = data(0);
				let order = '';
				let t1 = fn(() => {
					order += 't1';
					return s1() === 0;
				}, null, Flag.Trace);
				fn(() => {
					order += 'c1';
					return s1();
				});
				fn(() => {
					order += 'c2';
					return t1();
				});

				t.equal(order, 't1c1c2');
				order = '';
				s1(1);
				t.equal(order, 't1c1c2');
				order = '';
				s1(1);
				t.equal(order, 't1c1');
			});
		});

		t.test('updates downstream pending nodes', t => {
			root(() => {
        let s1 = data(0);
        let s2 = data(0);
        let order = '';
        let t1 = fn(() => {
          order += 't1';
          return s1() === 0;
        }, null, Flag.Trace);
        let c1 = fn(() => {
          order += 'c1';
          return s1();
        });
        let c2 = fn(() => {
          order += 'c2';
          t1();
          fn(() => {
            order += 'c2_1';
            return s2();
          });
        });
        order = '';
        s1(1);
        t.equal(order, 't1c1c2c2_1');
      });
		});

		t.test('does not execute pending disposed nodes', t => {
			root(() => {
				let s1 = data(0);
				let order = '';
				let t1 = fn(() => {
					order += 't1';
					return s1();
				}, null, Flag.Trace);
				let c1 = fn(() => {
					t1();
					order += 'c1';
					if (sample(s1) === 0) {
						let c2 = fn(() => {
							order += 'c2';
							s1();
						});
					}
				});
				t.equal(order, 't1c1c2');
				order = '';
				s1(1);
				t.equal(order, 't1c1');
			});
		});
	});
}