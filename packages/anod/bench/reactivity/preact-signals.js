import { bench, group, run } from 'mitata';
import { EXPECTED } from './expected.js';
import { signal, computed, effect, batch } from '@preact/signals-core';

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
        current = computed(() => {
            counter++;
            return prev.value + 1;
        });
    }
    const tail = current;
    effect(() => {
        counter++;
        sink += tail.value;
    });
    let i = 0;
    return () => {
        batch(() => { head.value = ++i; });
    };
}

function setupBroad() {
    const head = signal(0);
    for (let i = 0; i < 50; i++) {
        const current = computed(() => {
            counter++;
            return head.value + i;
        });
        const current2 = computed(() => {
            counter++;
            return current.value + 1;
        });
        effect(() => {
            counter++;
            sink += current2.value;
        });
    }
    let i = 0;
    return () => {
        batch(() => { head.value = ++i; });
    };
}

function setupDiamond() {
    const width = 5;
    const head = signal(0);
    const branches = [];
    for (let i = 0; i < width; i++) {
        branches.push(computed(() => {
            counter++;
            return head.value + 1;
        }));
    }
    const sum = computed(() => {
        counter++;
        return branches.reduce((a, b) => a + b.value, 0);
    });
    effect(() => {
        counter++;
        sink += sum.value;
    });
    let i = 0;
    return () => {
        batch(() => { head.value = ++i; });
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
        current = computed(() => {
            counter++;
            return prev.value + 1;
        });
    }
    list.push(current);
    const sum = computed(() => {
        counter++;
        return list.reduce((a, b) => a + b.value, 0);
    });
    effect(() => {
        counter++;
        sink += sum.value;
    });
    let i = 0;
    return () => {
        batch(() => { head.value = ++i; });
    };
}

function setupMux() {
    const heads = new Array(100).fill(null).map(() => signal(0));
    const mux = computed(() => {
        counter++;
        return heads.map(h => h.value);
    });
    const split = heads
        .map((_, index) => computed(() => {
            counter++;
            return mux.value[index];
        }))
        .map(x => computed(() => {
            counter++;
            return x.value + 1;
        }));
    for (const x of split) {
        effect(() => {
            counter++;
            sink += x.value;
        });
    }
    let i = 0;
    return () => {
        const idx = i % heads.length;
        batch(() => { heads[idx].value = ++i; });
    };
}

function setupUnstable() {
    const head = signal(0);
    const double = computed(() => {
        counter++;
        return head.value * 2;
    });
    const inverse = computed(() => {
        counter++;
        return -head.value;
    });
    const current = computed(() => {
        counter++;
        let result = 0;
        for (let i = 0; i < 20; i++) {
            result += head.value % 2 ? double.value : inverse.value;
        }
        return result;
    });
    effect(() => {
        counter++;
        sink += current.value;
    });
    let i = 0;
    return () => {
        batch(() => { head.value = ++i; });
    };
}

function setupAvoidable() {
    const head = signal(0);
    const computed1 = computed(() => {
        counter++;
        return head.value;
    });
    const computed2 = computed(() => {
        counter++;
        computed1.value;
        return 0;
    });
    const computed3 = computed(() => {
        counter++;
        return computed2.value + 1;
    });
    const computed4 = computed(() => {
        counter++;
        return computed3.value + 2;
    });
    const computed5 = computed(() => {
        counter++;
        return computed4.value + 3;
    });
    effect(() => {
        counter++;
        sink += computed5.value;
    });
    let i = 0;
    return () => {
        batch(() => { head.value = ++i; });
    };
}

function setupRepeatedObservers() {
    const size = 30;
    const head = signal(0);
    const current = computed(() => {
        counter++;
        let result = 0;
        for (let i = 0; i < size; i++) {
            result += head.value;
        }
        return result;
    });
    effect(() => {
        counter++;
        sink += current.value;
    });
    let i = 0;
    return () => {
        batch(() => { head.value = ++i; });
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
            prop1: computed(() => {
                counter++;
                return m.prop2.value;
            }),
            prop2: computed(() => {
                counter++;
                return m.prop1.value - m.prop3.value;
            }),
            prop3: computed(() => {
                counter++;
                return m.prop2.value + m.prop4.value;
            }),
            prop4: computed(() => {
                counter++;
                return m.prop3.value;
            }),
        };
        effect(() => { counter++; sink += s.prop1.value; });
        effect(() => { counter++; sink += s.prop2.value; });
        effect(() => { counter++; sink += s.prop3.value; });
        effect(() => { counter++; sink += s.prop4.value; });
        effect(() => { counter++; sink += s.prop1.value; });
        effect(() => { counter++; sink += s.prop2.value; });
        effect(() => { counter++; sink += s.prop3.value; });
        effect(() => { counter++; sink += s.prop4.value; });
        layer = s;
    }
    const end = layer;
    let toggle = false;
    return () => {
        toggle = !toggle;
        batch(() => {
            start.prop1.value = toggle ? 4 : 1;
            start.prop2.value = toggle ? 3 : 2;
            start.prop3.value = toggle ? 2 : 3;
            start.prop4.value = toggle ? 1 : 4;
        });
        end.prop1.value;
        end.prop2.value;
        end.prop3.value;
        end.prop4.value;
    };
}

