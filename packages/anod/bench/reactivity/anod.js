import { bench, run } from 'mitata';
import { EXPECTED, OVERRIDES_ANOD } from './expected.js';
import {
    batch,
    derive,
    watch,
    compute,
    signal
} from '../../dist/index.mjs';
import { saveRun } from './save-run.js';

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
        current = derive(current, (v) => {
            counter++;
            return v + 1;
        });
    }
    const tail = current;
    watch(tail, (v) => {
        counter++;
        sink += v;
    });
    let i = 0;
    return () => {
        head.set(++i);
    };
}

function setupBroad() {
    const head = signal(0);
    for (let i = 0; i < 50; i++) {
        const current = derive(head, (v) => {
            counter++;
            return v + i;
        });
        const current2 = derive(current, (v) => {
            counter++;
            return v + 1;
        });
        watch(current2, (v) => {
            counter++;
            sink += v;
        });
    }
    let i = 0;
    return () => {
        head.set(++i);
    };
}

function setupDiamond() {
    const width = 5;
    const head = signal(0);
    const branches = [];
    for (let i = 0; i < width; i++) {
        branches.push(derive(head, (v) => {
            counter++;
            return v + 1;
        }));
    }
    const sum = derive(c => {
        counter++;
        return branches.reduce((a, b) => a + c.read(b), 0);
    });
    watch(sum, (v) => {
        counter++;
        sink += v;
    });
    let i = 0;
    return () => {
        head.set(++i);
    };
}

function setupTriangle() {
    const width = 10;
    const head = signal(0);
    let current = head;
    const list = [];
    for (let i = 0; i < width - 1; i++) {
        list.push(current);
        current = derive(current, (v) => {
            counter++;
            return v + 1;
        });
    }
    list.push(current);
    const sum = derive(c => {
        counter++;
        return list.reduce((a, b) => a + c.read(b), 0);
    });
    watch(sum, (v) => {
        counter++;
        sink += v;
    });
    let i = 0;
    return () => {
        head.set(++i);
    };
}

function setupMux() {
    const heads = new Array(100).fill(null).map(() => signal(0));
    const mux = derive(c => {
        counter++;
        return heads.map(h => c.read(h));
    });
    const split = heads
        .map((_, index) => derive(mux, (v) => {
            counter++;
            return v[index];
        }))
        .map(x => derive(x, (v) => {
            counter++;
            return v + 1;
        }));
    for (const x of split) {
        watch(x, (v) => {
            counter++;
            sink += v;
        });
    }
    let i = 0;
    return () => {
        const idx = i % heads.length;
        heads[idx].set(++i);
    };
}

function setupUnstable() {
    const head = signal(0);
    const double = derive(head, (v) => {
        counter++;
        return v * 2;
    });
    const inverse = derive(head, (v) => {
        counter++;
        return -v;
    });
    const current = compute(c => {
        counter++;
        let result = 0;
        for (let i = 0; i < 20; i++) {
            result += c.read(head) % 2 ? c.read(double) : c.read(inverse);
        }
        return result;
    });
    watch(current, (v) => {
        counter++;
        sink += v;
    });
    let i = 0;
    return () => {
        head.set(++i);
    };
}

function setupAvoidable() {
    const head = signal(0);
    const computed1 = derive(head, (v) => {
        counter++;
        return v;
    });
    const computed2 = derive(computed1, (v) => {
        counter++;
        return 0;
    });
    const computed3 = derive(computed2, (v) => {
        counter++;
        return v + 1;
    });
    const computed4 = derive(computed3, (v) => {
        counter++;
        return v + 2;
    });
    const computed5 = derive(computed4, (v) => {
        counter++;
        return v + 3;
    });
    watch(computed5, (v) => {
        counter++;
        sink += v;
    });
    let i = 0;
    return () => {
        head.set(++i);
    };
}

function setupRepeatedObservers() {
    const size = 30;
    const head = signal(0);
    const current = derive(c => {
        counter++;
        let result = 0;
        for (let i = 0; i < size; i++) {
            result += c.read(head);
        }
        return result;
    });
    watch(current, (v) => {
        counter++;
        sink += v;
    });
    let i = 0;
    return () => {
        head.set(++i);
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
            prop1: derive(m.prop2, (v) => {
                counter++;
                return v;
            }),
            prop2: derive(c => {
                counter++;
                return c.read(m.prop1) - c.read(m.prop3);
            }),
            prop3: derive(c => {
                counter++;
                return c.read(m.prop2) + c.read(m.prop4);
            }),
            prop4: derive(m.prop3, (v) => {
                counter++;
                return v;
            }),
        };
        watch(s.prop1, (v) => { counter++; sink += v; });
        watch(s.prop2, (v) => { counter++; sink += v; });
        watch(s.prop3, (v) => { counter++; sink += v; });
        watch(s.prop4, (v) => { counter++; sink += v; });
        watch(s.prop1, (v) => { counter++; sink += v; });
        watch(s.prop2, (v) => { counter++; sink += v; });
        watch(s.prop3, (v) => { counter++; sink += v; });
        watch(s.prop4, (v) => { counter++; sink += v; });
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
    const C = derive(c => {
        counter++;
        return (c.read(A) % 2) + (c.read(B) % 2);
    });
    const D = derive(c => {
        counter++;
        return numbers.map(i => ({ x: i + (c.read(A) % 2) - (c.read(B) % 2) }));
    });
    const E = derive(c => {
        counter++;
        return hard(c.read(C) + c.read(A) + c.read(D)[0].x, 'E');
    });
    const F = compute(c => {
        counter++;
        return hard(c.read(D)[2].x || c.read(B), 'F');
    });
    const G = compute(c => {
        counter++;
        return c.read(C) + (c.read(C) || c.read(E) % 2) + c.read(D)[4].x + c.read(F);
    });
    watch(c => {
        counter++;
        sink += hard(c.read(G), 'H');
    });
    watch(c => {
        counter++;
        sink += c.read(G);
    });
    watch(c => {
        counter++;
        sink += hard(c.read(F), 'J');
    });
    let i = 0;
    return () => {
        i++;
        batch(() => {
            B.set(1);
            A.set(1 + i * 2);
        });
        batch(() => {
            A.set(2 + i * 2);
            B.set(2);
        });
    };
}

