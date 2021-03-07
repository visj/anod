const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const dist = path.join(__dirname, 'dist');

if (!fs.existsSync(dist)) {
	fs.mkdirSync(dist);
}

const src = path.join(__dirname, 'src');
const file = path.join(src, 'index.js');

const StripRegex = /\/\*\s*@strip\s*\*\/\n/g;
const ModuleRegex = /\/\*\s*@module\s*\*\/\n/g;

let srcFile = fs.readFileSync(file).toString().split(StripRegex).filter((_, i) => i % 2 === 0).join('');

const anod = require(file);

replaceEnum(anod.Flag, 'Flag');
replaceEnum(anod.Mutation, 'Mutation');
replaceEnum(anod.System, 'System');
replaceEnum(anod.Modification, 'Modification');

function replaceEnum(obj, name) {
	for (const key in obj) {
		const val = obj[key];
		srcFile = srcFile.replace(new RegExp(name + '.' + key, 'g'), function () {
			return val;
		});
	}
}

const CommentRegex = /\/\*[\s\S]*?\*\//gm;
const ExportRegex = /module\.exports\s+=\s+{\s+([\w\:\s\,]+)\s+\}\;/g;

const js = '(function(w) {\n\t' + srcFile.split(ModuleRegex).filter((_, i) => i % 2 === 0).join('').replace(CommentRegex, '').replace(ExportRegex, function () {
	return 'w.anod = {};\n' +
		arguments[1]
			.split(',')
			.filter(part => part !== '')
			.map(part => {
				const name = part.split(':')[0].trim();
				return 'w.anod.' + name + ' = ' + name + ';';
			}).join('\n')
}).split('\n').filter(x => x.trim() !== '').join('\n\t') + '\n})(window);'
const cjs = srcFile.split(ModuleRegex).filter((_, i) => i % 2 === 0).join('').replace(CommentRegex, '').split('\n').filter(x => x.trim() !== '').join('\n');
const mjs = srcFile.replace(ExportRegex, function () {
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

if (process.argv.includes('--publish')) {
	const closure = path.join(__dirname, 'closure');

	if (!fs.existsSync(closure)) {
		fs.mkdirSync(closure);
	}

	const Protos = ['Enumerable', 'DataArray', 'DataEnumerable'];

	let index = srcFile.replace(ExportRegex, function () {
		return `window['anod'] = {};\n` +
			arguments[1]
				.split(',')
				.filter(part => part !== '')
				.map(part => {
					const name = part.split(':')[0].trim();
					return `window['anod']['` + name + `'] = ` + name + `;`;
				}).join('\n')
	})

	Protos.forEach(proto => {
		index = index.replace(new RegExp(`(${proto})\.prototype\.(\\w+)`, 'gm'), function () {
			return `${proto}.prototype['${arguments[2]}']`;
		});
	});

	fs.writeFileSync(path.join(closure, 'index.js'), index);

	const cmd = 'closure-compiler --compilation_level ADVANCED --module_resolution NODE --language_out ES3 --js closure/index.js --js_output_file dist/anod.min.js';

	exec(cmd, function (err, stdout, stderr) {
		if (err) {
			console.error(err);
		}
		if (stdout) {
			console.log(stdout);
		}
		if (stderr) {
			console.error(stderr);
		}
		fs.rmdirSync(closure, { recursive: true });
	});
}

