const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, 'dist');

if (!fs.existsSync(dist)) {
	fs.mkdirSync(dist);
}

const src = path.join(__dirname, 'src');

const file = fs.readFileSync(path.join(src, 'index.js')).toString();

const cjs = file;
const mjs = file.replace('module.exports =', 'export');

fs.writeFileSync(path.join(dist, 'krets.cjs'), cjs);
fs.writeFileSync(path.join(dist, 'krets.mjs'), mjs);
