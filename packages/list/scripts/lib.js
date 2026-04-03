import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import MagicString from 'magic-string';
import remapping from '@ampproject/remapping';

const tempDir = './temp';
const outputDir = './dist';

const args = [
  '--warning_level', 'VERBOSE',
  '--compilation_level', 'ADVANCED',
  '--language_in', 'ECMASCRIPT_NEXT',
  '--language_out', 'ECMASCRIPT_2015',
  '--chunk_output_type', 'ES_MODULES',
  '--property_map_input_file', '../signal/dist/props.json',
  '--create_source_map', 'temp/list.min.js.map',
  // Output configuration
  '--js_output_file', 'temp/list.min.js',
  // Crucial: This allows the compiler to resolve @anod/signal 
  // through your monorepo's node_modules symlinks.
  '--module_resolution', 'NODE',
  '--externs', '../signal/externs/signal.js',
  '--externs', 'externs/list.js',
  '--externs', 'externs/signal.js',
  // 1. Pass the shared interfaces as SOURCE.
  // This ensures properties like ._flag are mangled identically to core.
  '--js', '../signal/src/types.js',

  // 2. Pass your list package logic.
  '--js', 'src/list.js',

];

console.log(`Compiling 3 chunks with Advanced Optimizations...`);

const compiler = spawn('npx', ['google-closure-compiler', ...args], { shell: true });

compiler.stdout.on('data', (data) => process.stdout.write(data.toString()));
compiler.stderr.on('data', (data) => process.stderr.write(data.toString()));

compiler.on('close', (code) => {
  if (code !== 0) {
    console.error(`Compiler exited with code ${code}`);
    process.exit(code);
  }
  console.log('\nCompiler done. Building ESM, CJS, and IIFE packages with flawless source maps...');
  // build();
});

// ---------------------------------------------------------------------------
// Source-Map Safe 3-Chunk Processor
// ---------------------------------------------------------------------------
function processChunk(chunkName, isBaseChunk) {
  const minFile = `${tempDir}/${chunkName}.min.js`;
  const mapFile = `${minFile}.map`;
  const rawCode = fs.readFileSync(minFile, 'utf8');
  const rawMap = fs.readFileSync(mapFile, 'utf8');

  // 1. Extract Exports
  let internalExports = [];
  const exportRegex = /;?\s*export\s*\{([^}]+)\};?\s*$/;
  const exportMatch = rawCode.match(exportRegex);
  if (exportMatch) {
    internalExports = exportMatch[1].split(',').map(s => s.trim()).filter(Boolean);
  }

  // 2. Extract Imports
  let importedNames = [];
  const importRegex = /import\s*\{([^}]+)\}\s*from\s*["']\.\/signal\.min\.js["'];?\s*/;
  const importMatch = rawCode.match(importRegex);
  if (importMatch) {
    importedNames = importMatch[1].split(',').map(s => s.trim()).filter(Boolean);
  }

  // 3. Extract Window Assignments
  let publicNames = [];
  const windowRegex = /window\.(\w+)\s*=/g;
  let m;
  while ((m = windowRegex.exec(rawCode)) !== null) {
    publicNames.push(m[1]);
  }

  function generate(format) {
    const s = new MagicString(rawCode);

    // --- 1. SAFELY TRANSFORM IMPORTS (In-place Overwrite) ---
    if (importMatch) {
      if (format === 'esm') {
        s.overwrite(importMatch.index, importMatch.index + importMatch[0].length, `import {${importedNames.join(',')}} from "./signal.mjs";\n`);
      } else if (format === 'cjs') {
        s.overwrite(importMatch.index, importMatch.index + importMatch[0].length, `const {${importedNames.join(',')}} = require("./signal.cjs");\n`);
      } else if (format === 'iife') {
        s.overwrite(importMatch.index, importMatch.index + importMatch[0].length, `(function($){\nvar {${importedNames.join(',')}}=$;\n`);
      }
    } else if (format === 'iife' && isBaseChunk) {
      // Base chunk has no imports to overwrite, safe to prepend
      s.prepend(`window.__anod_engine=(function(){\n`);
    }

    // --- 2. SAFELY TRANSFORM WINDOW ASSIGNMENTS ---
    windowRegex.lastIndex = 0;
    while ((m = windowRegex.exec(rawCode)) !== null) {
      s.overwrite(m.index, m.index + m[0].length, `var ${m[1]}=`);
    }

    // --- 3. SAFELY TRANSFORM EXPORTS ---
    if (exportMatch) {
      if (format === 'esm') {
        s.overwrite(exportMatch.index, exportMatch.index + exportMatch[0].length, `\nexport {${internalExports.join(',')}};`);
      } else if (format === 'cjs') {
        s.overwrite(exportMatch.index, exportMatch.index + exportMatch[0].length, `\nmodule.exports={${internalExports.join(',')}};`);
      } else if (format === 'iife') {
        s.overwrite(exportMatch.index, exportMatch.index + exportMatch[0].length, `\nreturn {${internalExports.join(',')}};\n}());`);
      }
    } else {
      // Leaf chunks have no native exports, safe to append
      if (format === 'esm') {
        s.append(`\nexport {${publicNames.join(',')}};`);
      } else if (format === 'cjs') {
        s.append(`\nmodule.exports={${publicNames.join(',')}};`);
      } else if (format === 'iife') {
        const target = chunkName === 'index' ? 'window.anod' : 'window.anod_internal';
        s.append(`\n${target}=Object.assign(${target}||{},{${publicNames.join(',')}});\n}(window.__anod_engine));`);
      }
    }

    // --- 4. MAP COMPOSITION & PATH FIXING ---
    const intermediateMap = s.generateMap({ source: `${chunkName}.min.js`, hires: true });
    const finalMap = remapping(
      intermediateMap,
      (file) => file === `${chunkName}.min.js` ? JSON.parse(rawMap) : null
    );

    // CRITICAL FIX: Make source paths relative to the dist folder so IDE breakpoints attach properly
    if (finalMap.sources) {
      finalMap.sources = finalMap.sources.map(src => {
        return src.startsWith('src/') ? `../${src}` : src;
      });
    }

    return { code: s.toString(), map: finalMap.toString() };
  }

  return {
    mjs: generate('esm'),
    cjs: generate('cjs'),
    js: generate('iife')
  };
}

function writeFormat(outDir, pkgName, ext, data) {
  const fileName = `${pkgName}.${ext}`;
  fs.writeFileSync(path.join(outDir, fileName), `${data.code}\n//# sourceMappingURL=${fileName}.map`);
  fs.writeFileSync(path.join(outDir, `${fileName}.map`), data.map);
}

function build() {
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const signalOut = processChunk('signal', true);
  const internalOut = processChunk('internal', false);
  const indexOut = processChunk('index', false);

  writeFormat(outputDir, 'signal', 'mjs', signalOut.mjs);
  writeFormat(outputDir, 'internal', 'mjs', internalOut.mjs);
  writeFormat(outputDir, 'index', 'mjs', indexOut.mjs);

  //   writeFormat(outputDir, 'signal', 'cjs', signalOut.cjs);
  //   writeFormat(outputDir, 'internal', 'cjs', internalOut.cjs);
  //   writeFormat(outputDir, 'index', 'cjs', indexOut.cjs);

  //   writeFormat(outputDir, 'signal', 'js', signalOut.js);
  //   writeFormat(outputDir, 'internal', 'js', internalOut.js);
  //   writeFormat(outputDir, 'index', 'js', indexOut.js);

  console.log('Success! Formats generated perfectly.');
}