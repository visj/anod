import { rolldown } from 'rolldown';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const benchDir = join(__dirname, '..', 'bench', 'reactivity');
const outDir = join(__dirname, '..', 'bench', 'browser');

mkdirSync(outDir, { recursive: true });

/**
 * Browser-compatible saveRun replacement. Instead of writing to disk,
 * stores the result on window.__benchResult and calls the global
 * __onBenchDone callback so the HTML page can react.
 */
const SAVE_RUN_BROWSER = `
export function saveRun(name, raw) {
    const date = new Date().toISOString().slice(0, 10);
    const benchmarks = {};
    for (const b of raw.benchmarks) {
        const stats = b.runs[0].stats;
        const entry = {
            avg: stats.avg,
            min: stats.min,
            max: stats.max,
            p75: stats.p75,
            p99: stats.p99,
            heap: stats.heap ? stats.heap.avg : null,
        };
        benchmarks[b.alias] = entry;
    }
    const output = {
        name,
        date,
        cpu: raw.context.cpu.name,
        runtime: raw.context.runtime + ' ' + raw.context.version + ' (' + raw.context.arch + ')',
        benchmarks,
    };
    window.__benchResult = output;
    if (typeof window.__onBenchDone === 'function') {
        window.__onBenchDone(output);
    }
}
`;

/**
 * HTML template. The bundled benchmark script is loaded as a module.
 * Console output is captured and displayed in a <pre> element.
 * A download button saves the JSON result.
 */
function html(name, scriptFile) {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Benchmark: ${name}</title>
<style>
    body { font-family: monospace; background: #1a1a2e; color: #e0e0e0; margin: 2rem; }
    h1 { color: #88ccff; font-size: 1.4rem; }
    #status { color: #ffcc44; margin-bottom: 1rem; }
    #output { white-space: pre-wrap; font-size: 13px; line-height: 1.4; background: #0f0f23;
              padding: 1rem; border-radius: 6px; max-height: 80vh; overflow-y: auto; }
    button { margin-top: 1rem; padding: 0.5rem 1.5rem; font-size: 1rem; cursor: pointer;
             background: #334; color: #88ccff; border: 1px solid #556; border-radius: 4px; }
    button:hover { background: #445; }
    button:disabled { opacity: 0.4; cursor: default; }
    .ansi-red { color: #ff6b6b; } .ansi-green { color: #69db7c; }
    .ansi-yellow { color: #ffd43b; } .ansi-blue { color: #74c0fc; }
    .ansi-magenta { color: #da77f2; } .ansi-cyan { color: #66d9e8; }
    .ansi-dim { opacity: 0.5; }
</style>
</head>
<body>
<h1>${name}</h1>
<div id="status">Running benchmarks...</div>
<button id="dl" disabled>Download JSON</button>
<pre id="output"></pre>
<script>
    // Capture console.log output and render with basic ANSI color support
    const out = document.getElementById('output');
    const origLog = console.log;
    function ansiToHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/\\x1b\\[31m/g, '<span class="ansi-red">')
            .replace(/\\x1b\\[32m/g, '<span class="ansi-green">')
            .replace(/\\x1b\\[33m/g, '<span class="ansi-yellow">')
            .replace(/\\x1b\\[34m/g, '<span class="ansi-blue">')
            .replace(/\\x1b\\[35m/g, '<span class="ansi-magenta">')
            .replace(/\\x1b\\[36m/g, '<span class="ansi-cyan">')
            .replace(/\\x1b\\[90m/g, '<span class="ansi-dim">')
            .replace(/\\x1b\\[1m/g, '<span style="font-weight:bold">')
            .replace(/\\x1b\\[0m/g, '</span>');
    }
    console.log = function(...args) {
        origLog.apply(console, args);
        const line = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
        out.innerHTML += ansiToHtml(line) + '\\n';
        out.scrollTop = out.scrollHeight;
    };

    window.__onBenchDone = function(result) {
        document.getElementById('status').textContent = 'Done! ' + Object.keys(result.benchmarks).length + ' benchmarks completed.';
        document.getElementById('status').style.color = '#69db7c';
        const btn = document.getElementById('dl');
        btn.disabled = false;
        btn.onclick = function() {
            const json = JSON.stringify(result, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = result.name + '-' + result.date + '.json';
            a.click();
            URL.revokeObjectURL(url);
        };
    };
</script>
<script type="module" src="${scriptFile}" async></script>
</body>
</html>`;
}

// Discover benchmark files
const benchFiles = readdirSync(benchDir)
    .filter(f => f.endsWith('.js') && !['compare.js', 'expected.js', 'save-run.js'].includes(f))
    .map(f => join(benchDir, f));

console.log(`Bundling ${benchFiles.length} benchmarks for browser...\n`);

for (const file of benchFiles) {
    const name = basename(file, '.js');
    console.log(`  ${name}...`);

    try {
        const bundle = await rolldown({
            input: file,
            plugins: [{
                name: 'browser-shims',
                resolveId(source) {
                    if (source === './save-run.js' || source.endsWith('/save-run.js')) {
                        return '\0save-run-browser';
                    }
                    /** Stub all node: builtins so they don't leak into the browser bundle */
                    if (source.startsWith('node:') || source.startsWith('bun:')) {
                        return '\0runtime-stub:' + source;
                    }
                },
                load(id) {
                    if (id === '\0save-run-browser') {
                        return SAVE_RUN_BROWSER;
                    }
                    if (id.startsWith('\0runtime-stub:')) {
                        return 'export default {}; export const cpus = () => []; export const createRequire = () => () => null; export const spawnSync = () => ({ stdout: "" }); export const getHeapStatistics = () => ({});';
                    }
                }
            }],
        });

        const { output } = await bundle.generate({
            format: 'esm',
            codeSplitting: false,
        });

        const jsFile = `${name}.js`;
        const htmlFile = `${name}.html`;

        for (const chunk of output) {
            if (chunk.type === 'chunk') {
                writeFileSync(join(outDir, jsFile), chunk.code);
            }
        }

        writeFileSync(join(outDir, htmlFile), html(name, jsFile));
    } catch (err) {
        console.log(`    FAILED: ${err.message}`);
    }
}

console.log(`\nDone! Open files in bench/browser/*.html`);
