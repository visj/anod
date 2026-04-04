import { bench, group, run } from 'mitata';
import { EXPECTED } from './expected.js';
import { createState, createMemo, createEffect, batch } from '@zeix/cause-effect';

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
    const head = createState(0);
    let current = head;
    for (let i = 0; i < len; i++) {
        const prev = current;
        current = createMemo(() => {
            counter++;
            return prev.get() + 1;
        });
    }
    const tail = current;
    createEffect(() => {
        counter++;
        sink += tail.get();
    });
    let i = 0;
    return () => {
        head.set(++i);
    };
}

function setupBroad() {
    const head = createState(0);
    for (let i = 0; i < 50; i++) {
        const current = createMemo(() => {
            counter++;
            return head.get() + i;
        });
        const current2 = createMemo(() => {
            counter++;
            return current.get() + 1;
        });
        createEffect(() => {
            counter++;
            sink += current2.get();
        });
    }
    let i = 0;
    return () => {
        head.set(++i);
    };
}

function setupDiamond() {
    const width = 5;
    const head = createState(0);
    const branches = [];
    for (let i = 0; i < width; i++) {
        branches.push(createMemo(() => {
            counter++;
            return head.get() + 1;
        }));
    }
    const sum = createMemo(() => {
        counter++;
        return branches.reduce((a, b) => a + b.get(), 0);
    });
    createEffect(() => {
        counter++;
        sink += sum.get();
    });
    let i = 0;
    return () => {
        head.set(++i);
    };
}

function setupTriangle() {
    const width = 10;
    const head = createState(0);
    let current = head;
    const list = [];
    for (let i = 0; i < width - 1; i++) {
        const prev = current;
        list.push(current);
        current = createMemo(() => {
            counter++;
            return prev.get() + 1;
        });
    }
    list.push(current);
    const sum = createMemo(() => {
        counter++;
        return list.reduce((a, b) => a + b.get(), 0);
    });
    createEffect(() => {
        counter++;
        sink += sum.get();
    });
    let i = 0;
    return () => {
        head.set(++i);
    };
}

function setupMux() {
    const heads = new Array(100).fill(null).map(() => createState(0));
    const mux = createMemo(() => {
        counter++;
        return heads.map(h => h.get());
    });
    const split = heads
        .map((_, index) => createMemo(() => {
            counter++;
            return mux.get()[index];
        }))
        .map(x => createMemo(() => {
            counter++;
            return x.get() + 1;
        }));
    for (const x of split) {
        createEffect(() => {
            counter++;
            sink += x.get();
        });
    }
    let i = 0;
    return () => {
        const idx = i % heads.length;
        heads[idx].set(++i);
    };
}

function setupUnstable() {
    const head = createState(0);
    const double = createMemo(() => {
        counter++;
        return head.get() * 2;
    });
    const inverse = createMemo(() => {
        counter++;
        return -head.get();
    });
    const current = createMemo(() => {
        counter++;
        let result = 0;
        for (let i = 0; i < 20; i++) {
            result += head.get() % 2 ? double.get() : inverse.get();
        }
        return result;
    });
    createEffect(() => {
        counter++;
        sink += current.get();
    });
    let i = 0;
    return () => {
        head.set(++i);
    };
}

function setupAvoidable() {
    const head = createState(0);
    const computed1 = createMemo(() => {
        counter++;
        return head.get();
    });
    const computed2 = createMemo(() => {
        counter++;
        computed1.get();
        return 0;
    });
    const computed3 = createMemo(() => {
        counter++;
        return computed2.get() + 1;
    });
    const computed4 = createMemo(() => {
        counter++;
        return computed3.get() + 2;
    });
    const computed5 = createMemo(() => {
        counter++;
        return computed4.get() + 3;
    });
    createEffect(() => {
        counter++;
        sink += computed5.get();
    });
    let i = 0;
    return () => {
        head.set(++i);
    };
}

function setupRepeatedObservers() {
    const size = 30;
    const head = createState(0);
    const current = createMemo(() => {
        counter++;
        let result = 0;
        for (let i = 0; i < size; i++) {
            result += head.get();
        }
        return result;
    });
    createEffect(() => {
        counter++;
        sink += current.get();
    });
    let i = 0;
    return () => {
        head.set(++i);
    };
}

/* === CellX Benchmark === */

