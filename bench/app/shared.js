/**
 * Shared spec for the app benchmark: a list view of ROWS rows, the way a
 * typical component tree uses signals.
 *
 * Per row (state, owned by a store):
 *   label, count, done            signals
 * Per row (view, owned by the row component):
 *   text     = label + count       compute, 2 deps
 *   visible  = filter, done        compute, 1-2 deps (done is read only when filtered)
 *   selected = is this row selected: the library's selector (Solid's
 *              createProjection, a hand-written keyed selector in anod
 *              and alien-signals), so a select reruns two rows. The
 *              "no selector" scenario uses a compute per row instead:
 *              selectedId === id, 1 dep on a signal every row shares
 *   cls      = selected + theme    compute, 2 deps
 *   DOM writes: textContent <- text, hidden <- visible, className <- cls,
 *   checked <- done (single dep each), title <- text + selected (2 deps)
 * App level:
 *   doneCount = every row's done  compute, ROWS deps
 *   footer <- doneCount           DOM write
 *   persist <- filter             app side effect
 *
 * Every suite builds this exact graph and must report the same number of
 * compute and effect runs per scenario (see EXPECTED). The selector's own
 * run is not counted: it is a projection in Solid and an effect in the
 * others.
 */
import { Session } from 'inspector/promises';

export const ROWS = 1000;
export const REMOUNT = 100;
export const BATCH = 10;

export const FILTERS = ['all', 'done', 'open'];

/** Two labels per row, so an edit always changes the value without allocating. */
export const LABELS_A = Array.from({ length: ROWS }, (_, i) => 'Row ' + i);
export const LABELS_B = Array.from({ length: ROWS }, (_, i) => 'Row ' + i + ' edited');

/** @returns {{ textContent: string, hidden: boolean, className: string, checked: boolean, title: string }} */
export function makeEl() {
    return { textContent: '', hidden: false, className: '', checked: false, title: '' };
}

export function makeEls(n) {
    const els = new Array(n);
    for (let i = 0; i < n; i++) {
        els[i] = makeEl();
    }
    return els;
}

/** Initial state of row i. */
export function initialDone(i) {
    return i % 3 === 0;
}

/**
 * Compute and effect runs for one iteration of each scenario, after
 * warm-up. Filled in from a run of every suite; a suite that does
 * different work fails its validation.
 */
export const EXPECTED = {
    'Mount + unmount 1k rows': { computes: 3001, effects: 5002 },
    'Edit one row': { computes: 1, effects: 2 },
    'Toggle one row': { computes: 1, effects: 2 },
    'Select a row': { computes: 2, effects: 4 },
    'Select a row, no selector': { computes: 1002, effects: 4 },
    'Edit 10 rows in a batch': { computes: 10, effects: 20 },
    'Change filter': { computes: 1000, effects: 1001 },
    'Change theme': { computes: 1000, effects: 1000 },
    'Remount 100 rows': { computes: 300, effects: 500 },
};

/**
 * Runs each scenario's iteration a few times, then checks one iteration's
 * counts against EXPECTED. With no EXPECTED entry, prints what it saw.
 * @param {string} lib
 * @param {Object<string, function(): void>} scenarios
 * @param {function(): {computes: number, effects: number}} take - returns and resets the counters
 */
export function validate(lib, scenarios, take) {
    const seen = {};
    let failed = false;
    for (const name in scenarios) {
        const run = scenarios[name];
        for (let i = 0; i < 4; i++) {
            run();
        }
        take();
        run();
        const got = take();
        seen[name] = got;
        const want = EXPECTED[name];
        if (want !== null && (want.computes !== got.computes || want.effects !== got.effects)) {
            console.error(`${lib}: "${name}" expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
            failed = true;
        }
    }
    console.log(`COUNTS ${lib} ${JSON.stringify(seen)}`);
    if (failed) {
        throw new Error(`${lib}: work differs from the spec`);
    }
}

/**
 * Bytes allocated per iteration of each scenario, from V8's sampling heap
 * profiler. Unlike mitata's heap column, which diffs heapUsed around each
 * sample, it counts objects that a garbage collection has already freed,
 * so a collection inside the measurement does not hide what a library
 * allocates. A short first pass estimates the rate, then each scenario
 * runs for about TARGET bytes, so the sample count is similar for heavy
 * and light scenarios.
 * @param {Object<string, function(): void>} scenarios
 * @returns {Promise<Object<string, number>>}
 */
export async function measureAlloc(scenarios) {
    const TARGET = 8 * 1024 * 1024;
    const INTERVAL = 128;
    const session = new Session();
    session.connect();
    await session.post('HeapProfiler.enable');
    const sample = async (run, iterations, interval) => {
        await session.post('HeapProfiler.startSampling', {
            samplingInterval: interval,
            includeObjectsCollectedByMajorGC: true,
            includeObjectsCollectedByMinorGC: true,
        });
        for (let i = 0; i < iterations; i++) {
            run();
        }
        const { profile } = await session.post('HeapProfiler.stopSampling');
        /** selfSize is scaled up for the sampling rate; sample sizes are not. */
        let bytes = 0;
        const stack = [profile.head];
        while (stack.length > 0) {
            const node = stack.pop();
            bytes += node.selfSize;
            for (const child of node.children) {
                stack.push(child);
            }
        }
        return bytes / iterations;
    };
    const alloc = {};
    for (const name in scenarios) {
        const run = scenarios[name];
        const estimate = await sample(run, 20, 4096);
        const iterations = Math.max(20, Math.min(20000, Math.round(TARGET / Math.max(estimate, 1))));
        alloc[name] = await sample(run, iterations, INTERVAL);
    }
    await session.post('HeapProfiler.disable');
    session.disconnect();
    return alloc;
}

/**
 * Prints the bytes allocated per iteration of each scenario.
 * @param {string} lib
 * @param {Object<string, number>} alloc
 */
export function printAlloc(lib, alloc) {
    console.log(`\nallocated per iteration (${lib}):`);
    for (const name in alloc) {
        const b = alloc[name];
        const text = b >= 1024 * 1024 ? (b / 1024 / 1024).toFixed(2) + ' MB' : b >= 1024 ? (b / 1024).toFixed(1) + ' KB' : b.toFixed(0) + ' B';
        console.log(`  ${name.padEnd(28)} ${text.padStart(10)}`);
    }
}
