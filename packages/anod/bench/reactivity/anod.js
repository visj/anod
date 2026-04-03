import { bench, group, run } from 'mitata';
import {
    batch,
    effect,
    compute,
    signal,
} from '../../dist/index.mjs';

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
        current = compute(c => c.read(prev) + 1);
    }
    const tail = current;
    effect(c => {
        const v = c.read(tail);
        counter += v;
        sink += counter;
    });
    let i = 0;
    return () => {
        batch(() => { head.set(++i); });
    };
}

function setupBroad() {
    const head = signal(0);
    for (let i = 0; i < 50; i++) {
        const current = compute(c => c.read(head) + i);
        const current2 = compute(c => c.read(current) + 1);
        effect(c => {
            const v = c.read(current2);
            counter += v;
            sink += counter;
        });
    }
    let i = 0;
    return () => {
        batch(() => { head.set(++i); });
    };
}

function setupDiamond() {
    const width = 5;
    const head = signal(0);
    const branches = [];
    for (let i = 0; i < width; i++) {
        branches.push(compute(c => c.read(head) + 1));
    }
    const sum = compute(c => branches.reduce((a, b) => a + c.read(b), 0));
    effect(c => {
        const v = c.read(sum);
        counter += v;
        sink += counter;
    });
    let i = 0;
    return () => {
        batch(() => { head.set(++i); });
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
        current = compute(c => c.read(prev) + 1);
    }
    const sum = compute(c => list.reduce((a, b) => a + c.read(b), 0));
    effect(c => {
        const v = c.read(sum);
        counter += v;
        sink += counter;
    });
    let i = 0;
    return () => {
        batch(() => { head.set(++i); });
    };
}

function setupMux() {
    const heads = new Array(100).fill(null).map(() => signal(0));
    const mux = compute(c => heads.map(h => c.read(h)));
    const split = heads
        .map((_, index) => compute(c => c.read(mux)[index]))
        .map(x => compute(c => c.read(x) + 1));
    for (const x of split) {
        effect(c => {
            const v = c.read(x);
            counter += v;
            sink += counter;
        });
    }
    let i = 0;
    return () => {
        const idx = i % heads.length;
        batch(() => { heads[idx].set(++i); });
    };
}

function setupUnstable() {
    const head = signal(0);
    const double = compute(c => c.read(head) * 2);
    const inverse = compute(c => -c.read(head));
    const current = compute(c => {
        let result = 0;
        for (let i = 0; i < 20; i++) {
            result += c.read(head) % 2 ? c.read(double) : c.read(inverse);
        }
        return result;
    });
    effect(c => {
        const v = c.read(current);
        counter += v;
        sink += counter;
    });
    let i = 0;
    return () => {
        batch(() => { head.set(++i); });
    };
}

function setupAvoidable() {
    const head = signal(0);
    const computed1 = compute(c => c.read(head));
    const computed2 = compute(c => { c.read(computed1); return 0; });
    const computed3 = compute(c => c.read(computed2) + 1);
    const computed4 = compute(c => c.read(computed3) + 2);
    const computed5 = compute(c => c.read(computed4) + 3);
    effect(c => {
        const v = c.read(computed5);
        counter += v;
        sink += counter;
    });
    let i = 0;
    return () => {
        batch(() => { head.set(++i); });
    };
}

function setupRepeatedObservers() {
    const size = 30;
    const head = signal(0);
    const current = compute(c => {
        let result = 0;
        for (let i = 0; i < size; i++) {
            result += c.read(head);
        }
        return result;
    });
    effect(c => {
        const v = c.read(current);
        counter += v;
        sink += counter;
    });
    let i = 0;
    return () => {
        batch(() => { head.set(++i); });
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
            prop1: compute(c => c.read(m.prop2)),
            prop2: compute(c => c.read(m.prop1) - c.read(m.prop3)),
            prop3: compute(c => c.read(m.prop2) + c.read(m.prop4)),
            prop4: compute(c => c.read(m.prop3)),
        };
        effect(c => { const v = c.read(s.prop1); counter += v; sink += counter; });
        effect(c => { const v = c.read(s.prop2); counter += v; sink += counter; });
        effect(c => { const v = c.read(s.prop3); counter += v; sink += counter; });
        effect(c => { const v = c.read(s.prop4); counter += v; sink += counter; });
        effect(c => { const v = c.read(s.prop1); counter += v; sink += counter; });
        effect(c => { const v = c.read(s.prop2); counter += v; sink += counter; });
        effect(c => { const v = c.read(s.prop3); counter += v; sink += counter; });
        effect(c => { const v = c.read(s.prop4); counter += v; sink += counter; });
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
    const C = compute(c => (c.read(A) % 2) + (c.read(B) % 2));
    const D = compute(c =>
        numbers.map(i => ({ x: i + (c.read(A) % 2) - (c.read(B) % 2) })),
    );
    const E = compute(c => hard(c.read(C) + c.read(A) + c.read(D)[0].x, 'E'));
    const F = compute(c => hard(c.read(D)[2].x || c.read(B), 'F'));
    const G = compute(c =>
        c.read(C) + (c.read(C) || c.read(E) % 2) + c.read(D)[4].x + c.read(F),
    );
    effect(c => { const v = hard(c.read(G), 'H'); counter += v; sink += counter; });
    effect(c => { const v = c.read(G);             counter += v; sink += counter; });
    effect(c => { const v = hard(c.read(F), 'J'); counter += v; sink += counter; });
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
            signals[i] = signal(i);
        }
        return signals;
    };
}

function benchCreateComputations(count) {
    return () => {
        const src = signal(0);
        for (let i = 0; i < count; i++) {
            const comp = compute(c => c.read(src));
            effect(c => {
                const v = c.read(comp);
                counter += v;
                sink += counter;
            });
        }
    };
}

/* === Run === */

group('Kairo: deep propagation',    () => { bench('anod', setupDeep()); });
group('Kairo: broad propagation',   () => { bench('anod', setupBroad()); });
group('Kairo: diamond',             () => { bench('anod', setupDiamond()); });
group('Kairo: triangle',            () => { bench('anod', setupTriangle()); });
group('Kairo: mux',                 () => { bench('anod', setupMux()); });
group('Kairo: unstable',            () => { bench('anod', setupUnstable()); });
group('Kairo: avoidable propagation', () => { bench('anod', setupAvoidable()); });
group('Kairo: repeated observers',  () => { bench('anod', setupRepeatedObservers()); });
group('CellX 10 layers',            () => { bench('anod', setupCellx(10)); });
group('$mol_wire',                  () => { bench('anod', setupMolWire()); });
group('Create 1k signals',          () => { bench('anod', benchCreateSignals(1_000)); });
group('Create 1k computations',     () => { bench('anod', benchCreateComputations(1_000)); });

await run();

console.log(sink, counter);
