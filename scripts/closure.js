import { rmSync, mkdirSync } from "node:fs";

const tempDir = './temp';

// Ensure temp directory is fresh
rmSync(tempDir, { recursive: true, force: true });
mkdirSync(tempDir, { recursive: true });

const args = [
  'google-closure-compiler', // In Bun, we can call the binary directly if it's in node_modules
  '--warning_level', 'VERBOSE',
  '--compilation_level', 'ADVANCED',
  '--assume_function_wrapper', 'true',
  '--language_in', 'ECMASCRIPT_NEXT',
  '--language_out', 'ECMASCRIPT_2015',
  '--rewrite_polyfills', 'false',
  '--chunk_output_type', 'ES_MODULES',
  '--chunk_output_path_prefix', `${tempDir}/`,
  '--externs' ,'externs/externs.js',
  '--js', 'src/core/api.js',
  '--js', 'src/core/types.js',
  '--js', 'src/core/anod.js',
  '--chunk', 'signal.min:3',
  '--js', 'src/internal.js',
  '--chunk', 'internal.min:1:signal.min',
  '--js', 'src/index.js',
  '--chunk', 'index.min:1:signal.min'
];

console.log(`Compiling 3 chunks with Advanced Optimizations...`);

// Bun.spawn handles the stdio inheritance and process management much more cleanly
const proc = Bun.spawn(["npx", ...args], {
  stdout: "inherit",
  stderr: "inherit",
});

const exitCode = await proc.exited;

if (exitCode !== 0) {
  console.error(`\nCompiler exited with code ${exitCode}`);
  process.exit(exitCode);
}

console.log('\nCompiler done.');

// Wipe the temp directory
rmSync(tempDir, { recursive: true, force: true });
