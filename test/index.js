const fs = require('fs');
const path = require('path');
const { Test } = require('boer');

const t = new Test();

const testdir = path.join(__dirname, 'tests');
const dirs = fs.readdirSync(testdir);

const filter = [];
for (let i = 2; i < process.argv.length; i++) {
	filter.push(process.argv[i].replace('--', ''));
}

for (let i = 0; i < dirs.length; i++) {
	const dir = dirs[i];
	let subdirs = fs.readdirSync(path.join(testdir, dir));
	console.log(subdirs);
	for (let j = 0; j < subdirs.length; j++) {
		let file = subdirs[j];
		if (filter.length) {
			if (filter.some(f => file.includes(f))) {
				require(path.join(testdir, dir, file))(t);
			}
		} else {
			require(path.join(testdir, dir, file))(t);
		}
	}
	
}

t.run();
