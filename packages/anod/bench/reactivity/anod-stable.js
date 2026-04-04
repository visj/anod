import { bench, group, run } from 'mitata';
import { EXPECTED, OVERRIDES_ANOD_STABLE } from './expected.js';
import {
    batch,
    compute,
    signal,
    Signal,
    OPT_STABLE,
    OPT_NOTIFY
} from '../../dist/index.mjs';

let sink = 0;
let counter = 0;

const fib = (n) => {
    if (n < 2) return 1;
    return fib(n - 1) + fib(n - 2);
};
const hard = (n, _log) => n + fib(16);

/* === Kairo Benchmarks === */

function setupDeep() {
    const len = 50;
    const head = signal(0);
    let current = head;
    for (let i = 0; i < len; i++) {
        const prev = current;
        current = prev.derive((_, val) => { counter++; return val + 1; }, 0, OPT_NOTIFY);
    }
    current.watch((_, val) => {
        counter++;
        sink += val;
    });
    let i = 0;
    return () => {
        batch(() => { head.set(++i); });
    };
}

function setupBroad() {
    const head = signal(0);
    for (let i = 0; i < 50; i++) {
        const current = head.derive((_, val) => { counter++; return val + i; }, 0, OPT_NOTIFY);
        const current2 = current.derive((_, val) => { counter++; return val + 1; }, 0, OPT_NOTIFY);
        current2.watch((_, val) => {
            counter++;
            sink += val;
        });
    }
    let i = 0;
    return () => {
        batch(() => { head.set(++i); });
    };
}

function setupDiamond() {
    const width = 5;
    const head = signal(0);
    const branches = [];
    for (let i = 0; i < width; i++) {
        branches.push(head.derive((_, val) => { counter++; return val + 1; }, 0, OPT_NOTIFY));
    }
    /** Deps are always the same `width` branches; OPT_STABLE freezes after setup. */
    const sum = compute(c => { counter++; return branches.reduce((a, b) => a + c.read(b), 0); }, 0, OPT_STABLE | OPT_NOTIFY);
    sum.watch((_, val) => {
        counter++;
        sink += val;
    });
    let i = 0;
    return () => {
        batch(() => { head.set(++i); });
    };
}

function setupTriangle() {
    const width = 10;
    const head = signal(0);
    let current = head;
    const list = [];
    for (let i = 0; i < width - 1; i++) {
        const prev = current;
        list.push(current);
        current = prev.derive((_, val) => { counter++; return val + 1; }, 0, OPT_NOTIFY);
    }
    list.push(current);
    /** Deps are always the same `width` nodes in `list`; OPT_STABLE freezes after setup. */
    const sum = compute(c => { counter++; return list.reduce((a, b) => a + c.read(b), 0); }, 0, OPT_STABLE | OPT_NOTIFY);
    sum.watch((_, val) => {
        counter++;
        sink += val;
    });
    let i = 0;
    return () => {
        batch(() => { head.set(++i); });
    };
}

function setupMux() {
    const heads = new Array(100).fill(null).map(() => signal(0));
    /** Deps are always the same 100 heads; OPT_STABLE freezes after setup. */
    const mux = compute(c => { counter++; return heads.map(h => c.read(h)); }, null, OPT_STABLE | OPT_NOTIFY);
    const split = heads
        .map((_, index) => mux.derive((_, val) => { counter++; return val[index]; }))
        .map(x => x.derive((_, val) => { counter++; return val + 1; }, 0, OPT_NOTIFY));
    for (const x of split) {
        x.watch((_, val) => {
            counter++;
            sink += val;
        });
    }
    let i = 0;
    return () => {
        const idx = i % heads.length;
        batch(() => { heads[idx].set(++i); });
    };
}

