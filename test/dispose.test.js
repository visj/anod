var { root, compute, effect, data, dispose } = require('../dist/zorn.cjs');
var assert = require('assert');

describe("root(dispose)", function () {
	it("disables updates and sets computation's value to undefined", function () {
		var c, d, f;
		var owner = root(function () {
			c = 0;
			d = data(0);
			f = compute(function () {
				c++;
				return d.val;
			});

			assert.equal(c, 1);
			assert.equal(f.val, 0);

			d.val = 1;

			assert.equal(c, 2);
			assert.equal(f.val, 1);
		});
		dispose(owner);
		d.val = 2;

		assert.equal(c, 2);
		assert.equal(f.val, void 0);
	});

	it("works from the body of its own computation", function () {
		var c, d;
		var owner = root(function () {
			c = 0;
			d = data(0);
			effect(function () {
				c++;
				if (d.val) {
					dispose(owner);
				}
				d.val;
			});

			assert.equal(c, 1);
		});
		d.val = 1;
		assert.equal(c, 2);
		d.val = 2;
		assert.equal(c, 2);
	});

	it("works from the body of a subcomputation", function () {
		var c, d;
		var owner = root(function () {
			c = 0;
			d = data(0);
			effect(function () {
				c++;
				d.val;
				effect(function () {
					if (d.val) {
						dispose(owner);
					}
				});
			});

			assert.equal(c, 1);
		});
		d.val = 1;
		assert.equal(c, 2);
		d.val = 2;
		assert.equal(c, 2);
	});
});
