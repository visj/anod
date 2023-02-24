import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as zorn from '../src/zorn.js';
import { exec } from 'child_process';

var CommentRegex = /\/\*[^*][\s\S]*?\*\/|\/\/.*[^\S\r\n]*/g;
var AllCommentsRegex = /\/\*[\s\S]*?\*\/|\/\/.*[^\S\r\n]*/g;
var ExportRegex = /export\s\{([\$\w\,\s]+)\s*\};?/;

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

var ENUMS = ['Opt', 'Stage', 'MutType', 'Mut', 'ColIndex', 'MutIndex'];

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

        var code = removeSection(srcCode, '__EXCLUDE__');
        code = code.replace(AllCommentsRegex, '');
        ENUMS.forEach(function (enumName) {
            srcCode = inlineEnum(srcCode, enumName, zorn[enumName]);
        });
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

        var js = removeSection(srcCode, '__EXTERNS__');
        js = js.replace(CommentRegex, '');
        js = removeEmptyLines(js);

        var closureFile = removeSection(srcCode, '__EXTERNS_FILE__');
        closureFile = closureFile.replace(CommentRegex, '');
        closureFile = removeEmptyLines(closureFile);
        if (nodist) {
            write = function () {
                writeBundle(mjs, cjs, iife, js, ext, closureFile);
            }
        } else {
            writeBundle(mjs, cjs, iife, js, ext, closureFile);
        }
    });
}

function writeBundle(mjs, cjs, iife, js, ext, closureCode) {

    fs.writeFile(path.join(distDir, 'zorn.js'), js, logError);
    fs.writeFile(path.join(distDir, 'zorn.mjs'), mjs, logError);
    fs.writeFile(path.join(distDir, 'zorn.cjs'), cjs, logError);
    fs.writeFile(path.join(distDir, 'zorn.iife.js'), iife, logError);
    fs.writeFile(path.join(distDir, 'zorn.ext.js'), ext, function (err) {
        if (err) {
            console.error(err);
            return;
        }
        if (process.argv.some(function (arg) {
            return arg === '--minify' || arg === '-m';
        })) {
            bundleMinify(closureCode);
        }
    });
    fs.copyFile(path.join(rootDir, 'src', 'zorn.d.ts'), path.join(rootDir, 'dist', 'zorn.d.ts'), logError);
}

/**
 * 
 * @param {string} code 
 */
function bundleMinify(code) {
    var api = Object.keys(zorn).filter(function (key) {
        return !ENUMS.includes(key);
    });
    var entry = [
        'import { ' + api.join(', ') + ' } from "./__zorn__";',
        api.map(function (key) {
            return "window['" + key + "'] = " + key + ";";
        }).join('\n'),
    ].join('\n');
    var zornFile = path.join(__dirname, '__zorn__.js');
    var closureFile = path.join(__dirname, '__closure__.js');
    var wrote = false;
    fs.writeFile(closureFile, entry, function (err) {
        if (err) {
            return console.error(err);
        }
        if (wrote) {
            closureCompile(zornFile, closureFile);
        } else {
            wrote = true;
        }
    });
    fs.writeFile(zornFile, code, function (err) {
        if (err) {
            return console.error(err);
        }
        if (wrote) {
            closureCompile(zornFile, closureFile);
        } else {
            wrote = true;
        }
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
        fs.rm(srcFile, logError);
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