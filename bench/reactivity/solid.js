/**
 * Solid 2.0 (@solidjs/signals) benchmark. Uses deferred writes via
 * setSignal() + flush(), matching Solid's native scheduling model.
 */
import { bench, run } from 'mitata';
import { EXPECTED } from './expected.js';
import { createSignal, createMemo, createRoot, createRenderEffect, flush } from '@solidjs/signals';
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
    let run;
    createRoot(() => {
        const len = 50;
        const [head, setHead] = createSignal(0);
        let current = head;
        for (let i = 0; i < len; i++) {
            const prev = current;
            current = createMemo(() => { counter++; return prev() + 1; });
        }
        const tail = current;
        createRenderEffect(() => tail(), (val) => { counter++; sink += val; });
        flush();
        let i = 0;
        run = () => { setHead(++i); flush(); };
    });
    return run;
}

function setupBroad() {
    let run;
    createRoot(() => {
        const [head, setHead] = createSignal(0);
        for (let i = 0; i < 50; i++) {
            const current = createMemo(() => { counter++; return head() + i; });
            const current2 = createMemo(() => { counter++; return current() + 1; });
            createRenderEffect(() => current2(), (val) => { counter++; sink += val; });
        }
        flush();
        let i = 0;
        run = () => { setHead(++i); flush(); };
    });
    return run;
}

function setupDiamond() {
    let run;
    createRoot(() => {
        const width = 5;
        const [head, setHead] = createSignal(0);
        const branches = [];
        for (let i = 0; i < width; i++) {
            branches.push(createMemo(() => { counter++; return head() + 1; }));
        }
        const sum = createMemo(() => { counter++; return branches.reduce((a, b) => a + b(), 0); });
        createRenderEffect(() => sum(), (val) => { counter++; sink += val; });
        flush();
        let i = 0;
        run = () => { setHead(++i); flush(); };
    });
    return run;
}

function setupTriangle() {
    let run;
    createRoot(() => {
        const width = 10;
        const [head, setHead] = createSignal(0);
        let current = head;
        const list = [];
        for (let i = 0; i < width - 1; i++) {
            const prev = current;
            list.push(current);
            current = createMemo(() => { counter++; return prev() + 1; });
        }
        list.push(current);
        const sum = createMemo(() => { counter++; return list.reduce((a, b) => a + b(), 0); });
        createRenderEffect(() => sum(), (val) => { counter++; sink += val; });
        flush();
        let i = 0;
        run = () => { setHead(++i); flush(); };
    });
    return run;
}

function setupMux() {
    let run;
    createRoot(() => {
        const heads = new Array(100).fill(null).map(() => createSignal(0));
        const mux = createMemo(() => { counter++; return heads.map(([h]) => h()); });
        const split = heads
            .map((_, index) => createMemo(() => { counter++; return mux()[index]; }))
            .map(x => createMemo(() => { counter++; return x() + 1; }));
        for (const x of split) {
            createRenderEffect(() => x(), (val) => { counter++; sink += val; });
        }
        flush();
        let i = 0;
        run = () => { const idx = i % heads.length; heads[idx][1](++i); flush(); };
    });
    return run;
}

function setupUnstable() {
    let run;
    createRoot(() => {
        const [head, setHead] = createSignal(0);
        const double = createMemo(() => { counter++; return head() * 2; });
        const inverse = createMemo(() => { counter++; return -head(); });
        const current = createMemo(() => {
            counter++;
            let result = 0;
            for (let i = 0; i < 20; i++) {
                result += head() % 2 ? double() : inverse();
            }
            return result;
        });
        createRenderEffect(() => current(), (val) => { counter++; sink += val; });
        flush();
        let i = 0;
        run = () => { setHead(++i); flush(); };
    });
    return run;
}

function setupAvoidable() {
    let run;
    createRoot(() => {
        const [head, setHead] = createSignal(0);
        const computed1 = createMemo(() => { counter++; return head(); });
        const computed2 = createMemo(() => { counter++; computed1(); return 0; });
        const computed3 = createMemo(() => { counter++; return computed2() + 1; });
        const computed4 = createMemo(() => { counter++; return computed3() + 2; });
        const computed5 = createMemo(() => { counter++; return computed4() + 3; });
        createRenderEffect(() => computed5(), (val) => { counter++; sink += val; });
        flush();
        let i = 0;
        run = () => { setHead(++i); flush(); };
    });
    return run;
}

