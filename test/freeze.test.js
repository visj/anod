var { root, compute, data, value, freeze, on, sample, effect } = require ('./helper/zorn');
var assert = require('assert');

describe("freeze", function () {
	it("batches changes until end", function () {
		var d = data(1);
			
		freeze(function () {
			d.val = 2;
			assert.equal(d.val, 1);
		});
		
		assert.equal(d.val, 2);
	});
	
	it("halts propagation within its scope", function () {
        root(function () {
			var d = data(1);
			var f = compute(function() { 
				return d.val;
			});
				
			freeze(function () {
				d.val = 2;
				assert.equal(f.val, 1);
			});
			
			assert.equal(f.val, 2);
		});
	});
});