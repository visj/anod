import { bench, run } from 'mitata';
import S from 's-js';
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
    return S.root(() => {
        const len = 50;
        const head = S.data(0);
        let current = head;
        for (let i = 0; i < len; i++) {
            const prev = current;
            current = S(() => prev() + 1);
        }
        const tail = current;
        S(() => {
            const v = tail();
            counter += v;
            sink += counter;
        });
        let i = 0;
        return () => {
            head(++i);
        };
    });
}

function setupBroad() {
    return S.root(() => {
        const head = S.data(0);
        for (let i = 0; i < 50; i++) {
            const current = S(() => head() + i);
            const current2 = S(() => current() + 1);
            S(() => {
                const v = current2();
                counter += v;
                sink += counter;
            });
        }
        let i = 0;
        return () => {
            head(++i);
        };
    });
}

function setupDiamond() {
    return S.root(() => {
        const width = 5;
        const head = S.data(0);
        const branches = [];
        for (let i = 0; i < width; i++) {
            branches.push(S(() => head() + 1));
        }
        const sum = S(() => branches.reduce((a, b) => a + b(), 0));
        S(() => {
            const v = sum();
            counter += v;
            sink += counter;
        });
        let i = 0;
        return () => {
            head(++i);
        };
    });
}

function setupTriangle() {
    return S.root(() => {
        const width = 10;
        const head = S.data(0);
        let current = head;
        const list = [];
        for (let i = 0; i < width; i++) {
            const prev = current;
            list.push(current);
            current = S(() => prev() + 1);
        }
        const sum = S(() => list.reduce((a, b) => a + b(), 0));
        S(() => {
            const v = sum();
            counter += v;
            sink += counter;
        });
        let i = 0;
        return () => {
            head(++i);
        };
    });
}

function setupMux() {
    return S.root(() => {
        const heads = new Array(100).fill(null).map(() => S.data(0));
        const mux = S(() => heads.map(h => h()));
        const split = heads
            .map((_, index) => S(() => mux()[index]))
            .map(x => S(() => x() + 1));
        for (const x of split) {
            S(() => {
                const v = x();
                counter += v;
                sink += counter;
            });
        }
        let i = 0;
        return () => {
            const idx = i % heads.length;
            heads[idx](++i);
        };
    });
}

function setupUnstable() {
    return S.root(() => {
        const head = S.data(0);
        const double = S(() => head() * 2);
        const inverse = S(() => -head());
        const current = S(() => {
            let result = 0;
            for (let i = 0; i < 20; i++) {
                result += head() % 2 ? double() : inverse();
            }
            return result;
        });
        S(() => {
            const v = current();
            counter += v;
            sink += counter;
        });
        let i = 0;
        return () => {
            head(++i);
        };
    });
}

function setupAvoidable() {
    return S.root(() => {
        const head = S.data(0);
        const computed1 = S(() => head());
        const computed2 = S(() => { computed1(); return 0; });
        const computed3 = S(() => computed2() + 1);
        const computed4 = S(() => computed3() + 2);
        const computed5 = S(() => computed4() + 3);
        S(() => {
            const v = computed5();
            counter += v;
            sink += counter;
        });
        let i = 0;
        return () => {
            head(++i);
        };
    });
}

function setupRepeatedObservers() {
    return S.root(() => {
        const size = 30;
        const head = S.data(0);
        const current = S(() => {
            let result = 0;
            for (let i = 0; i < size; i++) {
                result += head();
            }
            return result;
        });
        S(() => {
            const v = current();
            counter += v;
            sink += counter;
        });
        let i = 0;
        return () => {
            head(++i);
        };
    });
}

/* === CellX Benchmark === */

function setupCellx(layers) {
    return S.root(() => {
        const start = {
            prop1: S.data(1),
            prop2: S.data(2),
            prop3: S.data(3),
            prop4: S.data(4),
        };
        let layer = start;
        for (let i = layers; i > 0; i--) {
            const m = layer;
            const s = {
                prop1: S(() => m.prop2()),
                prop2: S(() => m.prop1() - m.prop3()),
                prop3: S(() => m.prop2() + m.prop4()),
                prop4: S(() => m.prop3()),
            };
            S(() => { const v = s.prop1(); counter += v; sink += counter; });
            S(() => { const v = s.prop2(); counter += v; sink += counter; });
            S(() => { const v = s.prop3(); counter += v; sink += counter; });
            S(() => { const v = s.prop4(); counter += v; sink += counter; });
            S(() => { const v = s.prop1(); counter += v; sink += counter; });
            S(() => { const v = s.prop2(); counter += v; sink += counter; });
            S(() => { const v = s.prop3(); counter += v; sink += counter; });
            S(() => { const v = s.prop4(); counter += v; sink += counter; });
            layer = s;
        }
        const end = layer;
        let toggle = false;
        return () => {
            toggle = !toggle;
            S.freeze(() => {
                start.prop1(toggle ? 4 : 1);
                start.prop2(toggle ? 3 : 2);
                start.prop3(toggle ? 2 : 3);
                start.prop4(toggle ? 1 : 4);
            });
            end.prop1();
            end.prop2();
            end.prop3();
            end.prop4();
        };
    });
}

