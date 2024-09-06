import { test, assert, throws } from "../helper/index.js";

export function run(anod) {
	test("batch", function () {
		test("batches changes until end", function () {
			var s1 = anod.value(1);
			anod.batch(function () {
				s1.update(2);
				assert(s1.val(), 1);
			});
			assert(s1.val(), 2);
		});
		
		test("halts propagation wtesthin tests scope", function () {
			anod.root(function () {
				var s1 = anod.value(1);
				var c1 = anod.compute(function() { 
					return s1.val();
				});
				anod.batch(function () {
					s1.update(2);
					assert(c1.val() , 1);
				});
				assert(c1.val() , 2);
			});
		});
	});
}