function setupUnstable() {
    const head = signal(0);
    const double = head.derive((_, val) => { counter++; return val * 2; }, 0, OPT_NOTIFY);
    const inverse = head.derive((_, val) => { counter++; return -val; }, 0, OPT_NOTIFY);
    /** Deps switch between `double` and `inverse` per parity; cannot be made stable. */
    const current = compute(c => {
        counter++;
        let result = 0;
        for (let i = 0; i < 20; i++) {
            result += c.read(head) % 2 ? c.read(double) : c.read(inverse);
        }
        return result;
    });
    current.watch((_, val) => {
        counter++;
        sink += val;
    });
    let i = 0;
    return () => {
        batch(() => { head.set(++i); });
    };
}

function setupAvoidable() {
    const head = signal(0);
    const computed1 = head.derive((_, val) => { counter++; return val; }, 0, OPT_NOTIFY);
    const computed2 = computed1.derive(() => { counter++; return 0; });
    const computed3 = computed2.derive((_, val) => { counter++; return val + 1; }, 0, OPT_NOTIFY);
    const computed4 = computed3.derive((_, val) => { counter++; return val + 2; }, 0, OPT_NOTIFY);
    const computed5 = computed4.derive((_, val) => { counter++; return val + 3; }, 0, OPT_NOTIFY);
    computed5.watch((_, val) => {
        counter++;
        sink += val;
    });
    let i = 0;
    return () => {
        batch(() => { head.set(++i); });
    };
}

function setupRepeatedObservers() {
    const size = 30;
    const head = signal(0);
    const current = head.derive((_, val) => {
        counter++;
        let result = 0;
        for (let i = 0; i < size; i++) {
            result += val;
        }
        return result;
    }, 0, OPT_NOTIFY);
    current.watch((_, val) => {
        counter++;
        sink += val;
    });
    let i = 0;
    return () => {
        batch(() => { head.set(++i); });
    };
}

/* === CellX Benchmark === */

function setupCellx(layers) {
    const start = {
        prop1: signal(1),
        prop2: signal(2),
        prop3: signal(3),
        prop4: signal(4),
    };
    let layer = start;
    for (let i = layers; i > 0; i--) {
        const m = layer;
        const s = {
            prop1: m.prop2.derive((_, val) => { counter++; return val; }, 0, OPT_NOTIFY),
            /** Two deps; OPT_STABLE tracks them on first run then freezes. */
            prop2: compute(c => { counter++; return c.read(m.prop1) - c.read(m.prop3); }, 0, OPT_STABLE),
            prop3: compute(c => { counter++; return c.read(m.prop2) + c.read(m.prop4); }, 0, OPT_STABLE),
            prop4: m.prop3.derive((_, val) => { counter++; return val; }, 0, OPT_NOTIFY),
        };
        s.prop1.watch((_, val) => { counter++; sink += val; });
        s.prop2.watch((_, val) => { counter++; sink += val; });
        s.prop3.watch((_, val) => { counter++; sink += val; });
        s.prop4.watch((_, val) => { counter++; sink += val; });
        s.prop1.watch((_, val) => { counter++; sink += val; });
        s.prop2.watch((_, val) => { counter++; sink += val; });
        s.prop3.watch((_, val) => { counter++; sink += val; });
        s.prop4.watch((_, val) => { counter++; sink += val; });
        layer = s;
    }
    const end = layer;
    let toggle = false;
    return () => {
        toggle = !toggle;
        batch(() => {
            start.prop1.set(toggle ? 4 : 1);
            start.prop2.set(toggle ? 3 : 2);
            start.prop3.set(toggle ? 2 : 3);
            start.prop4.set(toggle ? 1 : 4);
        });
        end.prop1.val();
        end.prop2.val();
        end.prop3.val();
        end.prop4.val();
    };
}

/* === $mol_wire Benchmark === */