/* === $mol_wire Benchmark === */

function setupMolWire() {
    return S.root(() => {
        const numbers = Array.from({ length: 5 }, (_, i) => i);
        const A = S.data(0);
        const B = S.data(0);
        const C = S(() => (A() % 2) + (B() % 2));
        const D = S(() => numbers.map(i => ({ x: i + (A() % 2) - (B() % 2) })));
        const E = S(() => hard(C() + A() + D()[0].x, 'E'));
        const F = S(() => hard(D()[2].x || B(), 'F'));
        const G = S(() => C() + (C() || E() % 2) + D()[4].x + F());
        S(() => { const v = hard(G(), 'H'); counter += v; sink += counter; });
        S(() => { const v = G(); counter += v; sink += counter; });
        S(() => { const v = hard(F(), 'J'); counter += v; sink += counter; });
        let i = 0;
        return () => {
            i++;
            S.freeze(() => {
                B(1);
                A(1 + i * 2);
            });
            S.freeze(() => {
                A(2 + i * 2);
                B(2);
            });
        };
    });
}

/* === Creation Benchmarks === */

function benchCreateSignals(count) {
    return () => {
        return S.root(() => {
            let signals = [];
            for (let i = 0; i < count; i++) {
                signals[i] = S.data(i);
            }
            return signals;
        });
    };
}

function benchCreateComputations(count) {
    return () => {
        S.root(() => {
            const src = S.data(0);
            for (let i = 0; i < count; i++) {
                const comp = S(() => src());
                S(() => {
                    const v = comp();
                    counter += v;
                    sink += counter;
                });
            }
        });
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
 * Build a rectangular reactive dependency graph using native S.js API.
 * Must be called inside an S.root() context.
 * @param {number} width
 * @param {number} totalLayers
 * @param {number} staticFraction
 * @param {number} nSources
 */
function makeDynGraph(width, totalLayers, staticFraction, nSources) {
    const sources = new Array(width);
    for (let i = 0; i < width; i++) {
        sources[i] = S.data(i);
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
                row[myDex] = S(() => {
                    let sum = 0;
                    for (let s = 0; s < mySources.length; s++) {
                        sum += mySources[s]();
                    }
                    return sum;
                });
            } else {
                const first = mySources[0];
                const tail = mySources.slice(1);
                row[myDex] = S(() => {
                    let sum = first();
                    const shouldDrop = sum & 0x1;
                    const dropDex = sum % tail.length;
                    for (let i = 0; i < tail.length; i++) {
                        if (shouldDrop && i === dropDex) {
                            continue;
                        }
                        sum += tail[i]();
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
 * Build a fresh graph inside S.root() and return a function that reads all
 * leaves to force materialization. Measures graph construction + initial evaluation cost.
 * @param {number} width
 * @param {number} totalLayers
 * @param {number} staticFraction
 * @param {number} nSources
 */
function setupDynBuild(width, totalLayers, staticFraction, nSources) {
    return () => {
        S.root(() => {
            const { layers } = makeDynGraph(width, totalLayers, staticFraction, nSources);
            const leaves = layers[layers.length - 1];
            const len = leaves.length;
            for (let r = 0; r < len; r++) {
                sink += leaves[r]();
            }
        });
    };
}

/**
 * Build the graph once inside S.root(), force-read all leaves to materialize,
 * then return a function that writes one source and reads selected leaves per call.
 * @param {number} width
 * @param {number} totalLayers
 * @param {number} staticFraction
 * @param {number} nSources
 * @param {number} readFraction
 */
function setupDynUpdate(width, totalLayers, staticFraction, nSources, readFraction) {
    return S.root(() => {
        const { sources, layers } = makeDynGraph(width, totalLayers, staticFraction, nSources);
        const leaves = layers[layers.length - 1];
        /** Force-read all leaves so lazy frameworks fully materialize the graph. */
        for (let r = 0; r < leaves.length; r++) {
            sink += leaves[r]();
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
            sources[sourceDex](iter + sourceDex);
            for (let r = 0; r < readLen; r++) {
                sink += readLeaves[r]();
            }
        };
    });
}

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

saveRun('s-js', results);
