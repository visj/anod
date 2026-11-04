import fs from 'fs';
import path from 'path';
import { rolldown } from 'rolldown';
import { minify } from 'terser';

const outputDir = './dist';
/**
 * Terser's name cache, kept in the repo so mangled names stay the same across
 * builds and releases. It is shipped, so libraries that reach into anod's
 * internals can mangle their own builds with the same names.
 */
const nameCachePath = path.resolve('./mangle.json');
const typeFiles = ['./types/index.d.ts', './types/internal.d.ts'];

async function build() {
    console.log('1. Bundling with Rolldown...');

    const bundle = await rolldown({
        input: {
            index: './src/index.js',
            internal: './src/internal.js',
        },
        treeshake: {
            moduleSideEffects: (id) => {
                if (id.includes('types.js')) {
                    return false;
                }
                return true;
            }
        }
    });

    const { output } = await bundle.generate({
        dir: outputDir,
        format: 'esm',
        sourcemap: true,
        entryFileNames: '[name].js',
        chunkFileNames: 'core.js'
    });

    console.log('2. Minifying and mangling properties with Terser...');

    let nameCache = {};
    if (fs.existsSync(nameCachePath)) {
        nameCache = JSON.parse(fs.readFileSync(nameCachePath, 'utf8'));
    }

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    for (const chunk of output) {
        if (chunk.type === 'chunk') {
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
                    /**
                     * Prevent Terser from inlining single-use functions
                     * as IIFEs. V8 allocates a new JSFunction for each
                     * IIFE call in the interpreter, causing heap churn
                     * and cache misses on hot paths.
                     */
                    reduce_funcs: false,
                },
                mangle: {
                    properties: {
                        regex: /^_/
                    }
                },
                nameCache
            });

            fs.writeFileSync(path.resolve(outputDir, chunk.fileName), minified.code);
            fs.writeFileSync(path.resolve(outputDir, `${chunk.fileName}.map`), minified.map);
        }
    }

    fs.writeFileSync(nameCachePath, JSON.stringify(nameCache, null, 2) + '\n');
    for (const typeFile of typeFiles) {
        const basename = path.basename(typeFile);
        fs.copyFileSync(typeFile, path.resolve(outputDir, basename));
    }

    console.log('Success! Outputs written to dist/, name cache saved to mangle.json.');
}

build().catch((err) => {
    console.error(err);
    process.exit(1);
});