function setupMolWire() {
    const numbers = Array.from({ length: 5 }, (_, i) => i);
    const A = signal(0);
    const B = signal(0);
    /** C, D and E always read the same deps; OPT_STABLE freezes after setup. */
    const C = compute(c => { counter++; return (c.read(A) % 2) + (c.read(B) % 2); }, 0, OPT_STABLE);
    const D = compute(c => {
        counter++;
        return numbers.map(i => ({ x: i + (c.read(A) % 2) - (c.read(B) % 2) }));
    }, null, OPT_STABLE | OPT_NOTIFY);
    const E = compute(c => { counter++; return hard(c.read(C) + c.read(A) + c.read(D)[0].x, 'E'); }, 0, OPT_STABLE);
    /** F and G have conditional reads; dynamic tracking required. */
    const F = compute(c => { counter++; return hard(c.read(D)[2].x || c.read(B), 'F'); });
    const G = compute(c => {
        counter++;
        return c.read(C) + (c.read(C) || c.read(E) % 2) + c.read(D)[4].x + c.read(F);
    });
    G.watch((_, val) => {
        counter++;
        sink += hard(val, 'H');
    });
    G.watch((_, val) => {
        counter++;
        sink += val;
    });
    F.watch((_, val) => {
        counter++;
        sink += hard(val, 'J');
    });
    let i = 0;
    return () => {
        i++;
        batch(() => { B.set(1); A.set(1 + i * 2); });
        batch(() => { A.set(2 + i * 2); B.set(2); });
    };
}

/* === Creation Benchmarks === */

function benchCreateSignals(count) {
    return () => {
        let signals = [];
        for (let i = 0; i < count; i++) {
            signals[i] = new Signal(i);
        }
        return signals;
    };
}

function benchCreateComputations(count) {
    return () => {
        const src = signal(0);
        for (let i = 0; i < count; i++) {
            const comp = src.derive((_, val) => { counter++; return val; });
            comp.watch((_, val) => {
                counter++;
                sink += val;
            });
        }
    };
}

/* === Dynamic Graph Benchmarks === */

/**
 * Seeded PRNG using xmur3a hash + sfc32.
 * Adapted from https://github.com/bryc/code/blob/master/jshash/PRNGs.md (Public Domain)
 * @param {string} seed
 * @returns {() => number} returns values in [0, 1)
 */
function pseudoRandom(seed) {
    let h = 2166136261 >>> 0;
    for (let k, i = 0; i < seed.length; i++) {
        k = Math.imul(seed.charCodeAt(i), 3432918353);
        k = (k << 15) | (k >>> 17);
        h ^= Math.imul(k, 461845907);
        h = (h << 13) | (h >>> 19);
        h = (Math.imul(h, 5) + 3864292196) | 0;
    }
    h ^= seed.length;
    function nextHash() {
        h ^= h >>> 16;
        h = Math.imul(h, 2246822507);
        h ^= h >>> 13;
        h = Math.imul(h, 3266489909);
        h ^= h >>> 16;
        return h >>> 0;
    }
    let a = nextHash(), b = nextHash(), c = nextHash(), d = nextHash();
    return function () {
        a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
        let t = (a + b) | 0;
        a = b ^ (b >>> 9);
        b = (c + (c << 3)) | 0;
        c = (c << 21) | (c >>> 11);
        d = (d + 1) | 0;
        t = (t + d) | 0;
        c = (c + t) | 0;
        return (t >>> 0) / 4294967296;
    };
}

/** @param {any[]} src @param {number} rmCount @param {() => number} rand */
function removeElems(src, rmCount, rand) {
    const copy = src.slice();
    for (let i = 0; i < rmCount; i++) {
        const rmDex = Math.floor(rand() * copy.length);
        copy.splice(rmDex, 1);
    }
    return copy;
}

/**
 * Build a rectangular reactive dependency graph with anod-stable optimizations.
 * Static single-dep nodes use .derive() for bound computes.
 * Static multi-dep nodes use OPT_STABLE to freeze deps after first run.
 * All static nodes use OPT_NOTIFY since their sum always changes.
 * Dynamic nodes cannot use OPT_STABLE (deps vary based on value).
 * @param {number} width
 * @param {number} totalLayers
 * @param {number} staticFraction
 * @param {number} nSources
 */
