const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

/**
 * 
 * @returns {string}
 */
String.prototype.trimExcludes = function () {
	return this
		.split(/\/\*\s*@exclude\s*\*\/[ \t]*/g)
		.filter((_, i) => i % 2 === 0)
		.join('');
}

/**
 *  
 * @returns {string}
 */
String.prototype.trimComments = function () {
	return this.replace(/\/\*[\s\S]*?\*\//gm, '');
}

/**
 * 
 * @param {Object} obj 
 * @param {string} name 
 * @returns {string}
 */
String.prototype.replaceEnum = function (obj, name) {
	let str = this;
	for (const key in obj) {
		const val = obj[key];
		str = str.replace(new RegExp(name + '.' + key, 'g'), () => val);
	}
	return str;
}

/**
 * 
 * @param {string} name 
 * @param {number|string} value 
 * @returns {string}
 */
String.prototype.replaceVar = function (name, value) {
	return this.replace(new RegExp(name, 'g'), value);
}

/**
 * 
 * @returns {string}
 */
String.prototype.trimBits = function () {
	return this.replace(/\((?=.*\|)([\d\| ]+)\)/g, function (_, match) {
		let flag = 0;
		match
			.split('|')
			.map(part => part.trim())
			.forEach(bit => { flag |= parseInt(bit, 10); });
		return flag;
	})
}

/**
 * 
 * @returns {string}
 */
String.prototype.trimEmptyLines = function () {
	return this.split('\n').filter(x => x.trim() !== '').join('\n\t');
}

String.prototype.replaceExports = function (callback) {
	return this.replace(/module\.exports\s+=\s+{\s+([\w\:\s\,]+)\s+\}\;/g, callback)
}

function iife(str) {
	return '(function() {\n\t' + str + '\n})();';
}

function browserExport(_, match) {
	return 'window.anod = {\n\t' +
		match
			.split(',')
			.filter(part => part !== '')
			.map(part => {
				const name = part.trim();
				return name + ': ' + name;
			}).join(',\n\t') + '\n};';
}

function nodeExport(_, match) {
	return 'module.exports = {\n\t' +
		match
			.split(',')
			.filter(part => part !== '')
			.map(part => {
				const name = part.trim();
				return name + ': ' + name;
			}).join(',\n\t') + '\n};';
}

function nodeModuleExport(_, match) {
	return (
		'export {\n' +
		match
			.split(',')
			.filter(part => part !== '')
			.map(part => {
				return '  ' + part.split(':')[0].trim() + ','
			}).join('\n') +
		'\n}'
	);
}

(function main() {
	const src = path.join(__dirname, 'src');
	const dist = path.join(__dirname, 'dist');
	const srcFile = path.join(src, 'index.js');
	let file = fs
		.readFileSync(srcFile)
		.toString()
		.trimExcludes();

	const anod = require(srcFile);

	file = file.trimComments();
	file = file.replaceEnum(anod.Flag, 'Flag');
	file = file.replaceEnum(anod.Mod, 'Mod');
	file = file.replaceEnum(anod.System, 'System');
	file = file.replaceEnum(anod.Type, 'Type');
	file = file.replaceVar('NoResult', -2);
	file = file.trimBits();

	const js =
		iife(
			file
				.replaceExports(browserExport)
				.trimEmptyLines()
		);

	const cjs =
		file
			.replaceExports(nodeExport)
			.trimEmptyLines();

	const mjs =
		file
			.replaceExports(nodeModuleExport)
			.trimEmptyLines();

	if (!fs.existsSync(dist)) {
		fs.mkdirSync(dist);
	}

	fs.writeFileSync(path.join(dist, 'anod.mjs'), mjs);
	fs.writeFileSync(path.join(dist, 'anod.cjs'), cjs);
	fs.writeFileSync(path.join(dist, 'anod.js'), js);

	exec('npx esbuild --target=es5 --minify --outfile=dist/anod.min.js dist/anod.js', function () {
		fs.unlinkSync(path.join(dist, 'anod.js'));
	});
})();