function setupCellx(layers) {
    const start = {
        prop1: createState(1),
        prop2: createState(2),
        prop3: createState(3),
        prop4: createState(4),
    };
    let layer = start;
    for (let i = layers; i > 0; i--) {
        const m = layer;
        const s = {
            prop1: createMemo(() => {
                counter++;
                return m.prop2.get();
            }),
            prop2: createMemo(() => {
                counter++;
                return m.prop1.get() - m.prop3.get();
            }),
            prop3: createMemo(() => {
                counter++;
                return m.prop2.get() + m.prop4.get();
            }),
            prop4: createMemo(() => {
                counter++;
                return m.prop3.get();
            }),
        };
        createEffect(() => { counter++; sink += s.prop1.get(); });
        createEffect(() => { counter++; sink += s.prop2.get(); });
        createEffect(() => { counter++; sink += s.prop3.get(); });
        createEffect(() => { counter++; sink += s.prop4.get(); });
        createEffect(() => { counter++; sink += s.prop1.get(); });
        createEffect(() => { counter++; sink += s.prop2.get(); });
        createEffect(() => { counter++; sink += s.prop3.get(); });
        createEffect(() => { counter++; sink += s.prop4.get(); });
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
    const A = createState(0);
    const B = createState(0);
    const C = createMemo(() => {
        counter++;
        return (A.get() % 2) + (B.get() % 2);
    });
    const D = createMemo(() => {
        counter++;
        return numbers.map(i => ({ x: i + (A.get() % 2) - (B.get() % 2) }));
    });
    const E = createMemo(() => {
        counter++;
        return hard(C.get() + A.get() + D.get()[0].x, 'E');
    });
    const F = createMemo(() => {
        counter++;
        return hard(D.get()[2].x || B.get(), 'F');
    });
    const G = createMemo(() => {
        counter++;
        return C.get() + (C.get() || E.get() % 2) + D.get()[4].x + F.get();
    });
    createEffect(() => {
        counter++;
        sink += hard(G.get(), 'H');
    });
    createEffect(() => {
        counter++;
        sink += G.get();
    });
    createEffect(() => {
        counter++;
        sink += hard(F.get(), 'J');
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
            signals[i] = createState(i);
        }
        return signals;
    };
}

function benchCreateComputations(count) {
    return () => {
        const src = createState(0);
        for (let i = 0; i < count; i++) {
            const comp = createMemo(() => {
                counter++;
                return src.get();
            });
            createEffect(() => {
                counter++;
                sink += comp.get();
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
 * Build a rectangular reactive dependency graph using native cause-effect API.
 * @param {number} width
 * @param {number} totalLayers
 * @param {number} staticFraction
 * @param {number} nSources
 */
function makeDynGraph(width, totalLayers, staticFraction, nSources) {
    const sources = new Array(width);
    for (let i = 0; i < width; i++) {
        sources[i] = createState(i);
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
                row[myDex] = createMemo(() => {
                    counter++;
                    let sum = 0;
                    for (let s = 0; s < mySources.length; s++) {
                        sum += mySources[s].get();
                    }
                    return sum;
                });
            } else {
                const first = mySources[0];
                const tail = mySources.slice(1);
                row[myDex] = createMemo(() => {
                    counter++;
                    let sum = first.get();
                    const shouldDrop = sum & 0x1;
                    const dropDex = sum % tail.length;
                    for (let i = 0; i < tail.length; i++) {
                        if (shouldDrop && i === dropDex) {
                            continue;
                        }
                        sum += tail[i].get();
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
            sink += leaves[r].get();
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
        sink += leaves[r].get();
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
            readLeaves[r].get();
        }
    };
}

/* === Validation === */

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

group('Kairo: deep propagation', () => { bench('cause-effect', setupDeep()); });
group('Kairo: broad propagation', () => { bench('cause-effect', setupBroad()); });
group('Kairo: diamond', () => { bench('cause-effect', setupDiamond()); });
group('Kairo: triangle', () => { bench('cause-effect', setupTriangle()); });
group('Kairo: mux', () => { bench('cause-effect', setupMux()); });
group('Kairo: unstable', () => { bench('cause-effect', setupUnstable()); });
group('Kairo: avoidable propagation', () => { bench('cause-effect', setupAvoidable()); });
group('Kairo: repeated observers', () => { bench('cause-effect', setupRepeatedObservers()); });
group('CellX 10 layers', () => { bench('cause-effect', setupCellx(10)); });
group('$mol_wire', () => { bench('cause-effect', setupMolWire()); });
group('Create 1k signals', () => { bench('cause-effect', benchCreateSignals(1_000)); });
group('Create 1k computations', () => { bench('cause-effect', benchCreateComputations(1_000)); });

group('Dynamic build: simple component', () => { bench('cause-effect', setupDynBuild(10, 5, 1, 2)); });
group('Dynamic build: large web app', () => { bench('cause-effect', setupDynBuild(1000, 12, 0.95, 4)); });
group('Dynamic build: wide dense', () => { bench('cause-effect', setupDynBuild(1000, 5, 1, 25)); });
group('Dynamic update: simple component', () => { bench('cause-effect', setupDynUpdate(10, 5, 1, 2, 0.2)); });
group('Dynamic update: dynamic component', () => { bench('cause-effect', setupDynUpdate(10, 10, 0.75, 6, 0.2)); });
group('Dynamic update: large web app', () => { bench('cause-effect', setupDynUpdate(1000, 12, 0.95, 4, 1)); });
group('Dynamic update: wide dense', () => { bench('cause-effect', setupDynUpdate(1000, 5, 1, 25, 1)); });
group('Dynamic update: deep', () => { bench('cause-effect', setupDynUpdate(5, 500, 1, 3, 1)); });
group('Dynamic update: very dynamic', () => { bench('cause-effect', setupDynUpdate(100, 15, 0.5, 6, 1)); });

await run();

console.log(sink, counter);
