import { test, root, compute, value, batch } from './helper/zorn.js';

describe("batch", function () {
	it("batches changes until end", function () {
		var d = value(1);
			
		batch(function () {
			d.set(2);
			test.ok(d.val === 1);
		});
		
		test.ok(d.val === 2);
	});
	
	it("halts propagation within its scope", function () {
        root(function () {
			var d = value(1);
			var f = compute(function() { 
				return d.val;
			});
				
			batch(function () {
				d.set(2);
				test.ok(f.val === 1);
			});
			
			test.ok(f.val === 2);
		});
	});
});