import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as zorn from '../src/zorn.js';
import { exec } from 'child_process';

var CommentRegex = /\/\*[^*][\s\S]*?\*\/|\/\/.*[^\S\r\n]*/g;
var AllCommentsRegex = /\/\*[\s\S]*?\*\/|\/\/.*[^\S\r\n]*/g;
var ExportRegex = /export\s\{([\$\w\,\s]+)\s*\};?/;
var ImportRegex = /import\s*\{([\$\w\,\s]+)\s*\}\s*from\s*['"]([\w\.\/]+)['"];?/g;

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
            var space = '';
            if (capture[capture.length - 1] === ' ') {
                space = ' ';
            }
            return enumObj[key] + '/* ' + enumName + '.' + key + ' */' + capture.trim() + space;
        });
    }
    return code;
}

/**
 * 
 * @param {string} str 
 * @param {string} marker
 * @returns {string}
 */
function removeSection(str, marker) {
    var inExclude = false;
    var sb = '';
    var head, tail;
    head = tail = 0;
    do {
        head = str.indexOf(marker, tail);
        if (!inExclude) {
            if (head === -1 || head + marker.length === str.length) {
                sb = sb + str.slice(tail).trim();
            } else {
                sb = sb + str.slice(tail, head);
            }
        }
        tail = head + marker.length;
        inExclude = !inExclude;
        if (head === -1) {
            break;
        }
    } while (tail < str.length);
    return sb;
}

function removeMarker(str, marker) {
    return str.replace(new RegExp('\s*' + marker + '\s*', 'gm'), '');
}

/**
 * 
 * @param {string} str 
 */
function removeEmptyLines(str) {
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

var distDir = path.join(rootDir, 'dist');

var srcFile = path.join(rootDir, 'src', 'zorn.js');
var externsFile = path.join(distDir, 'zorn.ext.js');

var ENUMS = ['Opts', 'Stage', 'Mutation', 'Args'];

bundle();

function bundle() {
    /** @type {?function(): void} */
    var write = null;
    var nodist = true;
    fs.access(distDir, function (err) {
        if (err) {
            fs.mkdir(distDir, function (err) {
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

    fs.readFile(srcFile, function (err, data) {
        if (err) {
            console.error(err);
            return;
        }
        var srcCode = data.toString();
        ENUMS.forEach(function (enumName) {
            srcCode = inlineEnum(srcCode, enumName, zorn[enumName]);
        });

        var code = removeSection(srcCode, '__EXCLUDE__');
        code = code.replace(AllCommentsRegex, '');
        code = code.replace(ImportRegex, '');
        code = removeEmptyLines(code);

        var mjs = code;
        var cjs = code.replace(ExportRegex, function (_, capture) {
            return 'module.exports = {' + capture + '};';
        });
        var iife = 'var Z=(function() {\n\t' + code.replace(ExportRegex, function (_, capture) {
            return 'return { ' + capture
                .trim()
                .split(',')
                .filter(function (s) {
                    return s.trim().length !== 0;
                })
                .map(function (s) {
                    return s.trim();
                }).filter(function (s) {
                    return s !== ',';
                }).map(function (val) {
                    return val + ': ' + val;
                }).join(', ') + ' };';
        }).split('\n').join('\n\t') + '\n})();';

        var ext = removeSection(srcCode, '__SOURCE__');
        ext = ext.replace(CommentRegex, '');
        ext = removeMarker(ext, '__EXTERNS__');
        ext = removeMarker(ext, '__EXCLUDE__');
        ext = removeEmptyLines(ext);

        var closureCode = removeSection(srcCode, '__EXTERNS__');
        closureCode = closureCode.replace(CommentRegex, '');
        closureCode = removeEmptyLines(closureCode);
        if (nodist) {
            write = function () {
                writeBundle(mjs, cjs, iife, closureCode, ext);
            }
        } else {
            writeBundle(mjs, cjs, iife, closureCode, ext);
        }
    });
}

function writeBundle(mjs, cjs, iife, closureCode, ext) {

    var closureFile = path.join(distDir, 'zorn.js')
    fs.writeFile(path.join(distDir, 'zorn.mjs'), mjs, logError);
    fs.writeFile(path.join(distDir, 'zorn.cjs'), cjs, logError);
    fs.writeFile(path.join(distDir, 'zorn.iife.js'), iife, logError);
    fs.writeFile(closureFile, closureCode, logError);
    fs.writeFile(path.join(distDir, 'zorn.ext.js'), ext, function (err) {
        if (err) {
            console.error(err);
            return;
        }
        if (process.argv.some(function (arg) {
            return arg === '--minify' || arg === '-m';
        })) {
            bundleMinify(closureFile);
        }
    });
    fs.copyFile(path.join(rootDir, 'src', 'zorn.d.ts'), path.join(rootDir, 'dist', 'zorn.d.ts'), logError);
}

/**
 * 
 * @param {string} srcFile 
 */
function bundleMinify(srcFile) {
    var api = Object.keys(zorn).filter(function (key) {
        return !ENUMS.includes(key);
    });
    var entry = [
        'import { ' + api.join(', ') + ' } from "' + path.join(__dirname, '..', 'dist', 'zorn.js') + '";',
        api.map(function (key) {
            return "window['" + key + "'] = " + key + ";";
        }).join('\n'),
    ].join('\n');
    var closureFile = path.join(__dirname, '__closure__.js');
    fs.writeFile(closureFile, entry, function (err) {
        if (err) {
            return console.error(err);
        }
        closureCompile(srcFile, closureFile);
    });
}

/**
 * @param {string} srcFile
 * @param {string} closureFile 
 */
function closureCompile(srcFile, closureFile) {
    var cmd = "closure-compiler" + 
        " --language_out=ECMASCRIPT5" + 
        " -O=ADVANCED" + 
        " -W=VERBOSE" +
        " --module_resolution=NODE" + 
        " --js " +  externsFile + 
        " --js " + srcFile + 
        " --js " + closureFile;
    exec(cmd, function (err, stdout, stderr) {
        fs.rm(closureFile, logError);
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
        var iife = 'var Z=(function(){' + stdout.replace(regex, function (_, newLine, capture) {
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