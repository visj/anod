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
            return enumObj[key] + '/* ' + enumName + '.' + key + ' */' + capture.trim();
        });
    }
    return code;
}

var __EXCLUDE__ = '/* __EXCLUDE__ */';

/**
 * 
 * @param {string} str 
 * @returns {string}
 */
function stripExcludes(str) {
    var inExclude = false;
    var sb = '';
    var head, tail;
    head = tail = 0;
    do {
        head = str.indexOf(__EXCLUDE__, tail);
        if (!inExclude) {
            if (head === -1 || head + __EXCLUDE__.length === str.length) {
                sb = sb + str.slice(tail);
            } else {
                sb = sb + str.slice(tail, head);
            }
        }
        tail = head + __EXCLUDE__.length;
        inExclude = !inExclude;
        if (head === -1) {
            break;
        }
    } while (tail < str.length);
    return sb;
}

/**
 * 
 * @param {string} str 
 */
function stripEmptyLines(str) {
    return str.split('\n').filter(function (line) {
        return line.trim().length > 0;
    }).join('\n');
}

function logError(err) {
    if (err) {
        console.error(err);
    }
}

var __dirname = path.dirname(fileURLToPath(import.meta.url));

var rootDir = path.join(__dirname, '..');

var dist = path.join(rootDir, 'dist');

var srcFile = path.join(rootDir, 'src', 'zorn.js');
var externsFile = path.join(rootDir, 'externs', 'zorn.js');
var closureFile = path.join(__dirname, 'src', 'closure.js');

bundle();
bundleMinify();

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

    fs.readFile(srcFile, function (err, data) {
        if (err) {
            console.error(err);
            return;
        }
        var srcCode = data.toString();

        srcCode = inlineEnum(srcCode, 'Opts', Opts);
        srcCode = inlineEnum(srcCode, 'Stage', Stage);

        var code = stripExcludes(srcCode);
        code = code.replace(CommentRegex, '');
        code = code.replace(ImportRegex, '');
        code = stripEmptyLines(code);

        var mjs = code;
        var cjs = code.replace(ExportRegex, function (_, capture) {
            return 'module.exports = {' + capture + '};';
        });
        var iife = 'var Zorn = (function() {\n\t' + code.replace(ExportRegex, function (_, capture) {
            return 'return { ' + capture.trim().split(',').map(function(s) {
                return s.trim();
            }).filter(function(s) {
                return s !== ',';
            }).map(function(val) {
                return val + ': ' + val;
            }).join(', ') + ' };';
        }).split('\n').join('\n\t') + '\n})();';
        if (nodist) {
            write = function () {
                writeBundle(srcCode, mjs, cjs, iife);
            }
        } else {
            writeBundle(srcCode, mjs, cjs, iife);
        }
    });
}

function writeBundle(srcCode, mjs, cjs, iife) {
    fs.readFile(externsFile, function(err, data) {
        if (err) {
            console.error(err);
            return;
        }
        var externsCode = data.toString();
        srcCode = stripExcludes(externsCode) + '\n' + srcCode;
        srcCode = stripEmptyLines(srcCode);
        fs.writeFile(path.join(dist, 'zorn.closure.js'), srcCode, logError);
    });
    fs.writeFile(path.join(dist, 'zorn.mjs'), mjs, logError);
    fs.writeFile(path.join(dist, 'zorn.cjs'), cjs, logError);
    fs.writeFile(path.join(dist, 'zorn.iife.js'), iife, logError);
    fs.copyFile(path.join(rootDir, 'src', 'zorn.d.ts'), path.join(rootDir, 'dist', 'zorn.d.ts'), logError);
}

function bundleMinify() {
    var cmd = "closure-compiler --language_out=ECMASCRIPT5 -O=ADVANCED -W=VERBOSE --module_resolution=NODE --externs=" + externsFile + " --js " + srcFile + " --js " + closureFile;
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
                return ';export var ' + capture + '=';
            }
            if (newLine) {
                newLine = newLine.replace(';', '');
            }
            return newLine + ',' + capture + '=';
        });
        fs.writeFile(path.join(rootDir, 'dist', 'zorn.min.mjs'), mjs, logError);

        i = 0;
        var cjs = stdout.replace(regex, function (_, newLine, capture) {
            if (i++ === 0) {
                return ';module.exports={' + capture + ':';
            }
            if (newLine) {
                newLine = newLine.replace(';', '');
            }
            return newLine + ',' + capture + ':';
        });
        cjs = cjs.replace(/[\s\;]*$/, '');
        cjs = cjs + '};';
        fs.writeFile(path.join(rootDir, 'dist', 'zorn.min.cjs'), cjs, logError);

        i = 0;
        var iife = 'var Zorn=(function(){' + stdout.replace(regex, function (_, newLine, capture) {
            if (i++ === 0) {
                return ';return{' + capture + ':';
            }
            if (newLine) {
                newLine = newLine.replace(';', '');
            }
            return newLine + ',' + capture + ':';
        });
        iife = iife.replace(/[\s\;]*$/, '');
        iife = iife + '};' + '})();';
        fs.writeFile(path.join(rootDir, 'dist', 'zorn.min.iife.js'), iife, logError);
    });
}