import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Stage, Opts } from '../src/zorn.js';
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
        var regex = new RegExp(enumName + '\\.' + key + '([^\\w])', 'g');
        code = code.replace(regex, function (_, capture) {
            return enumObj[key] + ' /* ' + enumName + '.' + key + ' */' + capture;
        });
    }
    return code;
}

function logError(err) {
    if (err) {
        console.error(err);
    }
}

var __dirname = path.dirname(fileURLToPath(import.meta.url));

var root = path.join(__dirname, '..');

var dist = path.join(root, 'dist');

if (process.argv.includes('--minify') || process.argv.includes('-m')) {
    bundleMinify();
}

bundle();

function bundle() {
    /** @type {?function(): void} */
    var write = null;
    var nodist = true;
    fs.access(dist, function (err) {
        if (err) {
            fs.mkdir(dist, function (err) {
                if (err) {
                    console.error(err);
                    return;
                }
                if (write !== null) {
                    write();
                } else {
                    nodist = false;
                }
            });
        } else {
            nodist = false;
        }
    });
    var CommentRegex = /\/\*[\s\S]*?\*\/|\/\/.*[^\S\r\n]*/g;
    var ExportRegex = /export\s\{([\$\w\,\s]+)\s*\};?/;
    var ImportRegex = /import\s*\{([\$\w\,\s]+)\s*\}\s*from\s*['"]([\w\.\/]+)['"];?/g;

    fs.readFile(path.join(root, 'src', 'zorn.js'), function (err, data) {
        if (err) {
            console.error(err);
            return;
        }
        var srcCode = data.toString();

        srcCode = inlineEnum(srcCode, 'Opts', Opts);
        srcCode = inlineEnum(srcCode, 'Stage', Stage);

        var code = srcCode.split('/* START_OF_FILE */')[1];
        code = code.replace(CommentRegex, '');
        code = code.replace(ImportRegex, '');

        code = code.split('\n').filter(line => line.trim().length > 0).join('\n');

        var mjs = code;
        var cjs = code.replace(ExportRegex, function (_, capture) {
            return 'module.exports = {' + capture + '};';
        });
        var iife = 'var Zorn = (function() {\n\t' + code.replace(ExportRegex, function (_, capture) {
            return 'return { ' + capture.trim().split(',').map(s => s.trim()).filter(s => s !== ',').map(val => val + ': ' + val).join(', ') + ' };';
        }).split('\n').join('\n\t') + '\n})();';
        if (nodist) {
            write = function() {
                writeBundle(srcCode, mjs, cjs, iife);
            }
        } else {
            writeBundle(srcCode, mjs, cjs, iife);
        }
    });
}

function writeBundle(srcCode, mjs, cjs, iife) {
    fs.writeFile(path.join(dist, 'zorn.js'), srcCode, logError);
    fs.writeFile(path.join(dist, 'zorn.mjs'), mjs, logError);
    fs.writeFile(path.join(dist, 'zorn.cjs'), cjs, logError);
    fs.writeFile(path.join(dist, 'zorn.iife.js'), iife, logError);
    fs.copyFile(path.join(root, 'src', 'zorn.d.ts'), path.join(root, 'dist', 'zorn.d.ts'), logError);
}

function bundleMinify() {
    var src = path.join(root, 'src');
    var cmd = `closure-compiler --language_out=ECMASCRIPT5 -O=ADVANCED -W=VERBOSE --externs=${path.join(root, 'externs', 'zorn.js')} --module_resolution=NODE --js ${path.join(src, 'zorn.js')} --js ${path.join(__dirname, 'src', 'browser.js')}`;
    exec(cmd, function (err, stdout, stderr) {
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
        var mjs = stdout.replace(regex, function (_, newLine, capture) {
            if (i++ === 0) {
                return 'export var ' + capture + '=';
            }
            if (newLine) {
                newLine = newLine.replace(';', '');
            }
            return newLine + ',' + capture + '=';
        });
        fs.writeFile(path.join(root, 'dist', 'zorn.min.mjs'), mjs, logError);

        i = 0;
        var cjs = stdout.replace(regex, function (_, newLine, capture) {
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
        fs.writeFile(path.join(root, 'dist', 'zorn.min.cjs'), cjs, logError);

        i = 0;
        var iife = 'var Zorn=(function(){' + stdout.replace(regex, function (_, newLine, capture) {
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
        fs.writeFile(path.join(root, 'dist', 'zorn.min.iife.js'), iife, logError);
    });
}