import assert from 'assert';
import { root, compute, value, batch } from './helper/zorn.js';

describe("batch", function () {
	it("batches changes until end", function () {
		var d = value(1);
			
		batch(function () {
			d.val = 2;
			assert.equal(d.val, 1);
		});
		
		assert.equal(d.val, 2);
	});
	
	it("halts propagation within its scope", function () {
        root(function () {
			var d = value(1);
			var f = compute(function() { 
				return d.val;
			});
				
			batch(function () {
				d.val = 2;
				assert.equal(f.val, 1);
			});
			
			assert.equal(f.val, 2);
		});
	});
});