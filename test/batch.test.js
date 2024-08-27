import { test, root, compute, value, batch } from './helper/anod.js';

describe("batch", function () {
	it("batches changes until end", function () {
		var s1 = value(1);
			
		batch(function () {
			s1.update(2);
			test.equals(s1.val() , 1);
		});
		
		test.equals(s1.val() , 2);
	});
	
	it("halts propagation within its scope", function () {
        root(function () {
			var s1 = value(1);
			var c1 = compute(function() { 
				return s1.val();
			});
				
			batch(function () {
				s1.update(2);
				test.equals(c1.val() , 1);
			});
			
			test.equals(c1.val() , 2);
		});
	});
});