const fs = require('fs');
const path = require('path');
const { Test } = require('boer');

const t = new Test();

const files = fs.readdirSync(path.join(__dirname, 'tests'));

for (let i = 0; i < files.length; i++) {
	let file = files[i];
	require(path.join(__dirname, 'tests', file))(t);
}

t.run();