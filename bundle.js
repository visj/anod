import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Stage, State } from './src/lib.js';
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

var CommentRegex = /\/\*[\s\S]*?\*\/|\/\/.*/g;
var ExportRegex = /export\s\{([\$\w\,\s]+)\s*\};?/;
var ImportRegex = /import\s*\{([\$\w\,\s]+)\s*\}\s*from\s*['"]([\w\.\/]+)['"];?/g;

var code = fs.readFileSync(path.join(__dirname, 'src', 'zorn.js')).toString();

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

fs.writeFileSync(path.join(__dirname, 'dist', 'zorn.js'), iife);
fs.writeFileSync(path.join(__dirname, 'dist', 'zorn.mjs'), mjs);
fs.writeFileSync(path.join(__dirname, 'dist', 'zorn.cjs'), cjs);

if (process.argv.includes('--minify') || process.argv.includes('-m')) {
    exec('closure-compiler -O=ADVANCED -W=VERBOSE --module_resolution=NODE --js src/lib.js --js src/zorn.js --js src/index.js', function (err, stdout, stderr) {
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
        fs.writeFileSync(path.join(__dirname, 'dist', 'zorn.min.mjs'), mjs);
        fs.writeFileSync(path.join(__dirname, 'dist', 'zorn.min.cjs'), cjs);
        fs.writeFileSync(path.join(__dirname, 'dist', 'zorn.min.js'), iife);
    });
}