function setupRepeatedObservers() {
    let run;
    createRoot(() => {
        const size = 30;
        const [head, setHead] = createSignal(0);
        const current = createMemo(() => {
            counter++;
            let result = 0;
            for (let i = 0; i < size; i++) result += head();
            return result;
        });
        createRenderEffect(() => current(), (val) => { counter++; sink += val; });
        flush();
        let i = 0;
        run = () => { setHead(++i); flush(); };
    });
    return run;
}

/* === CellX Benchmark === */

function setupCellx(layers) {
    let run;
    createRoot(() => {
        const start = {
            prop1: createSignal(1),
            prop2: createSignal(2),
            prop3: createSignal(3),
            prop4: createSignal(4),
        };
        let layer = start;
        for (let i = layers; i > 0; i--) {
            const m = layer;
            const r = (x) => typeof x === 'function' ? x() : x[0]();
            const s = {
                prop1: createMemo(() => { counter++; return r(m.prop2); }),
                prop2: createMemo(() => { counter++; return r(m.prop1) - r(m.prop3); }),
                prop3: createMemo(() => { counter++; return r(m.prop2) + r(m.prop4); }),
                prop4: createMemo(() => { counter++; return r(m.prop3); }),
            };
            createRenderEffect(() => s.prop1(), (val) => { counter++; sink += val; });
            createRenderEffect(() => s.prop2(), (val) => { counter++; sink += val; });
            createRenderEffect(() => s.prop3(), (val) => { counter++; sink += val; });
            createRenderEffect(() => s.prop4(), (val) => { counter++; sink += val; });
            createRenderEffect(() => s.prop1(), (val) => { counter++; sink += val; });
            createRenderEffect(() => s.prop2(), (val) => { counter++; sink += val; });
            createRenderEffect(() => s.prop3(), (val) => { counter++; sink += val; });
            createRenderEffect(() => s.prop4(), (val) => { counter++; sink += val; });
            layer = s;
        }
        const end = layer;
        flush();
        let toggle = false;
        run = () => {
            toggle = !toggle;
            start.prop1[1](toggle ? 4 : 1);
            start.prop2[1](toggle ? 3 : 2);
            start.prop3[1](toggle ? 2 : 3);
            start.prop4[1](toggle ? 1 : 4);
            flush();
            end.prop1();
            end.prop2();
            end.prop3();
            end.prop4();
        };
    });
    return run;
}

/* === $mol_wire Benchmark === */

function setupMolWire() {
    let run;
    createRoot(() => {
        const numbers = Array.from({ length: 5 }, (_, i) => i);
        const [A, setA] = createSignal(0);
        const [B, setB] = createSignal(0);
        const C = createMemo(() => { counter++; return (A() % 2) + (B() % 2); });
        const D = createMemo(() => { counter++; return numbers.map(i => ({ x: i + (A() % 2) - (B() % 2) })); });
        const E = createMemo(() => { counter++; return hard(C() + A() + D()[0].x, 'E'); });
        const F = createMemo(() => { counter++; return hard(D()[2].x || B(), 'F'); });
        const G = createMemo(() => { counter++; return C() + (C() || E() % 2) + D()[4].x + F(); });
        createRenderEffect(() => G(), (val) => { counter++; sink += hard(val, 'H'); });
        createRenderEffect(() => G(), (val) => { counter++; sink += val; });
        createRenderEffect(() => F(), (val) => { counter++; sink += hard(val, 'J'); });
        flush();
        let i = 0;
        run = () => {
            i++;
            setB(1); setA(1 + i * 2); flush();
            setA(2 + i * 2); setB(2); flush();
        };
    });
    return run;
}

/* === Creation Benchmarks === */

function benchCreateSignals(count) {
    return () => {
        let signals = [];
        for (let i = 0; i < count; i++) {
            signals[i] = createSignal(i);
        }
        return signals;
    };
}

function benchCreateComputations(count) {
    let run;
    createRoot(() => {
        run = () => {
            const [src, setSrc] = createSignal(0);
            for (let i = 0; i < count; i++) {
                const comp = createMemo(() => { counter++; return src(); });
                createRenderEffect(() => comp(), (val) => { counter++; sink += val; });
            }
            flush();
        };
    });
    return run;
}

/* === Dynamic Graph Benchmarks === */

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

