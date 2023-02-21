import { test, root, batch, effect, $effect, compute, value, dispose } from './helper/zorn.js';

describe("dispose", function () {

	describe("root", function () {
		it("disables updates and sets computation's value to undefined", function () {
			var c, d, f;
			root(function (teardown) {
				c = 0;
				d = value(0);

				f = compute(function () {
					c++;
					return d.val;
				});

				test.ok(c === 1);
				test.ok(f.val === 0);

				d.set(1);

				test.ok(c === 2);
				test.ok(f.val === 1);

				teardown();
				d.set(2);

				test.ok(c === 2);
				test.ok(f.val === void 0);
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

				test.ok(c === 1);
				d.set(1);
				test.ok(c === 2);
				d.set(2);
				test.ok(c === 2);
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

				test.ok(c === 1);

				d.set(1);
				test.ok(c === 2);
				d.set(2);
				test.ok(c === 2);
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
				d2.set(d2.peek + 1);
				test.ok(count === 1);
				// d3 is now disposed so inner computation should not trigger
				d3.set(d3.peek + 1);
				test.ok(count === 1);
			});
		});
	});

	describe("data", function () {

	});

	describe("computations", function () {
		it("persists through cycle when manually disposed", function () {
			root(function (teardown) {
				var d1 = value(0);
				var c1 = compute(function () { return d1.val; });
				var count = 0;
				effect(function () {
					effect(function () {
						if (d1.val > 0) {
							dispose(c1);
						}
					});
					effect(function () {
						count += c1.val;
					});
				});
				d1.set(d1.peek + 1);
				d1.set(d1.peek + 1);
				test.ok(count === 1);
			});
		});

		it("ignores multiple calls to dispose", function () {
			root(function (teardown) {
				var d1 = value(0);
				var c1 = compute(function () { return d1.val; });
				var count = 0;
				effect(function () {
					effect(function () {
						if (d1.val > 0) {
							dispose(c1);
							dispose(c1);
							dispose(c1);
						}
					});
					effect(function () {
						count += c1.val;
					});
				});
				d1.set(d1.peek + 1);
				d1.set(d1.peek + 1);
				test.ok(count === 1);
			});
		});
	});

	describe("unmount", function () {

		it("does not unmount pending computations with changing dependencies", function () {
			var d1 = value(true);
			var d2 = value(0);
			var d3 = value(0);
			var count = 0;
			effect(function () {
				if (!d1.val) {
					dispose(d1);
					dispose(d2);
					d3.set(d3.peek + 1);
				}
			});
			$effect(function () {
				count++;
				if (d1.val) {
					d2.val;
				} else {
					d3.val;
				}
			});
			count = 0;
			d1.set(false);
			test.ok(count === 2);
		});
	});

});