function makeDynGraph(width, totalLayers, staticFraction, nSources) {
    const sources = new Array(width);
    for (let i = 0; i < width; i++) {
        sources[i] = signal(i);
    }
    const random = pseudoRandom('seed');
    let prevRow = sources;
    const layers = [];
    for (let l = 0; l < totalLayers - 1; l++) {
        const row = new Array(width);
        for (let myDex = 0; myDex < width; myDex++) {
            const mySources = new Array(nSources);
            for (let s = 0; s < nSources; s++) {
                mySources[s] = prevRow[(myDex + s) % width];
            }
            if (random() < staticFraction) {
                if (nSources === 1) {
                    /** Single dep: use bound .derive() for maximum efficiency. */
                    row[myDex] = mySources[0].derive((_, val) => { counter++; return val; }, 0, OPT_NOTIFY);
                } else {
                    /** Multiple fixed deps: OPT_STABLE freezes after first run. */
                    row[myDex] = compute(c => {
                        counter++;
                        let sum = 0;
                        for (let s = 0; s < mySources.length; s++) {
                            sum += c.read(mySources[s]);
                        }
                        return sum;
                    }, 0, OPT_STABLE | OPT_NOTIFY);
                }
            } else {
                /** Dynamic node: deps vary on value, cannot use OPT_STABLE. */
                const first = mySources[0];
                const tail = mySources.slice(1);
                row[myDex] = compute(c => {
                    counter++;
                    let sum = c.read(first);
                    const shouldDrop = sum & 0x1;
                    const dropDex = sum % tail.length;
                    for (let i = 0; i < tail.length; i++) {
                        if (shouldDrop && i === dropDex) {
                            continue;
                        }
                        sum += c.read(tail[i]);
                    }
                    return sum;
                });
            }
        }
        layers.push(row);
        prevRow = row;
    }
    return { sources, layers };
}

/**
 * Build a fresh graph and return a function that reads all leaves to force materialization.
 * Measures graph construction + initial evaluation cost.
 * @param {number} width
 * @param {number} totalLayers
 * @param {number} staticFraction
 * @param {number} nSources
 */
function setupDynBuild(width, totalLayers, staticFraction, nSources) {
    return () => {
        const { layers } = makeDynGraph(width, totalLayers, staticFraction, nSources);
        const leaves = layers[layers.length - 1];
        const len = leaves.length;
        for (let r = 0; r < len; r++) {
            sink += leaves[r].val();
        }
    };
}

/**
 * Build the graph once, force-read all leaves to materialize, then return a
 * function that writes one source and reads selected leaves per call.
 * @param {number} width
 * @param {number} totalLayers
 * @param {number} staticFraction
 * @param {number} nSources
 * @param {number} readFraction
 */
function setupDynUpdate(width, totalLayers, staticFraction, nSources, readFraction) {
    const { sources, layers } = makeDynGraph(width, totalLayers, staticFraction, nSources);
    const leaves = layers[layers.length - 1];
    const allLen = leaves.length;
    /** Force-read all leaves so lazy frameworks fully materialize the graph. */
    for (let r = 0; r < allLen; r++) {
        sink += leaves[r].val();
    }
    const rand = pseudoRandom('seed');
    const skipCount = Math.round(allLen * (1 - readFraction));
    const readLeaves = removeElems(leaves, skipCount, rand);
    const readLen = readLeaves.length;
    const srcLen = sources.length;
    /** Persistent counter across mitata calls so each write triggers propagation. */
    let iter = 0;
    return () => {
        iter++;
        const sourceDex = iter % srcLen;
        batch(() => {
            sources[sourceDex].set(iter + sourceDex);
        });
        for (let r = 0; r < readLen; r++) {
            readLeaves[r].val();
        }
    };
}

