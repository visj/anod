import esbuild from 'rollup-plugin-esbuild'

export default {
    input: 'src/zorn.ts',
    output: [
        {
            file: 'dist/zorn.cjs',
            format: 'cjs',
        },
        {
            file: 'dist/zorn.mjs',
            format: 'esm',
        },
        {
            file: 'dist/zorn.iife.js',
            format: 'iife',
            name: 'Zorn',
        }
    ],
    plugins: [
        esbuild({
            minify: process.env.NODE_ENV === 'production',
            target: 'es2015',
        }),
    ],
}