import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Stage, State } from '../src/zorn.js';
import { exec } from 'child_process';

/**
 * 
 * @param {string} code 
 * @param {string} enumName 
 * @param {Record<string, number>} enumObj 
 * @returns {string}
 */
function inlineEnum(code, enumName, enumObj) {
    for (var key in enumObj) {
        code = code.replace(new RegExp(enumName + '\\.' + key, 'g'), enumObj[key]);
    }
    return code;
}

var __dirname = path.dirname(fileURLToPath(import.meta.url));

var root = path.join(__dirname, '..');

var CommentRegex = /\/\*[\s\S]*?\*\/|\/\/.*/g;
var ExportRegex = /export\s\{([\$\w\,\s]+)\s*\};?/;
var ImportRegex = /import\s*\{([\$\w\,\s]+)\s*\}\s*from\s*['"]([\w\.\/]+)['"];?/g;

var srcCode = fs.readFileSync(path.join(root, 'src', 'zorn.js')).toString();

var code = srcCode.split('/* START_OF_FILE */')[1];
code = code.replace(CommentRegex, '');
code = code.replace(ImportRegex, '');

code = code.split('\n').filter(line => line.trim().length > 0).join('\n');

code = inlineEnum(code, 'Stage', Stage);
code = inlineEnum(code, 'State', State);

var mjs = code;
var cjs = code.replace(ExportRegex, function(_, capture) {
    return 'module.exports = {' + capture + '};';
});
var iife = 'var Zorn = (function() {\n\t' + code.replace(ExportRegex, function(_, capture) {
    return 'return { ' + capture.split(',').map(s => s.trim()).map(val => val + ': ' + val).join(', ') + ' };';
}).split('\n').join('\n\t') + '\n})();';

fs.writeFileSync(path.join(root, 'dist', 'zorn.js'), srcCode);
fs.writeFileSync(path.join(root, 'dist', 'zorn.mjs'), mjs);
fs.writeFileSync(path.join(root, 'dist', 'zorn.cjs'), cjs);
fs.writeFileSync(path.join(root, 'dist', 'zorn.iife.js'), iife);
fs.copyFileSync(path.join(root, 'src', 'zorn.d.ts'), path.join(root, 'dist', 'zorn.d.ts'));

if (process.argv.includes('--minify') || process.argv.includes('-m')) {
    var src = path.join(root, 'src');
    exec(`closure-compiler -O=ADVANCED -W=VERBOSE --externs=${path.join(root, 'externs', 'zorn.js')} --module_resolution=NODE --js ${path.join(src, 'zorn.js')} --js ${path.join(__dirname, 'src', 'browser.js')}`, function (err, stdout, stderr) {
        if (err) {
            console.error(err);
            return;
        }
        if (stderr) {
            console.error(stderr);
            return;
        }
        var i = 0;
        var regex = /([\;\s]*)window\.([\$\w]+)=/g;
        var mjs = stdout.replace(regex, function(_, newLine, capture) {
            if (i++ === 0) {
                return 'export var ' + capture + '=';
            }
            if (newLine) {
                newLine = newLine.replace(';', '');
            }
            return newLine + ',' + capture + '=';
        });
        i = 0;
        var cjs = stdout.replace(regex, function(_, newLine, capture) {
            if (i++ === 0) {
                return 'module.exports={' + capture + ':';
            }
            if (newLine) {
                newLine = newLine.replace(';', '');
            }
            return newLine + ',' + capture + ':';
        });
        cjs = cjs.replace(/[\s\;]*$/, '');
        cjs += '};';
        i = 0;
        var iife = 'var Zorn=(function(){' + stdout.replace(regex, function(_, newLine, capture) {
            if (i++ === 0) {
                return 'return{' + capture + ':';
            }
            if (newLine) {
                newLine = newLine.replace(';', '');
            }
            return newLine + ',' + capture + ':';
        });
        iife = iife.replace(/[\s\;]*$/, '');
        iife += '};';
        iife += '})();';
        fs.writeFileSync(path.join(root, 'dist', 'zorn.min.mjs'), mjs);
        fs.writeFileSync(path.join(root, 'dist', 'zorn.min.cjs'), cjs);
        fs.writeFileSync(path.join(root, 'dist', 'zorn.min.iife.js'), iife);
    });
}