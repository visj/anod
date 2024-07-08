import { test, root, $compute, compute, value } from './helper/anod.js';

describe("dispose", function () {

	describe("root", function () {
		it("disables updates and sets computation's value to null", function () {
			var c, d, f;
			root(function (teardown) {
				c = 0;
				d = value(0);

				f = compute(function () {
					c++;
					return d.val();
				});

				test.equals(c , 1);
				test.equals(f.val() , 0);

				d.update(1);

				test.equals(c , 2);
				test.equals(f.val() , 1);

				teardown();
				d.update(2);

				test.equals(c , 2);
				test.equals(f.val() , null);
			});
		});

		it("works from the body of its own computation", function () {
			var c, d;
			root(function (teardown) {
				c = 0;
				d = value(0);
				compute(function () {
					c++;
					if (d.val()) {
						teardown();
					}
					d.val();
				});

				test.equals(c , 1);
				d.update(1);
				test.equals(c , 2);
				d.update(2);
				test.equals(c , 2);
			});
		});

		it("works from the body of a subcomputation", function () {
			var c, d;
			root(function (teardown) {
				c = 0;
				d = value(0);
				compute(function () {
					c++;
					d.val();
					compute(function () {
						if (d.val()) {
							teardown();
						}
					});
				});

				test.equals(c , 1);

				d.update(1);
				test.equals(c , 2);
				d.update(2);
				test.equals(c , 2);
			});
		});
	});

	describe("computations", function () {
		it("persists through cycle when manually disposed", function () {
			root(function (teardown) {
				var d1 = value(0);
				var c1 = compute(function () { return d1.val(); });
				var count = 0;
				compute(function () {
					compute(function () {
						if (d1.val() > 0) {
							c1.dispose();
						}
					});
					compute(function () {
						count += c1.val();
					});
				});
				d1.update(d1.peek() + 1);
				d1.update(d1.peek() + 1);
				test.equals(count , 1);
			});
		});

		it("ignores multiple calls to dispose", function () {
			root(function (teardown) {
				var d1 = value(0);
				var c1 = compute(function () { return d1.val(); });
				var count = 0;
				compute(function () {
					compute(function () {
						if (d1.val() > 0) {
							c1.dispose();
							c1.dispose();
							c1.dispose();
						}
					});
					compute(function () {
						count += c1.val();
					});
				});
				d1.update(d1.peek() + 1);
				d1.update(d1.peek() + 1);
				test.equals(count , 1);
			});
		});
	});

	describe("unmount", function () {

		it("does not unmount pending computations with changing dependencies", function () {
			var d1 = value(true);
			var d2 = value(0);
			var d3 = value(0);
			var count = 0;
			compute(function () {
				if (!d1.val()) {
					d1.dispose();
					d2.dispose();
					d3.update(d3.peek() + 1);
				}
			});
			$compute(function () {
				count++;
				if (d1.val()) {
					d2.val();
				} else {
					d3.val();
				}
			});
			count = 0;
			d1.update(false);
			test.equals(count , 2);
		});
	});

});
