import { bench, group, run } from 'mitata';
import { signal, computed, effect } from 'alien-signals';

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
        current = computed(() => prev() + 1);
    }
    const tail = current;
    effect(() => {
        const v = tail();
        counter += v;
        sink += counter;
    });
    let i = 0;
    return () => {
        head(++i);
    };
}

function setupBroad() {
    const head = signal(0);
    for (let i = 0; i < 50; i++) {
        const current = computed(() => head() + i);
        const current2 = computed(() => current() + 1);
        effect(() => {
            const v = current2();
            counter += v;
            sink += counter;
        });
    }
    let i = 0;
    return () => {
        head(++i);
    };
}

function setupDiamond() {
    const width = 5;
    const head = signal(0);
    const branches = [];
    for (let i = 0; i < width; i++) {
        branches.push(computed(() => head() + 1));
    }
    const sum = computed(() => branches.reduce((a, b) => a + b(), 0));
    effect(() => {
        const v = sum();
        counter += v;
        sink += counter;
    });
    let i = 0;
    return () => {
        head(++i);
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
        current = computed(() => prev() + 1);
    }
    const sum = computed(() => list.reduce((a, b) => a + b(), 0));
    effect(() => {
        const v = sum();
        counter += v;
        sink += counter;
    });
    let i = 0;
    return () => {
        head(++i);
    };
}

function setupMux() {
    const heads = new Array(100).fill(null).map(() => signal(0));
    const mux = computed(() => heads.map(h => h()));
    const split = heads
        .map((_, index) => computed(() => mux()[index]))
        .map(x => computed(() => x() + 1));
    for (const x of split) {
        effect(() => {
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
}

function setupUnstable() {
    const head = signal(0);
    const double = computed(() => head() * 2);
    const inverse = computed(() => -head());
    const current = computed(() => {
        let result = 0;
        for (let i = 0; i < 20; i++) {
            result += head() % 2 ? double() : inverse();
        }
        return result;
    });
    effect(() => {
        const v = current();
        counter += v;
        sink += counter;
    });
    let i = 0;
    return () => {
        head(++i);
    };
}

function setupAvoidable() {
    const head = signal(0);
    const computed1 = computed(() => head());
    const computed2 = computed(() => { computed1(); return 0; });
    const computed3 = computed(() => computed2() + 1);
    const computed4 = computed(() => computed3() + 2);
    const computed5 = computed(() => computed4() + 3);
    effect(() => {
        const v = computed5();
        counter += v;
        sink += counter;
    });
    let i = 0;
    return () => {
        head(++i);
    };
}

function setupRepeatedObservers() {
    const size = 30;
    const head = signal(0);
    const current = computed(() => {
        let result = 0;
        for (let i = 0; i < size; i++) {
            result += head();
        }
        return result;
    });
    effect(() => {
        const v = current();
        counter += v;
        sink += counter;
    });
    let i = 0;
    return () => {
        head(++i);
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
            prop1: computed(() => m.prop2()),
            prop2: computed(() => m.prop1() - m.prop3()),
            prop3: computed(() => m.prop2() + m.prop4()),
            prop4: computed(() => m.prop3()),
        };
        effect(() => { const v = s.prop1(); counter += v; sink += counter; });
        effect(() => { const v = s.prop2(); counter += v; sink += counter; });
        effect(() => { const v = s.prop3(); counter += v; sink += counter; });
        effect(() => { const v = s.prop4(); counter += v; sink += counter; });
        effect(() => { const v = s.prop1(); counter += v; sink += counter; });
        effect(() => { const v = s.prop2(); counter += v; sink += counter; });
        effect(() => { const v = s.prop3(); counter += v; sink += counter; });
        effect(() => { const v = s.prop4(); counter += v; sink += counter; });
        layer = s;
    }
    const end = layer;
    let toggle = false;
    return () => {
        toggle = !toggle;
        /**
         * alien-signals has no explicit batch API — signals are set sequentially
         * and its internal scheduler coalesces propagation.
         */
        start.prop1(toggle ? 4 : 1);
        start.prop2(toggle ? 3 : 2);
        start.prop3(toggle ? 2 : 3);
        start.prop4(toggle ? 1 : 4);
        end.prop1();
        end.prop2();
        end.prop3();
        end.prop4();
    };
}

/* === $mol_wire Benchmark === */

function setupMolWire() {
    const numbers = Array.from({ length: 5 }, (_, i) => i);
    const A = signal(0);
    const B = signal(0);
    const C = computed(() => (A() % 2) + (B() % 2));
    const D = computed(() => numbers.map(i => ({ x: i + (A() % 2) - (B() % 2) })));
    const E = computed(() => hard(C() + A() + D()[0].x, 'E'));
    const F = computed(() => hard(D()[2].x || B(), 'F'));
    const G = computed(() => C() + (C() || E() % 2) + D()[4].x + F());
    effect(() => { const v = hard(G(), 'H'); counter += v; sink += counter; });
    effect(() => { const v = G();             counter += v; sink += counter; });
    effect(() => { const v = hard(F(), 'J'); counter += v; sink += counter; });
    let i = 0;
    return () => {
        i++;
        B(1); A(1 + i * 2);
        A(2 + i * 2); B(2);
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
            const comp = computed(() => src());
            effect(() => {
                const v = comp();
                counter += v;
                sink += counter;
            });
        }
    };
}

/* === Run === */

group('Kairo: deep propagation',    () => { bench('alien-signals', setupDeep()); });
group('Kairo: broad propagation',   () => { bench('alien-signals', setupBroad()); });
group('Kairo: diamond',             () => { bench('alien-signals', setupDiamond()); });
group('Kairo: triangle',            () => { bench('alien-signals', setupTriangle()); });
group('Kairo: mux',                 () => { bench('alien-signals', setupMux()); });
group('Kairo: unstable',            () => { bench('alien-signals', setupUnstable()); });
group('Kairo: avoidable propagation', () => { bench('alien-signals', setupAvoidable()); });
group('Kairo: repeated observers',  () => { bench('alien-signals', setupRepeatedObservers()); });
group('CellX 10 layers',            () => { bench('alien-signals', setupCellx(10)); });
group('$mol_wire',                  () => { bench('alien-signals', setupMolWire()); });
group('Create 1k signals',          () => { bench('alien-signals', benchCreateSignals(1_000)); });
group('Create 1k computations',     () => { bench('alien-signals', benchCreateComputations(1_000)); });

await run();

console.log(sink, counter);
