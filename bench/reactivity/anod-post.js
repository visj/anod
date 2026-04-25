/**
 * Anod deferred-write benchmark. Uses .post() + flush() to mirror
 * Solid 2.0's scheduling model. All writes are deferred, flushed
 * explicitly. Runs inside root() for ownership overhead parity.
 */
import { bench, run } from 'mitata';
import { EXPECTED } from './expected.js';
import { signal, root, batch, flush, c } from '../../dist/index.js';
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
    root((r) => {
        const len = 50;
        const head = signal(0);
        let current = head;
        for (let i = 0; i < len; i++) {
            const prev = current;
            current = r.compute(cx => { counter++; return cx.val(prev) + 1; });
        }
        const tail = current;
        r.effect(cx => { counter++; sink += cx.val(tail); });
        let i = 0;
        run = () => { head.post(++i); flush(); };
    });
    return run;
}

function setupBroad() {
    let run;
    root((r) => {
        const head = signal(0);
        for (let i = 0; i < 50; i++) {
            const current = r.compute(cx => { counter++; return cx.val(head) + i; });
            const current2 = r.compute(cx => { counter++; return cx.val(current) + 1; });
            r.effect(cx => { counter++; sink += cx.val(current2); });
        }
        let i = 0;
        run = () => { head.post(++i); flush(); };
    });
    return run;
}

function setupDiamond() {
    let run;
    root((r) => {
        const width = 5;
        const head = signal(0);
        const branches = [];
        for (let i = 0; i < width; i++) {
            branches.push(r.compute(cx => { counter++; return cx.val(head) + 1; }));
        }
        const sum = r.compute(cx => { counter++; return branches.reduce((a, b) => a + cx.val(b), 0); });
        r.effect(cx => { counter++; sink += cx.val(sum); });
        let i = 0;
        run = () => { head.post(++i); flush(); };
    });
    return run;
}

function setupTriangle() {
    let run;
    root((r) => {
        const width = 10;
        const head = signal(0);
        let current = head;
        const list = [];
        for (let i = 0; i < width - 1; i++) {
            const prev = current;
            list.push(current);
            current = r.compute(cx => { counter++; return cx.val(prev) + 1; });
        }
        list.push(current);
        const sum = r.compute(cx => { counter++; return list.reduce((a, b) => a + cx.val(b), 0); });
        r.effect(cx => { counter++; sink += cx.val(sum); });
        let i = 0;
        run = () => { head.post(++i); flush(); };
    });
    return run;
}

function setupMux() {
    let run;
    root((r) => {
        const heads = new Array(100).fill(null).map(() => signal(0));
        const mux = r.compute(cx => { counter++; return heads.map(h => cx.val(h)); });
        const split = heads
            .map((_, index) => r.compute(cx => { counter++; return cx.val(mux)[index]; }))
            .map(x => r.compute(cx => { counter++; return cx.val(x) + 1; }));
        for (const x of split) {
            r.effect(cx => { counter++; sink += cx.val(x); });
        }
        let i = 0;
        run = () => { const idx = i % heads.length; heads[idx].post(++i); flush(); };
    });
    return run;
}

function setupUnstable() {
    let run;
    root((r) => {
        const head = signal(0);
        const double = r.compute(cx => { counter++; return cx.val(head) * 2; });
        const inverse = r.compute(cx => { counter++; return -cx.val(head); });
        const current = r.compute(cx => {
            counter++;
            let result = 0;
            for (let i = 0; i < 20; i++) {
                result += cx.val(head) % 2 ? cx.val(double) : cx.val(inverse);
            }
            return result;
        });
        r.effect(cx => { counter++; sink += cx.val(current); });
        let i = 0;
        run = () => { head.post(++i); flush(); };
    });
    return run;
}

function setupAvoidable() {
    let run;
    root((r) => {
        const head = signal(0);
        const computed1 = r.compute(cx => { counter++; return cx.val(head); });
        const computed2 = r.compute(cx => { counter++; cx.val(computed1); return 0; });
        const computed3 = r.compute(cx => { counter++; return cx.val(computed2) + 1; });
        const computed4 = r.compute(cx => { counter++; return cx.val(computed3) + 2; });
        const computed5 = r.compute(cx => { counter++; return cx.val(computed4) + 3; });
        r.effect(cx => { counter++; sink += cx.val(computed5); });
        let i = 0;
        run = () => { head.post(++i); flush(); };
    });
    return run;
}

function setupRepeatedObservers() {
    let run;
    root((r) => {
        const size = 30;
        const head = signal(0);
        const current = r.compute(cx => {
            counter++;
            let result = 0;
            for (let i = 0; i < size; i++) result += cx.val(head);
            return result;
        });
        r.effect(cx => { counter++; sink += cx.val(current); });
        let i = 0;
        run = () => { head.post(++i); flush(); };
    });
    return run;
}

/* === CellX Benchmark === */

