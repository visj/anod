import { data, fn, root, list } from './dist/anod.mjs';


root(function() {
	var ds = data(5);
	var ls = list([1,2,3]);

	fn(function() {
		ds();
		ls.get();
	});
});