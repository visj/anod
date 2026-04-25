import { bench, run } from 'mitata';
import { EXPECTED } from './expected.js';
import { signal, c, batch } from '../../dist/index.js';
import { saveRun } from './save-run.js';

let sink = 0;
let counter = 0;

const fib = (n) => {
    if (n < 2) {
        return 1;
    }
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
        current = c.compute(prev, val => {
            counter++;
            return val + 1;
        });
    }
    const tail = current;
    c.effect(tail, val => {
        counter++;
        sink += val;
    });
    let i = 0;
    return () => {
        head.set(++i);
    };
}

function setupBroad() {
    const head = signal(0);
    for (let i = 0; i < 50; i++) {
        const current = c.compute(head, val => {
            counter++;
            return val + i;
        });
        const current2 = c.compute(current, val => {
            counter++;
            return val + 1;
        });
        c.effect(current2, val => {
            counter++;
            sink += val;
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
        branches.push(c.compute(head, val => {
            counter++;
            return val + 1;
        }));
    }
    const sum = c.compute(cx => {
        counter++;
        return branches.reduce((a, b) => a + cx.val(b), 0);
    });
    c.effect(sum, val => {
        counter++;
        sink += val;
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
        const prev = current;
        current = c.compute(prev, val => {
            counter++;
            return val + 1;
        });
    }
    list.push(current);
    const sum = c.compute(cx => {
        counter++;
        return list.reduce((a, b) => a + cx.val(b), 0);
    });
    c.effect(sum, val => {
        counter++;
        sink += val;
    });
    let i = 0;
    return () => {
        head.set(++i);
    };
}

function setupMux() {
    const heads = new Array(100).fill(null).map(() => signal(0));
    const mux = c.compute(cx => {
        counter++;
        return heads.map(h => cx.val(h));
    });
    const split = heads
        .map((_, index) => c.compute(mux, val => {
            counter++;
            return val[index];
        }))
        .map(x => c.compute(x, val => {
            counter++;
            return val + 1;
        }));
    for (const x of split) {
        c.effect(x, val => {
            counter++;
            sink += val;
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
    const double = c.compute(head, val => {
        counter++;
        return val * 2;
    });
    const inverse = c.compute(head, val => {
        counter++;
        return -val;
    });
    const current = c.compute(cx => {
        counter++;
        let result = 0;
        for (let i = 0; i < 20; i++) {
            result += cx.val(head) % 2 ? cx.val(double) : cx.val(inverse);
        }
        return result;
    });
    c.effect(current, val => {
        counter++;
        sink += val;
    });
    let i = 0;
    return () => {
        head.set(++i);
    };
}

function setupAvoidable() {
    const head = signal(0);
    const computed1 = c.compute(head, val => {
        counter++;
        return val;
    });
    const computed2 = c.compute(computed1, val => {
        counter++;
        return 0;
    });
    const computed3 = c.compute(computed2, val => {
        counter++;
        return val + 1;
    });
    const computed4 = c.compute(computed3, val => {
        counter++;
        return val + 2;
    });
    const computed5 = c.compute(computed4, val => {
        counter++;
        return val + 3;
    });
    c.effect(computed5, val => {
        counter++;
        sink += val;
    });
    let i = 0;
    return () => {
        head.set(++i);
    };
}

function setupRepeatedObservers() {
    const size = 30;
    const head = signal(0);
    const current = c.compute(head, val => {
        counter++;
        let result = 0;
        for (let i = 0; i < size; i++) {
            result += val;
        }
        return result;
    });
    c.effect(current, val => {
        counter++;
        sink += val;
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
            prop1: c.compute(m.prop2, val => {
                counter++;
                return val;
            }),
            prop2: c.compute(cx => {
                counter++;
                return cx.val(m.prop1) - cx.val(m.prop3);
            }),
            prop3: c.compute(cx => {
                counter++;
                return cx.val(m.prop2) + cx.val(m.prop4);
            }),
            prop4: c.compute(m.prop3, val => {
                counter++;
                return val;
            }),
        };
        c.effect(s.prop1, val => { counter++; sink += val; });
        c.effect(s.prop2, val => { counter++; sink += val; });
        c.effect(s.prop3, val => { counter++; sink += val; });
        c.effect(s.prop4, val => { counter++; sink += val; });
        c.effect(s.prop1, val => { counter++; sink += val; });
        c.effect(s.prop2, val => { counter++; sink += val; });
        c.effect(s.prop3, val => { counter++; sink += val; });
        c.effect(s.prop4, val => { counter++; sink += val; });
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
        end.prop1.get();
        end.prop2.get();
        end.prop3.get();
        end.prop4.get();
    };
}

/* === $mol_wire Benchmark === */

function setupMolWire() {
    const numbers = Array.from({ length: 5 }, (_, i) => i);
    const A = signal(0);
    const B = signal(0);
    const C = c.compute(cx => {
        counter++;
        return (cx.val(A) % 2) + (cx.val(B) % 2);
    });
    const D = c.compute(cx => {
        counter++;
        return numbers.map(i => ({ x: i + (cx.val(A) % 2) - (cx.val(B) % 2) }));
    });
    const E = c.compute(cx => {
        counter++;
        return hard(cx.val(C) + cx.val(A) + cx.val(D)[0].x, 'E');
    });
    const F = c.compute(cx => {
        counter++;
        return hard(cx.val(D)[2].x || cx.val(B), 'F');
    });
    const G = c.compute(cx => {
        counter++;
        return cx.val(C) + (cx.val(C) || cx.val(E) % 2) + cx.val(D)[4].x + cx.val(F);
    });
    c.effect(G, val => {
        counter++;
        sink += hard(val, 'H');
    });
    c.effect(G, val => {
        counter++;
        sink += val;
    });
    c.effect(F, val => {
        counter++;
        sink += hard(val, 'J');
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
            const comp = c.compute(src, val => {
                counter++;
                return val;
            });
            c.effect(comp, val => {
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
 * Build a rectangular reactive dependency graph.
 * All nodes use c.compute(). Static nodes read a fixed set of deps. Dynamic nodes conditionally skip deps.
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
                row[myDex] = c.compute(cx => {
                    counter++;
                    let sum = 0;
                    for (let s = 0; s < mySources.length; s++) {
                        sum += cx.val(mySources[s]);
                    }
                    return sum;
                });
            } else {
                const first = mySources[0];
                const tail = mySources.slice(1);
                row[myDex] = c.compute(cx => {
                    counter++;
                    let sum = cx.val(first);
                    const shouldDrop = sum & 0x1;
                    const dropDex = sum % tail.length;
                    for (let i = 0; i < tail.length; i++) {
                        if (shouldDrop && i === dropDex) {
                            continue;
                        }
                        sum += cx.val(tail[i]);
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
            sink += leaves[r].get();
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
        sink += leaves[r].get();
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
            sink += readLeaves[r].get();
        }
    };
}

/* === Validation === */

/**
 * Run each benchmark once and verify the counter matches the expected value.
 * Uses OVERRIDES_ANOD for push-model differences (unstable, molWire).
 */
function validate(name, setupFn) {
    const expected = EXPECTED[name];
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
