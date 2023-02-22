import { test, root, compute, value, batch } from './helper/zorn.js';

describe("batch", function () {
	it("batches changes until end", function () {
		var d = value(1);
			
		batch(function () {
			d.set(2);
			test.equals(d.val , 1);
		});
		
		test.equals(d.val , 2);
	});
	
	it("halts propagation within its scope", function () {
        root(function () {
			var d = value(1);
			var f = compute(function() { 
				return d.val;
			});
				
			batch(function () {
				d.set(2);
				test.equals(f.val , 1);
			});
			
			test.equals(f.val , 2);
		});
	});
});