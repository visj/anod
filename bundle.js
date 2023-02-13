var fs = require('fs');
var path = require('path');
var rollup = require('rollup');
var cleanup = require('rollup-plugin-cleanup');
var { exec } = require('child_process');

rollup.rollup(
    {
        input: 'src/zorn.js',
        plugins: [cleanup()]
    }
).then(result => {
    result.generate({
        file: 'dist/zorn.cjs',
        format: 'cjs',
    },).then(res => {
        res.output.forEach(output => {
            var exportArray = [];
            var out = output.code.replace(/\s*window\[\"(\w+)\"\]\s*\=\s*\w+;?\s*/g, function (match, capture, string) {
                exportArray.push(capture);
                return '';
            }) + '\nexport { ' + exportArray.join(', ') + ' };';
            fs.writeFileSync(path.join(__dirname, 'dist', output.fileName), out);
        })
    });
    result.generate({
        file: 'dist/zorn.mjs',
        format: 'cjs',
    }).then(res => {
        res.output.forEach(output => {
            var exportArray = [];
            var out = output.code.replace(/\s*window\[\"(\w+)\"\]\s*\=\s*\w+;?\s*/g, function (match, capture, string) {
                exportArray.push(capture);
                return '';
            }) + '\nmodule.exports = { ' + exportArray.join(', ') + ' };';
            fs.writeFileSync(path.join(__dirname, 'dist', output.fileName), out);
        })
    });
    result.generate({
        file: 'dist/zorn.js',
        format: 'iife',
        name: 'Zorn',
    }).then(res => {
        res.output.forEach(output => {
            var exportArray = [];
            var out = output.code.replace(/\s*window\[\"(\w+)\"\]\s*\=\s*\w+;?\n?/g, function (match, capture, offset) {
                exportArray.push(capture);
                return '';
            }).split('\n'); //.replace('return exports;', 'return { ' + exportArray.join(', ') + ' };');
            out.splice(-2, 0, '\twindow.Zorn = { ' + exportArray.map(val => val + ': ' + val).join(', ') + ' };\n');
            fs.writeFileSync(path.join(__dirname, 'dist', output.fileName), out.join('\n'));
        });
    });
});

exec('closure-compiler --compilation_level=ADVANCED src/zorn.js', function (err, stdout, stderr) {
    if (err) {
        console.error(err);
        return;
    }
    if (stderr) {
        console.error(stderr);
        return;
    }
    var exportArray = [];
    var code = stdout.replace(/window\.(\w+)=/g, function(match, capture) {
        exportArray.push(capture);
        return 'var ' + capture + '=';
    });
    fs.writeFileSync(path.join(__dirname, 'dist', 'zorn.min.cjs'), code + '\nmodule.exports = { ' + exportArray.join(', ') + ' };');
    fs.writeFileSync(path.join(__dirname, 'dist', 'zorn.min.mjs'), code + '\nexport { ' + exportArray.join(', ') + ' };');
    fs.writeFileSync(path.join(__dirname, 'dist', 'zorn.min.js'), code + '\nwindow.Zorn = { ' + exportArray.map(val => val + ': ' + val).join(', ') + ' };');
})