function setupCellx(layers) {
    let run;
    root((r) => {
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
                prop1: r.compute(cx => { counter++; return cx.val(m.prop2); }),
                prop2: r.compute(cx => { counter++; return cx.val(m.prop1) - cx.val(m.prop3); }),
                prop3: r.compute(cx => { counter++; return cx.val(m.prop2) + cx.val(m.prop4); }),
                prop4: r.compute(cx => { counter++; return cx.val(m.prop3); }),
            };
            r.effect(cx => { counter++; sink += cx.val(s.prop1); });
            r.effect(cx => { counter++; sink += cx.val(s.prop2); });
            r.effect(cx => { counter++; sink += cx.val(s.prop3); });
            r.effect(cx => { counter++; sink += cx.val(s.prop4); });
            r.effect(cx => { counter++; sink += cx.val(s.prop1); });
            r.effect(cx => { counter++; sink += cx.val(s.prop2); });
            r.effect(cx => { counter++; sink += cx.val(s.prop3); });
            r.effect(cx => { counter++; sink += cx.val(s.prop4); });
            layer = s;
        }
        const end = layer;
        let toggle = false;
        run = () => {
            toggle = !toggle;
            start.prop1.post(toggle ? 4 : 1);
            start.prop2.post(toggle ? 3 : 2);
            start.prop3.post(toggle ? 2 : 3);
            start.prop4.post(toggle ? 1 : 4);
            flush();
            end.prop1.get();
            end.prop2.get();
            end.prop3.get();
            end.prop4.get();
        };
    });
    return run;
}

/* === $mol_wire Benchmark === */

function setupMolWire() {
    let run;
    root((r) => {
        const numbers = Array.from({ length: 5 }, (_, i) => i);
        const A = signal(0);
        const B = signal(0);
        const C = r.compute(cx => { counter++; return (cx.val(A) % 2) + (cx.val(B) % 2); });
        const D = r.compute(cx => { counter++; return numbers.map(i => ({ x: i + (cx.val(A) % 2) - (cx.val(B) % 2) })); });
        const E = r.compute(cx => { counter++; return hard(cx.val(C) + cx.val(A) + cx.val(D)[0].x, 'E'); });
        const F = r.compute(cx => { counter++; return hard(cx.val(D)[2].x || cx.val(B), 'F'); });
        const G = r.compute(cx => { counter++; return cx.val(C) + (cx.val(C) || cx.val(E) % 2) + cx.val(D)[4].x + cx.val(F); });
        r.effect(cx => { counter++; sink += hard(cx.val(G), 'H'); });
        r.effect(cx => { counter++; sink += cx.val(G); });
        r.effect(cx => { counter++; sink += hard(cx.val(F), 'J'); });
        let i = 0;
        run = () => {
            i++;
            B.post(1); A.post(1 + i * 2); flush();
            A.post(2 + i * 2); B.post(2); flush();
        };
    });
    return run;
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
    let run;
    root((r) => {
        run = () => {
            const src = signal(0);
            for (let i = 0; i < count; i++) {
                const comp = r.compute(cx => { counter++; return cx.val(src); });
                r.effect(cx => { counter++; sink += cx.val(comp); });
            }
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
    let a = nextHash(), b = nextHash(), cc = nextHash(), d = nextHash();
    return function () {
        a >>>= 0; b >>>= 0; cc >>>= 0; d >>>= 0;
        let t = (a + b) | 0;
        a = b ^ (b >>> 9);
        b = (cc + (cc << 3)) | 0;
        cc = (cc << 21) | (cc >>> 11);
        d = (d + 1) | 0;
        t = (t + d) | 0;
        cc = (cc + t) | 0;
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

function makeDynGraph(r, width, totalLayers, staticFraction, nSources) {
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
                row[myDex] = r.compute(cx => {
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
                row[myDex] = r.compute(cx => {
                    counter++;
                    let sum = cx.val(first);
                    const shouldDrop = sum & 0x1;
                    const dropDex = sum % tail.length;
                    for (let i = 0; i < tail.length; i++) {
                        if (shouldDrop && i === dropDex) continue;
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

function setupDynBuild(width, totalLayers, staticFraction, nSources) {
    let run;
    root((r) => {
        run = () => {
            const { layers } = makeDynGraph(r, width, totalLayers, staticFraction, nSources);
            const leaves = layers[layers.length - 1];
            for (let i = 0; i < leaves.length; i++) {
                sink += leaves[i].get();
            }
            return layers;
        };
    });
    return run;
}

function setupDynUpdate(width, totalLayers, staticFraction, nSources, readFraction) {
    let run;
    root((r) => {
        const { sources, layers } = makeDynGraph(r, width, totalLayers, staticFraction, nSources);
        const leaves = layers[layers.length - 1];
        for (let i = 0; i < leaves.length; i++) {
            sink += leaves[i].get();
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
            sources[sourceDex].post(iter + sourceDex);
            flush();
            for (let i = 0; i < readLen; i++) {
                sink += readLeaves[i].get();
            }
        };
    });
    return run;
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

saveRun('anod-post', results);
