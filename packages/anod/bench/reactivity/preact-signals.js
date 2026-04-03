import { bench, group, run } from 'mitata';
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
        current = computed(() => prev.value + 1);
    }
    const tail = current;
    effect(() => {
        const v = tail.value;
        counter += v;
        sink += counter;
    });
    let i = 0;
    return () => {
        batch(() => { head.value = ++i; });
    };
}

function setupBroad() {
    const head = signal(0);
    for (let i = 0; i < 50; i++) {
        const current = computed(() => head.value + i);
        const current2 = computed(() => current.value + 1);
        effect(() => {
            const v = current2.value;
            counter += v;
            sink += counter;
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
        branches.push(computed(() => head.value + 1));
    }
    const sum = computed(() => branches.reduce((a, b) => a + b.value, 0));
    effect(() => {
        const v = sum.value;
        counter += v;
        sink += counter;
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
    for (let i = 0; i < width; i++) {
        const prev = current;
        list.push(current);
        current = computed(() => prev.value + 1);
    }
    const sum = computed(() => list.reduce((a, b) => a + b.value, 0));
    effect(() => {
        const v = sum.value;
        counter += v;
        sink += counter;
    });
    let i = 0;
    return () => {
        batch(() => { head.value = ++i; });
    };
}

function setupMux() {
    const heads = new Array(100).fill(null).map(() => signal(0));
    const mux = computed(() => heads.map(h => h.value));
    const split = heads
        .map((_, index) => computed(() => mux.value[index]))
        .map(x => computed(() => x.value + 1));
    for (const x of split) {
        effect(() => {
            const v = x.value;
            counter += v;
            sink += counter;
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
    const double = computed(() => head.value * 2);
    const inverse = computed(() => -head.value);
    const current = computed(() => {
        let result = 0;
        for (let i = 0; i < 20; i++) {
            result += head.value % 2 ? double.value : inverse.value;
        }
        return result;
    });
    effect(() => {
        const v = current.value;
        counter += v;
        sink += counter;
    });
    let i = 0;
    return () => {
        batch(() => { head.value = ++i; });
    };
}

function setupAvoidable() {
    const head = signal(0);
    const computed1 = computed(() => head.value);
    const computed2 = computed(() => { computed1.value; return 0; });
    const computed3 = computed(() => computed2.value + 1);
    const computed4 = computed(() => computed3.value + 2);
    const computed5 = computed(() => computed4.value + 3);
    effect(() => {
        const v = computed5.value;
        counter += v;
        sink += counter;
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
        let result = 0;
        for (let i = 0; i < size; i++) {
            result += head.value;
        }
        return result;
    });
    effect(() => {
        const v = current.value;
        counter += v;
        sink += counter;
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
            prop1: computed(() => m.prop2.value),
            prop2: computed(() => m.prop1.value - m.prop3.value),
            prop3: computed(() => m.prop2.value + m.prop4.value),
            prop4: computed(() => m.prop3.value),
        };
        effect(() => { const v = s.prop1.value; counter += v; sink += counter; });
        effect(() => { const v = s.prop2.value; counter += v; sink += counter; });
        effect(() => { const v = s.prop3.value; counter += v; sink += counter; });
        effect(() => { const v = s.prop4.value; counter += v; sink += counter; });
        effect(() => { const v = s.prop1.value; counter += v; sink += counter; });
        effect(() => { const v = s.prop2.value; counter += v; sink += counter; });
        effect(() => { const v = s.prop3.value; counter += v; sink += counter; });
        effect(() => { const v = s.prop4.value; counter += v; sink += counter; });
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
    const C = computed(() => (A.value % 2) + (B.value % 2));
    const D = computed(() => numbers.map(i => ({ x: i + (A.value % 2) - (B.value % 2) })));
    const E = computed(() => hard(C.value + A.value + D.value[0].x, 'E'));
    const F = computed(() => hard(D.value[2].x || B.value, 'F'));
    const G = computed(() => C.value + (C.value || E.value % 2) + D.value[4].x + F.value);
    effect(() => { const v = hard(G.value, 'H'); counter += v; sink += counter; });
    effect(() => { const v = G.value;             counter += v; sink += counter; });
    effect(() => { const v = hard(F.value, 'J'); counter += v; sink += counter; });
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
            const comp = computed(() => src.value);
            effect(() => {
                const v = comp.value;
                counter += v;
                sink += counter;
            });
        }
    };
}

/* === Run === */

group('Kairo: deep propagation',    () => { bench('preact-signals', setupDeep()); });
group('Kairo: broad propagation',   () => { bench('preact-signals', setupBroad()); });
group('Kairo: diamond',             () => { bench('preact-signals', setupDiamond()); });
group('Kairo: triangle',            () => { bench('preact-signals', setupTriangle()); });
group('Kairo: mux',                 () => { bench('preact-signals', setupMux()); });
group('Kairo: unstable',            () => { bench('preact-signals', setupUnstable()); });
group('Kairo: avoidable propagation', () => { bench('preact-signals', setupAvoidable()); });
group('Kairo: repeated observers',  () => { bench('preact-signals', setupRepeatedObservers()); });
group('CellX 10 layers',            () => { bench('preact-signals', setupCellx(10)); });
group('$mol_wire',                  () => { bench('preact-signals', setupMolWire()); });
group('Create 1k signals',          () => { bench('preact-signals', benchCreateSignals(1_000)); });
group('Create 1k computations',     () => { bench('preact-signals', benchCreateComputations(1_000)); });

await run();

console.log(sink, counter);
