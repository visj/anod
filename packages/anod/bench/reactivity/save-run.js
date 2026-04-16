import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Extract meaningful benchmark data from mitata's run() output and save as JSON.
 * @param {string} name - Library name (e.g. 'anod', 'alien-signals')
 * @param {object} raw - The object returned by mitata's run()
 */
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
        if (stats.counters) {
            const c = stats.counters;
            entry.cycles = c.cycles ? c.cycles.avg : null;
            entry.instructions = c.instructions ? c.instructions.avg : null;
            entry.stalls = c.cycles && c.cycles.stalls ? c.cycles.stalls.avg : null;
            entry.l1HitRate = c.l1 ? 1 - ((c.l1.miss_loads ? c.l1.miss_loads.avg : 0) + (c.l1.miss_stores ? c.l1.miss_stores.avg : 0)) / (c.instructions ? c.instructions.avg : 1) : null;
        }
        benchmarks[b.alias] = entry;
    }
    const output = {
        name,
        date,
        cpu: raw.context.cpu.name,
        runtime: `${raw.context.runtime} ${raw.context.version} (${raw.context.arch})`,
        benchmarks,
    };
    const filename = `${name}-${date}.json`;
    const filepath = join(__dirname, 'runs', filename);
    writeFileSync(filepath, JSON.stringify(output, null, 2) + '\n');
    console.log(`Saved run to ${filepath}`);
}
