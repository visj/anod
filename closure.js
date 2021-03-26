import { data, fn, root, list } from './dist/anod.mjs';


root(function() {
	var ds = data(5);
	var ls = list([1,2,3]);
	var fs = ls.filter(x => x < 3);
	fn(function() {
		console.log('run');
		var f = fs.get();
		f.forEach(v => console.log(v));
	});

	ls.push(4);
	ls.insertRange(3, [4,5,6]);
	ls.insertRange(0, [0,-1,-2])
});