/* === Validation === */

function validate(name, setupFn) {
    const expected = OVERRIDES_ANOD_STABLE[name] ?? EXPECTED[name];
    const run = setupFn();
    counter = 0;
    run();
    if (counter !== expected) {
        throw new Error(`"${name}": expected counter=${expected}, got ${counter}`);
    }
    counter = 0;
}

validate('deep', setupDeep);
validate('broad', setupBroad);
validate('diamond', setupDiamond);
validate('triangle', setupTriangle);
validate('mux', setupMux);
validate('unstable', setupUnstable);
validate('avoidable', setupAvoidable);
validate('repeatedObservers', setupRepeatedObservers);
validate('cellx10', () => setupCellx(10));
validate('molWire', setupMolWire);
validate('createComputations1k', () => benchCreateComputations(1000));
validate('dynBuildSimple', () => setupDynBuild(10, 5, 1, 2));
validate('dynBuildLargeWebApp', () => setupDynBuild(1000, 12, 0.95, 4));
validate('dynUpdateSimple', () => setupDynUpdate(10, 5, 1, 2, 0.2));
validate('dynUpdateDynamic', () => setupDynUpdate(10, 10, 0.75, 6, 0.2));
validate('dynUpdateLargeWebApp', () => setupDynUpdate(1000, 12, 0.95, 4, 1));
validate('dynUpdateWideDense', () => setupDynUpdate(1000, 5, 1, 25, 1));
validate('dynUpdateDeep', () => setupDynUpdate(5, 500, 1, 3, 1));
validate('dynUpdateVeryDynamic', () => setupDynUpdate(100, 15, 0.5, 6, 1));

/* === Run === */

group('Kairo: deep propagation', () => { bench('anod stable', setupDeep()); });
group('Kairo: broad propagation', () => { bench('anod stable', setupBroad()); });
group('Kairo: diamond', () => { bench('anod stable', setupDiamond()); });
group('Kairo: triangle', () => { bench('anod stable', setupTriangle()); });
group('Kairo: mux', () => { bench('anod stable', setupMux()); });
group('Kairo: unstable', () => { bench('anod stable', setupUnstable()); });
group('Kairo: avoidable propagation', () => { bench('anod stable', setupAvoidable()); });
group('Kairo: repeated observers', () => { bench('anod stable', setupRepeatedObservers()); });
group('CellX 10 layers', () => { bench('anod stable', setupCellx(10)); });
group('$mol_wire', () => { bench('anod stable', setupMolWire()); });
group('Create 1k signals', () => { bench('anod stable', benchCreateSignals(1_000)); });
group('Create 1k computations', () => { bench('anod stable', benchCreateComputations(1_000)); });

group('Dynamic build: simple component', () => { bench('anod stable', setupDynBuild(10, 5, 1, 2)); });
group('Dynamic build: large web app', () => { bench('anod stable', setupDynBuild(1000, 12, 0.95, 4)); });
group('Dynamic build: wide dense', () => { bench('anod stable', setupDynBuild(1000, 5, 1, 25)); });
group('Dynamic update: simple component', () => { bench('anod stable', setupDynUpdate(10, 5, 1, 2, 0.2)); });
group('Dynamic update: dynamic component', () => { bench('anod stable', setupDynUpdate(10, 10, 0.75, 6, 0.2)); });
group('Dynamic update: large web app', () => { bench('anod stable', setupDynUpdate(1000, 12, 0.95, 4, 1)); });
group('Dynamic update: wide dense', () => { bench('anod stable', setupDynUpdate(1000, 5, 1, 25, 1)); });
group('Dynamic update: deep', () => { bench('anod stable', setupDynUpdate(5, 500, 1, 3, 1)); });
group('Dynamic update: very dynamic', () => { bench('anod stable', setupDynUpdate(100, 15, 0.5, 6, 1)); });

await run();

console.log(sink, counter);
