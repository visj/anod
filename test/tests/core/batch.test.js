import { test, assert, Anod } from "../../helper/index.js";

/**
 *
 * @param {Anod} anod
 */
export function run(anod) {
	var { value, batch, compute } = anod;
	test("batch", function () {
		test("batches changes until end", function () {
			var s1 = value(1);
			batch(function () {
				s1.set(2);
				assert(s1.val(), 1);
			});
			assert(s1.val(), 2);
		});

		test("stops propagation within tests scope", function () {
			var s1 = value(1);
			var c1 = compute(function () {
				return s1.val();
			});
			batch(function () {
				s1.set(2);
				assert(c1.val(), 1);
			});
			assert(c1.val(), 2);
		});
	});
}
