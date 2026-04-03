import fs from 'fs';
import path from 'path';
import { rolldown } from 'rolldown';
import { minify } from 'terser';

const outputDir = './dist';
/** Load signal's stable property map so underscore-prefixed properties mangle identically */
const signalManglePath = path.resolve('../anod/dist/mangle.json');
const nameCachePath = path.resolve(outputDir, 'mangle.json');

async function build() {
    console.log('1. Bundling with Rolldown...');

    const bundle = await rolldown({
        input: {
            index: './src/list.js',
        },
        external: [
            'anod',
            'anod/internal',
        ],
    });

    const { output } = await bundle.generate({
        dir: outputDir,
        format: 'esm',
        sourcemap: true,
        entryFileNames: '[name].mjs',
    });

    console.log('2. Minifying and mangling properties with Terser...');

    /**
     * Load signal's mangle.json as the starting nameCache.
     * This ensures all _-prefixed properties (e.g. _value, _flag, _state)
     * get the exact same mangled names as the signal package.
     */
    let nameCache = {};
    if (fs.existsSync(signalManglePath)) {
        nameCache = JSON.parse(fs.readFileSync(signalManglePath, 'utf8'));
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

    /** Save the combined property map (signal's entries + any new list-specific ones) */
    fs.writeFileSync(nameCachePath, JSON.stringify(nameCache, null, 2));

    console.log('Success! Output written to dist/');
}

build().catch(console.error);
