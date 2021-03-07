const fs = require('fs');
const path = require('path');
const { Test } = require('boer');

const t = new Test();

const files = fs.readdirSync(path.join(__dirname, 'tests'));

const filter = [];
for (let i = 2; i < process.argv.length; i++) {
	filter.push(process.argv[i].replace('--', ''));
}

for (let i = 0; i < files.length; i++) {
	let file = files[i];
	if (filter.length) {
		if (filter.some(f => file.includes(f))) {
			require(path.join(__dirname, 'tests', file))(t);
		}
	} else {
		require(path.join(__dirname, 'tests', file))(t);
	}
}

t.run();