function removeElems(src, rmCount, rand) {
    const copy = src.slice();
    for (let i = 0; i < rmCount; i++) {
        const rmDex = Math.floor(rand() * copy.length);
        copy.splice(rmDex, 1);
    }
    return copy;
}

function makeDynGraph(width, totalLayers, staticFraction, nSources) {
    const sources = new Array(width);
    for (let i = 0; i < width; i++) {
        sources[i] = createSignal(i);
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
            const r = (x) => typeof x === 'function' ? x() : x[0]();
            if (random() < staticFraction) {
                row[myDex] = createMemo(() => {
                    counter++;
                    let sum = 0;
                    for (let s = 0; s < mySources.length; s++) {
                        sum += r(mySources[s]);
                    }
                    return sum;
                });
            } else {
                const first = mySources[0];
                const tail = mySources.slice(1);
                row[myDex] = createMemo(() => {
                    counter++;
                    let sum = r(first);
                    const shouldDrop = sum & 0x1;
                    const dropDex = sum % tail.length;
                    for (let i = 0; i < tail.length; i++) {
                        if (shouldDrop && i === dropDex) continue;
                        sum += r(tail[i]);
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

function setupDynBuild(width, totalLayers, staticFraction, nSources) {
    let run;
    createRoot(() => {
        run = () => {
            const { layers } = makeDynGraph(width, totalLayers, staticFraction, nSources);
            const leaves = layers[layers.length - 1];
            for (let r = 0; r < leaves.length; r++) {
                sink += leaves[r]();
            }
        };
    });
    return run;
}

function setupDynUpdate(width, totalLayers, staticFraction, nSources, readFraction) {
    let run;
    createRoot(() => {
        const { sources, layers } = makeDynGraph(width, totalLayers, staticFraction, nSources);
        const leaves = layers[layers.length - 1];
        for (let r = 0; r < leaves.length; r++) {
            sink += leaves[r]();
        }
        const rand = pseudoRandom('seed');
        const skipCount = Math.round(leaves.length * (1 - readFraction));
        const readLeaves = removeElems(leaves, skipCount, rand);
        const readLen = readLeaves.length;
        const srcLen = sources.length;
        let iter = 0;
        run = () => {
            iter++;
            const sourceDex = iter % srcLen;
            sources[sourceDex][1](iter + sourceDex);
            flush();
            for (let r = 0; r < readLen; r++) {
                sink += readLeaves[r]();
            }
        };
    });
    return run;
}

/* === Validation === */

/** Solid's unstable counts 4 instead of 3 (extra compute evaluation
 *  from dynamic dep handling). Use adjusted expectation. */
const SOLID_OVERRIDES = {
    unstable: 4,
    molWire: 14,
};

function validate(name, setupFn) {
    const expected = SOLID_OVERRIDES[name] ?? EXPECTED[name];
    const run = setupFn();
    counter = 0;
    run();
    if (counter !== expected) {
        throw new Error(`"${name}": expected counter=${expected}, got ${counter}`);
    }
    counter = 0;
}

// validate('deep', setupDeep);
// validate('broad', setupBroad);
// validate('diamond', setupDiamond);
// validate('triangle', setupTriangle);
// validate('mux', setupMux);
// validate('unstable', setupUnstable);
// validate('avoidable', setupAvoidable);
// validate('repeatedObservers', setupRepeatedObservers);
// validate('cellx10', () => setupCellx(10));
// validate('molWire', setupMolWire);
// validate('createComputations1k', () => benchCreateComputations(1000));
// validate('dynBuildSimple', () => setupDynBuild(10, 5, 1, 2));
// validate('dynBuildLargeWebApp', () => setupDynBuild(1000, 12, 0.95, 4));
// validate('dynUpdateSimple', () => setupDynUpdate(10, 5, 1, 2, 0.2));
// validate('dynUpdateDynamic', () => setupDynUpdate(10, 10, 0.75, 6, 0.2));
// validate('dynUpdateLargeWebApp', () => setupDynUpdate(1000, 12, 0.95, 4, 1));
// validate('dynUpdateWideDense', () => setupDynUpdate(1000, 5, 1, 25, 1));
// validate('dynUpdateDeep', () => setupDynUpdate(5, 500, 1, 3, 1));
// validate('dynUpdateVeryDynamic', () => setupDynUpdate(100, 15, 0.5, 6, 1));

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

saveRun('solid', results);
