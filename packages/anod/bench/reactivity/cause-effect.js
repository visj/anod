import { bench, group, run } from 'mitata';
import { createState, createMemo, createEffect } from '@zeix/cause-effect';

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
        current = createMemo(() => prev.get() + 1);
    }
    const tail = current;
    createEffect(() => {
        const v = tail.get();
        counter += v;
        sink += counter;
    });
    let i = 0;
    return () => {
        head.set(++i);
    };
}

function setupBroad() {
    const head = createState(0);
    for (let i = 0; i < 50; i++) {
        const current = createMemo(() => head.get() + i);
        const current2 = createMemo(() => current.get() + 1);
        createEffect(() => {
            const v = current2.get();
            counter += v;
            sink += counter;
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
        branches.push(createMemo(() => head.get() + 1));
    }
    const sum = createMemo(() => branches.reduce((a, b) => a + b.get(), 0));
    createEffect(() => {
        const v = sum.get();
        counter += v;
        sink += counter;
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
    for (let i = 0; i < width; i++) {
        const prev = current;
        list.push(current);
        current = createMemo(() => prev.get() + 1);
    }
    const sum = createMemo(() => list.reduce((a, b) => a + b.get(), 0));
    createEffect(() => {
        const v = sum.get();
        counter += v;
        sink += counter;
    });
    let i = 0;
    return () => {
        head.set(++i);
    };
}

function setupMux() {
    const heads = new Array(100).fill(null).map(() => createState(0));
    const mux = createMemo(() => heads.map(h => h.get()));
    const split = heads
        .map((_, index) => createMemo(() => mux.get()[index]))
        .map(x => createMemo(() => x.get() + 1));
    for (const x of split) {
        createEffect(() => {
            const v = x.get();
            counter += v;
            sink += counter;
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
    const double = createMemo(() => head.get() * 2);
    const inverse = createMemo(() => -head.get());
    const current = createMemo(() => {
        let result = 0;
        for (let i = 0; i < 20; i++) {
            result += head.get() % 2 ? double.get() : inverse.get();
        }
        return result;
    });
    createEffect(() => {
        const v = current.get();
        counter += v;
        sink += counter;
    });
    let i = 0;
    return () => {
        head.set(++i);
    };
}

function setupAvoidable() {
    const head = createState(0);
    const computed1 = createMemo(() => head.get());
    const computed2 = createMemo(() => { computed1.get(); return 0; });
    const computed3 = createMemo(() => computed2.get() + 1);
    const computed4 = createMemo(() => computed3.get() + 2);
    const computed5 = createMemo(() => computed4.get() + 3);
    createEffect(() => {
        const v = computed5.get();
        counter += v;
        sink += counter;
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
        let result = 0;
        for (let i = 0; i < size; i++) {
            result += head.get();
        }
        return result;
    });
    createEffect(() => {
        const v = current.get();
        counter += v;
        sink += counter;
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
            prop1: createMemo(() => m.prop2.get()),
            prop2: createMemo(() => m.prop1.get() - m.prop3.get()),
            prop3: createMemo(() => m.prop2.get() + m.prop4.get()),
            prop4: createMemo(() => m.prop3.get()),
        };
        createEffect(() => { const v = s.prop1.get(); counter += v; sink += counter; });
        createEffect(() => { const v = s.prop2.get(); counter += v; sink += counter; });
        createEffect(() => { const v = s.prop3.get(); counter += v; sink += counter; });
        createEffect(() => { const v = s.prop4.get(); counter += v; sink += counter; });
        createEffect(() => { const v = s.prop1.get(); counter += v; sink += counter; });
        createEffect(() => { const v = s.prop2.get(); counter += v; sink += counter; });
        createEffect(() => { const v = s.prop3.get(); counter += v; sink += counter; });
        createEffect(() => { const v = s.prop4.get(); counter += v; sink += counter; });
        layer = s;
    }
    const end = layer;
    let toggle = false;
    return () => {
        toggle = !toggle;
        /**
         * cause-effect has no explicit batch API — signals are set sequentially
         * and the library propagates each change immediately.
         */
        start.prop1.set(toggle ? 4 : 1);
        start.prop2.set(toggle ? 3 : 2);
        start.prop3.set(toggle ? 2 : 3);
        start.prop4.set(toggle ? 1 : 4);
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
    const C = createMemo(() => (A.get() % 2) + (B.get() % 2));
    const D = createMemo(() => numbers.map(i => ({ x: i + (A.get() % 2) - (B.get() % 2) })));
    const E = createMemo(() => hard(C.get() + A.get() + D.get()[0].x, 'E'));
    const F = createMemo(() => hard(D.get()[2].x || B.get(), 'F'));
    const G = createMemo(() => C.get() + (C.get() || E.get() % 2) + D.get()[4].x + F.get());
    createEffect(() => { const v = hard(G.get(), 'H'); counter += v; sink += counter; });
    createEffect(() => { const v = G.get();             counter += v; sink += counter; });
    createEffect(() => { const v = hard(F.get(), 'J'); counter += v; sink += counter; });
    let i = 0;
    return () => {
        i++;
        B.set(1); A.set(1 + i * 2);
        A.set(2 + i * 2); B.set(2);
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
            const comp = createMemo(() => src.get());
            createEffect(() => {
                const v = comp.get();
                counter += v;
                sink += counter;
            });
        }
    };
}

/* === Run === */

group('Kairo: deep propagation',    () => { bench('cause-effect', setupDeep()); });
group('Kairo: broad propagation',   () => { bench('cause-effect', setupBroad()); });
group('Kairo: diamond',             () => { bench('cause-effect', setupDiamond()); });
group('Kairo: triangle',            () => { bench('cause-effect', setupTriangle()); });
group('Kairo: mux',                 () => { bench('cause-effect', setupMux()); });
group('Kairo: unstable',            () => { bench('cause-effect', setupUnstable()); });
group('Kairo: avoidable propagation', () => { bench('cause-effect', setupAvoidable()); });
group('Kairo: repeated observers',  () => { bench('cause-effect', setupRepeatedObservers()); });
group('CellX 10 layers',            () => { bench('cause-effect', setupCellx(10)); });
group('$mol_wire',                  () => { bench('cause-effect', setupMolWire()); });
group('Create 1k signals',          () => { bench('cause-effect', benchCreateSignals(1_000)); });
group('Create 1k computations',     () => { bench('cause-effect', benchCreateComputations(1_000)); });

await run();

console.log(sink, counter);
