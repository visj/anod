const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, 'dist');

if (!fs.existsSync(dist)) {
	fs.mkdirSync(dist);
}

const src = path.join(__dirname, 'src');
const file = path.join(src, 'index.js');

let srcFile = fs.readFileSync(file).toString().split('/* @strip */').filter((_, i) => i % 2 === 0).join('');

const anod = require(file);
const Flag = anod.Flag;

for (const key in Flag) {
	const val = Flag[key];
	srcFile = srcFile.replace(new RegExp('Flag.' + key, 'g'), function () {
		return val;
	});
}
const Mutation = anod.Mutation;
for (const key in Mutation) {
	const val = Mutation[key];
	srcFile = srcFile.replace(new RegExp('Mutation.' + key, 'g'), function () {
		return val;
	});
}

const System = anod.System;
for (const key in System) {
	const val = System[key];
	srcFile = srcFile.replace(new RegExp('System.' + key, 'g'), function () {
		return val;
	});
}

const ExportRegexp = /module\.exports\s+=\s+{\s+([\w\:\s\,]+)\s+\}\;/g;

const js = '(function(w) {\n\t' + srcFile.replace(ExportRegexp, function () {
	return 'w.anod = {};\n' +
		arguments[1]
			.split(',')
			.filter(part => part !== '')
			.map(part => {
				const name = part.split(':')[0].trim();
				return 'w.anod.' + name + ' = ' + name + ';';
			}).join('\n')
}).split('\n').join('\n\t') + '\n})(window);'
const cjs = srcFile;
const mjs = srcFile.replace(ExportRegexp, function () {
	return (
		'export {\n' +
		(arguments[1]
			.split(',')
			.filter(part => part !== '')
			.map(part => '  ' + part.split(':')[0].trim() + ',').join('\n')) +
		'\n}'
	);
});

fs.writeFileSync(path.join(dist, 'anod.js'), js);
fs.writeFileSync(path.join(dist, 'anod.cjs'), cjs);
fs.writeFileSync(path.join(dist, 'anod.mjs'), mjs);