/* === $mol_wire Benchmark === */

function setupMolWire() {
    const numbers = Array.from({ length: 5 }, (_, i) => i);
    const A = signal(0);
    const B = signal(0);
    const C = computed(() => {
        counter++;
        return (A.value % 2) + (B.value % 2);
    });
    const D = computed(() => {
        counter++;
        return numbers.map(i => ({ x: i + (A.value % 2) - (B.value % 2) }));
    });
    const E = computed(() => {
        counter++;
        return hard(C.value + A.value + D.value[0].x, 'E');
    });
    const F = computed(() => {
        counter++;
        return hard(D.value[2].x || B.value, 'F');
    });
    const G = computed(() => {
        counter++;
        return C.value + (C.value || E.value % 2) + D.value[4].x + F.value;
    });
    effect(() => {
        counter++;
        sink += hard(G.value, 'H');
    });
    effect(() => {
        counter++;
        sink += G.value;
    });
    effect(() => {
        counter++;
        sink += hard(F.value, 'J');
    });
    let i = 0;
    return () => {
        i++;
        batch(() => { B.value = 1; A.value = 1 + i * 2; });
        batch(() => { A.value = 2 + i * 2; B.value = 2; });
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
            const comp = computed(() => {
                counter++;
                return src.value;
            });
            effect(() => {
                counter++;
                sink += comp.value;
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
 * Build a rectangular reactive dependency graph using native Preact Signals API.
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
                row[myDex] = computed(() => {
                    counter++;
                    let sum = 0;
                    for (let s = 0; s < mySources.length; s++) {
                        sum += mySources[s].value;
                    }
                    return sum;
                });
            } else {
                const first = mySources[0];
                const tail = mySources.slice(1);
                row[myDex] = computed(() => {
                    counter++;
                    let sum = first.value;
                    const shouldDrop = sum & 0x1;
                    const dropDex = sum % tail.length;
                    for (let i = 0; i < tail.length; i++) {
                        if (shouldDrop && i === dropDex) {
                            continue;
                        }
                        sum += tail[i].value;
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
            sink += leaves[r].value;
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
        sink += leaves[r].value;
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
            sources[sourceDex].value = iter + sourceDex;
        });
        for (let r = 0; r < readLen; r++) {
            readLeaves[r].value;
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

group('Kairo: deep propagation', () => { bench('preact-signals', setupDeep()); });
group('Kairo: broad propagation', () => { bench('preact-signals', setupBroad()); });
group('Kairo: diamond', () => { bench('preact-signals', setupDiamond()); });
group('Kairo: triangle', () => { bench('preact-signals', setupTriangle()); });
group('Kairo: mux', () => { bench('preact-signals', setupMux()); });
group('Kairo: unstable', () => { bench('preact-signals', setupUnstable()); });
group('Kairo: avoidable propagation', () => { bench('preact-signals', setupAvoidable()); });
group('Kairo: repeated observers', () => { bench('preact-signals', setupRepeatedObservers()); });
group('CellX 10 layers', () => { bench('preact-signals', setupCellx(10)); });
group('$mol_wire', () => { bench('preact-signals', setupMolWire()); });
group('Create 1k signals', () => { bench('preact-signals', benchCreateSignals(1_000)); });
group('Create 1k computations', () => { bench('preact-signals', benchCreateComputations(1_000)); });

group('Dynamic build: simple component', () => { bench('preact-signals', setupDynBuild(10, 5, 1, 2)); });
group('Dynamic build: large web app', () => { bench('preact-signals', setupDynBuild(1000, 12, 0.95, 4)); });
group('Dynamic build: wide dense', () => { bench('preact-signals', setupDynBuild(1000, 5, 1, 25)); });
group('Dynamic update: simple component', () => { bench('preact-signals', setupDynUpdate(10, 5, 1, 2, 0.2)); });
group('Dynamic update: dynamic component', () => { bench('preact-signals', setupDynUpdate(10, 10, 0.75, 6, 0.2)); });
group('Dynamic update: large web app', () => { bench('preact-signals', setupDynUpdate(1000, 12, 0.95, 4, 1)); });
group('Dynamic update: wide dense', () => { bench('preact-signals', setupDynUpdate(1000, 5, 1, 25, 1)); });
group('Dynamic update: deep', () => { bench('preact-signals', setupDynUpdate(5, 500, 1, 3, 1)); });
group('Dynamic update: very dynamic', () => { bench('preact-signals', setupDynUpdate(100, 15, 0.5, 6, 1)); });

await run();

console.log(sink, counter);
