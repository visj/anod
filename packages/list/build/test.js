import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const outputDir = './dist';
const testFilesDir = './test/tests';

const testFiles = fs.readdirSync(testFilesDir)
    .filter(file => file.endsWith('.test.js'))
    .map(file => path.join(testFilesDir, file));

const args = [
    '--warning_level', 'VERBOSE',
    '--compilation_level', 'ADVANCED',
    '--assume_function_wrapper', 'true',
    '--language_in', 'ECMASCRIPT_NEXT',
    '--language_out', 'ECMASCRIPT_2015',
    '--rewrite_polyfills', 'false',
    '--externs', 'test/util/types.js',
    '--js_output_file', `${outputDir}/test.min.js`,
    '--js', 'src/types.js',
    '--js', 'src/signal.js',
    '--js', 'src/list.js',
    '--js', 'test/tests/*.js',
    '--js', 'test/util/test.js',
    '--js', 'test/index.js'
];

console.log(`Compiling chunks with Advanced Optimizations...`);

const compiler = spawn('google-closure-compiler', args, { shell: true });

compiler.stdout.on('data', (data) => console.log(data.toString()));
compiler.stderr.on('data', (data) => console.error(data.toString()));

compiler.on('close', (code) => {
    if (code !== 0) {
      console.error(`Compiler exited with code ${code}`);
      process.exit(code);
    }
    console.log('Compiler done. Building packages...');
});