/* === Creation Benchmarks === */

function benchCreateSignals(count) {
    return () => {
        let signals = [];
        for (let i = 0; i < count; i++) {
            signals[i] = signal(i);
        }
        return signals;
    };
}

function benchCreateComputations(count) {
    return () => {
        const src = signal(0);
        for (let i = 0; i < count; i++) {
            const comp = derive(c => {
                counter++;
                return c.read(src);
            });
            watch(c => {
                counter++;
                sink += c.read(comp);
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
 * Build a rectangular reactive dependency graph.
 * Static nodes use derive() (stable). Dynamic nodes use compute() for conditional reads.
 * @param {number} width
 * @param {number} totalLayers
 * @param {number} staticFraction - fraction of static nodes [0, 1]
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
                row[myDex] = derive(c => {
                    counter++;
                    let sum = 0;
                    for (let s = 0; s < mySources.length; s++) {
                        sum += c.read(mySources[s]);
                    }
                    return sum;
                });
            } else {
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
 * Benchmark graph construction: each mitata call builds a fresh graph and
 * reads all leaves to force materialization (so lazy frameworks do the same
 * work as push frameworks).
 */
function setupDynBuild(width, totalLayers, staticFraction, nSources) {
    return () => {
        const { layers } = makeDynGraph(width, totalLayers, staticFraction, nSources);
        const leaves = layers[layers.length - 1];
        for (let r = 0; r < leaves.length; r++) {
            sink += leaves[r].val();
        }
    };
}

/**
 * Benchmark graph propagation: setup builds the graph and force-reads all
 * leaves (materializing for lazy frameworks). The runner then writes one
 * source and reads selected leaves — measuring pure propagation cost.
 */
function setupDynUpdate(width, totalLayers, staticFraction, nSources, readFraction) {
    const { sources, layers } = makeDynGraph(width, totalLayers, staticFraction, nSources);
    const leaves = layers[layers.length - 1];
    /** Force-read ALL leaves so lazy frameworks fully materialize the graph. */
    for (let r = 0; r < leaves.length; r++) {
        sink += leaves[r].val();
    }
    const rand = pseudoRandom('seed');
    const skipCount = Math.round(leaves.length * (1 - readFraction));
    const readLeaves = removeElems(leaves, skipCount, rand);
    const readLen = readLeaves.length;
    const srcLen = sources.length;
    /** Persistent counter across mitata calls so each write triggers propagation. */
    let iter = 0;
    return () => {
        iter++;
        const sourceDex = iter % srcLen;
        sources[sourceDex].set(iter + sourceDex);
        for (let r = 0; r < readLen; r++) {
            sink += readLeaves[r].val();
        }
    };
}

/* === Validation === */

/**
 * Run each benchmark once and verify the counter matches the expected value.
 * Uses OVERRIDES_ANOD for push-model differences (unstable, molWire).
 */
function validate(name, setupFn) {
    const expected = OVERRIDES_ANOD[name] ?? EXPECTED[name];
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

bench('Kairo: deep propagation', setupDeep());
bench('Kairo: broad propagation', setupBroad());
bench('Kairo: diamond', setupDiamond());
bench('Kairo: triangle', setupTriangle());
bench('Kairo: mux', setupMux());
bench('Kairo: unstable', setupUnstable());
bench('Kairo: avoidable propagation', setupAvoidable());
bench('Kairo: repeated observers', setupRepeatedObservers());
bench('CellX 10 layers', setupCellx(10));
bench('$mol_wire', setupMolWire());
bench('Create 1k signals', benchCreateSignals(1_000));
bench('Create 1k computations', benchCreateComputations(1_000));

bench('Dynamic build: simple component', setupDynBuild(10, 5, 1, 2));
bench('Dynamic build: large web app', setupDynBuild(1000, 12, 0.95, 4));
bench('Dynamic build: wide dense', setupDynBuild(1000, 5, 1, 25));
bench('Dynamic update: simple component', setupDynUpdate(10, 5, 1, 2, 0.2));
bench('Dynamic update: dynamic component', setupDynUpdate(10, 10, 0.75, 6, 0.2));
bench('Dynamic update: large web app', setupDynUpdate(1000, 12, 0.95, 4, 1));
bench('Dynamic update: wide dense', setupDynUpdate(1000, 5, 1, 25, 1));
bench('Dynamic update: deep', setupDynUpdate(5, 500, 1, 3, 1));
bench('Dynamic update: very dynamic', setupDynUpdate(100, 15, 0.5, 6, 1));

const results = await run();

saveRun('anod', results);
