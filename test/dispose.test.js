import assert from 'assert';
import { root, effect, compute, value, dispose } from './helper/zorn.js';

describe("root(dispose)", function () {
	it("disables updates and sets computation's value to undefined", function () {
		var c, d, f;
		root(function (teardown) {
			c = 0;
			d = value(0);

			f = compute(function () {
				c++;
				return d.val;
			});

			assert.equal(c, 1);
			assert.equal(f.val, 0);

			d.val = 1;

			assert.equal(c, 2);
			assert.equal(f.val, 1);

			teardown();
			d.val = 2;

			assert.equal(c, 2);
			assert.equal(f.val, void 0);
		});
	});

	it("works from the body of its own computation", function () {
		var c, d;
		root(function (teardown) {
			c = 0;
			d = value(0);
			effect(function () {
				c++;
				if (d.val) {
					teardown();
				}
				d.val;
			});

			assert.equal(c, 1);
			d.val = 1;
			assert.equal(c, 2);
			d.val = 2;
			assert.equal(c, 2);
		});
	});

	it("works from the body of a subcomputation", function () {
		var c, d;
		root(function (teardown) {
			c = 0;
			d = value(0);
			effect(function () {
				c++;
				d.val;
				effect(function () {
					if (d.val) {
						teardown();
					}
				});
			});

			assert.equal(c, 1);

			d.val = 1;
			assert.equal(c, 2);
			d.val = 2;
			assert.equal(c, 2);
		});
	});

	it("disposes values created by computations", function () {
		root(function () {
			var d1 = value(0);
			var d2 = value(0);
			var d3;
			var count = 0;

			effect(function () {
				d2.val;
				if (d3 === void 0) {
					d3 = value(0);
				}
			});
			effect(function () { d3.val; });
			effect(function () { d3.val; });
			effect(function () { d3.val; });
			effect(function () {
				d1.val;
				effect(function () {
					d3.val;
					count++;
				});
			});
			// update d2 to trigger d3 disposal
			d2.val++;
			assert.equal(count, 1);
			// d3 is now disposed so inner computation should not trigger
			d3.val++;
			assert.equal(count, 1);
		});
	});
});
