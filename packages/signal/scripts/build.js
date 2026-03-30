import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { rolldown } from 'rolldown';
import { minify } from 'terser';
import { replacePlugin } from 'rolldown/plugins';
import * as anod from '../src/core/signal.js';

const createDefineMap = () => {
    const define = {};
    const enums = {
        State: anod.State,
        Flag: anod.Flag,
        Op: anod.Op,
        Mut: anod.Mut,
        Opt: anod.Opt,
        Type: anod.Type,
        AsyncType: anod.AsyncType
    };
    const constants = {
        RESET: anod.RESET,
        OPTIONS: anod.OPTIONS
    }

    for (const [prefix, obj] of Object.entries(enums)) {
        if (!obj) continue;
        for (const [key, val] of Object.entries(obj)) {
            // This maps 'State.STALE' to '1' (or whatever the number is)
            // We stringify the value so Rolldown treats it as a literal expression
            define[`${prefix}.${key}`] = val;
        }
    }
    for (const val in constants) {
        define[val] = constants[val];
    }

    return define;
};


const outputDir = './dist';
// This is your stable property map that the 'list' package will reuse
const nameCachePath = path.resolve(outputDir, 'mangle.json');

const typeFile = './types/signal.d.ts';

async function build() {
    console.log('2. Bundling with Rolldown...');

    const bundle = await rolldown({
        input: {
            index: './src/index.js',
            internal: './src/internal.js',
        },
        plugins: [
            // Use the replace plugin to inline enums as pure integers
            replacePlugin({
                values: createDefineMap(),
                delimiters: ['', ''],
            })
        ],
        treeshake: {
            moduleSideEffects: (id) => {
                // Tell the bundler that types.js has absolutely zero side effects.
                // This gives it permission to drop the unused imports entirely.
                if (id.includes('types.js')) {
                    return false;
                }
                // Keep default behavior for everything else
                return true;
            }
        }
    });

    const { output } = await bundle.generate({
        dir: outputDir,
        format: 'esm',
        sourcemap: true,
        entryFileNames: '[name].mjs',
        chunkFileNames: 'signal.mjs' // The shared engine chunk
    });

    console.log('3. Minifying and mangling properties with Terser...');

    // Load existing property map if it exists, otherwise start fresh
    let nameCache = {};
    if (fs.existsSync(nameCachePath)) {
        nameCache = JSON.parse(fs.readFileSync(nameCachePath, 'utf8'));
    }

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    for (const chunk of output) {
        if (chunk.type === 'chunk') {
            // Minify the Rolldown output
            const minified = await minify(chunk.code, {
                sourceMap: {
                    content: chunk.map,
                    url: `${chunk.fileName}.map`
                },
                module: true,
                compress: {
                    passes: 2,
                    unsafe: true,
                    dead_code: true,
                    global_defs: createDefineMap()
                },
                mangle: {
                    properties: {
                        // Mangle ANY property starting with an underscore
                        regex: /^_/
                    }
                },
                // Pass the cache! This syncs mangling across chunks AND builds
                nameCache
            });

            fs.writeFileSync(path.resolve(outputDir, chunk.fileName), minified.code);
            fs.writeFileSync(path.resolve(outputDir, `${chunk.fileName}.map`), minified.map);
        }
    }

    // Save the property map so your list package can use it
    fs.writeFileSync(nameCachePath, JSON.stringify(nameCache, null, 2));
    fs.copyFileSync(typeFile, path.resolve(outputDir, 'index.d.ts'));

    console.log('Success! Outputs written to dist/ and stable map saved to mangle.json.');
}

build().catch(console.error);