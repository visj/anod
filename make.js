const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const dist = path.join(__dirname, 'dist');

if (!fs.existsSync(dist)) {
	fs.mkdirSync(dist);
}

const src = path.join(__dirname, 'src');
const file = path.join(src, 'index.js');

const StripRegex = /\/\*\s*@exclude\s*\*\/[ \t]*/g;

let srcFile = fs.readFileSync(file).toString().split(StripRegex).filter((_, i) => i % 2 === 0).join('');

const anod = require(file);

replaceEnum(anod.Flag, 'Flag');
replaceEnum(anod.System, 'System');
replaceEnum(anod.Mod, 'Mod');
replaceEnum(anod.Mutation, 'Mutation');
replaceVar('NoResult', -2);
inlineBitors();

function replaceEnum(obj, name) {
	for (const key in obj) {
		const val = obj[key];
		srcFile = srcFile.replace(new RegExp(name + '.' + key, 'g'), function () {
			return val;
		});
	}
}

function replaceVar(name, value) {
	srcFile = srcFile.replace(name, value);
}

function inlineBitors() {
	srcFile = srcFile.replace(/\((?=.*\|)([\d\| ]+)\)/g, function (_, match) {
		let flag = 0;
		match
			.split('|')
			.map(part => part.trim())
			.forEach(bit => { flag |= parseInt(bit, 10); });
		return flag;
	})
}

const CommentRegex = /\/\*[\s\S]*?\*\//gm;
const ExportRegex = /module\.exports\s+=\s+{\s+([\w\:\s\,]+)\s+\}\;/g;

const js = '(function() {\n\t' + srcFile.replace(CommentRegex, '').replace(ExportRegex, function () {
	return 'window.anod = {\n\t' +
		arguments[1]
			.split(',')
			.filter(part => part !== '')
			.map(part => {
				const name = part.trim();
				return name + ': ' + name;
			}).join(',\n\t') + '\n};';
}).split('\n').filter(x => x.trim() !== '').join('\n\t') + '\n})();'
const cjs = srcFile.replace(CommentRegex, '').replace(ExportRegex, function () {
	return 'module.exports = {\n\t' +
		arguments[1]
			.split(',')
			.filter(part => part !== '')
			.map(part => {
				const name = part.trim();
				return name + ': ' + name;
			}).join(',\n\t') + '\n};';
}).split('\n').filter(x => x.trim() !== '').join('\n');
const mjs = srcFile.replace(ExportRegex, function () {
	return (
		'export {\n' +
		(arguments[1]
			.split(',')
			.filter(part => part !== '')
			.map(part => '  ' + part.split(':')[0].trim() + ',').join('\n')) +
		'\n}'
	);
}).split('\n').filter(x => x.trim() !== '').join('\n');

fs.writeFileSync(path.join(dist, 'anod.mjs'), mjs);
fs.writeFileSync(path.join(dist, 'anod.cjs'), cjs);

fs.writeFileSync(path.join(dist, 'anod.js'), js);

const cmd = 'npx esbuild --target=es5 --minify --outfile=dist/anod.min.js dist/anod.js';

exec(cmd, function () { 
	fs.unlinkSync(path.join(dist, 'anod.js')); 
});
