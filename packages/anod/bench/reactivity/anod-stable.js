import { bench, group, run } from 'mitata';
import {
    batch,
    compute,
    signal,
    Signal,
    OPT_STABLE,
    OPT_NOTIFY
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
        current = prev.derive((_, val) => val + 1, 0, OPT_NOTIFY);
    }
    current.watch((_, val) => {
        counter += val;
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
        const current = head.derive((_, val) => val + i, 0, OPT_NOTIFY);
        const current2 = current.derive((_, val) => val + 1, 0, OPT_NOTIFY);
        current2.watch((_, val) => {
            counter += val;
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
        branches.push(head.derive((_, val) => val + 1, 0, OPT_NOTIFY));
    }
    /** Deps are always the same `width` branches; OPT_STABLE freezes after setup. */
    const sum = compute(c => branches.reduce((a, b) => a + c.read(b), 0), 0, OPT_STABLE | OPT_NOTIFY);
    sum.watch((_, val) => {
        counter += val;
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
        current = prev.derive((_, val) => val + 1, 0, OPT_NOTIFY);
    }
    /** Deps are always the same `width` nodes in `list`; OPT_STABLE freezes after setup. */
    const sum = compute(c => list.reduce((a, b) => a + c.read(b), 0), 0, OPT_STABLE | OPT_NOTIFY);
    sum.watch((_, val) => {
        counter += val;
        sink += counter;
    });
    let i = 0;
    return () => {
        batch(() => { head.set(++i); });
    };
}

function setupMux() {
    const heads = new Array(100).fill(null).map(() => signal(0));
    /** Deps are always the same 100 heads; OPT_STABLE freezes after setup. */
    const mux = compute(c => heads.map(h => c.read(h)), null, OPT_STABLE | OPT_NOTIFY);
    const split = heads
        .map((_, index) => mux.derive((_, val) => val[index]))
        .map(x => x.derive((_, val) => val + 1, 0, OPT_NOTIFY));
    for (const x of split) {
        x.watch((_, val) => {
            counter += val;
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
    const double = head.derive((_, val) => val * 2, 0, OPT_NOTIFY);
    const inverse = head.derive((_, val) => -val, 0, OPT_NOTIFY);
    /** Deps switch between `double` and `inverse` per parity; cannot be made stable. */
    const current = compute(c => {
        let result = 0;
        for (let i = 0; i < 20; i++) {
            result += c.read(head) % 2 ? c.read(double) : c.read(inverse);
        }
        return result;
    });
    current.watch((_, val) => {
        counter += val;
        sink += counter;
    });
    let i = 0;
    return () => {
        batch(() => { head.set(++i); });
    };
}

function setupAvoidable() {
    const head = signal(0);
    const computed1 = head.derive((_, val) => val, 0, OPT_NOTIFY);
    const computed2 = computed1.derive(() => 0);
    const computed3 = computed2.derive((_, val) => val + 1, 0, OPT_NOTIFY);
    const computed4 = computed3.derive((_, val) => val + 2, 0, OPT_NOTIFY);
    const computed5 = computed4.derive((_, val) => val + 3, 0, OPT_NOTIFY);
    computed5.watch((_, val) => {
        counter += val;
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
    const current = head.derive((_, val) => {
        let result = 0;
        for (let i = 0; i < size; i++) {
            result += val;
        }
        return result;
    }, 0, OPT_NOTIFY);
    current.watch((_, val) => {
        counter += val;
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
            prop1: m.prop2.derive((_, val) => val, 0, OPT_NOTIFY),
            /** Two deps; OPT_STABLE tracks them on first run then freezes. */
            prop2: compute(c => c.read(m.prop1) - c.read(m.prop3), 0, OPT_STABLE),
            prop3: compute(c => c.read(m.prop2) + c.read(m.prop4), 0, OPT_STABLE),
            prop4: m.prop3.derive((_, val) => val, 0, OPT_NOTIFY),
        };
        s.prop1.watch((_, val) => { counter += val; sink += counter; });
        s.prop2.watch((_, val) => { counter += val; sink += counter; });
        s.prop3.watch((_, val) => { counter += val; sink += counter; });
        s.prop4.watch((_, val) => { counter += val; sink += counter; });
        s.prop1.watch((_, val) => { counter += val; sink += counter; });
        s.prop2.watch((_, val) => { counter += val; sink += counter; });
        s.prop3.watch((_, val) => { counter += val; sink += counter; });
        s.prop4.watch((_, val) => { counter += val; sink += counter; });
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
    /** C, D and E always read the same deps; OPT_STABLE freezes after setup. */
    const C = compute(c => (c.read(A) % 2) + (c.read(B) % 2), 0, OPT_STABLE);
    const D = compute(c =>
        numbers.map(i => ({ x: i + (c.read(A) % 2) - (c.read(B) % 2) })),
    null, OPT_STABLE | OPT_NOTIFY);
    const E = compute(c => hard(c.read(C) + c.read(A) + c.read(D)[0].x, 'E'), 0, OPT_STABLE);
    /** F and G have conditional reads; dynamic tracking required. */
    const F = compute(c => hard(c.read(D)[2].x || c.read(B), 'F'));
    const G = compute(c =>
        c.read(C) + (c.read(C) || c.read(E) % 2) + c.read(D)[4].x + c.read(F),
    );
    G.watch((_, val) => {
        const v = hard(val, 'H');
        counter += v;
        sink += counter;
    });
    G.watch((_, val) => {
        counter += val;
        sink += counter;
    });
    F.watch((_, val) => {
        const v = hard(val, 'J');
        counter += v;
        sink += counter;
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
            signals[i] = new Signal(i);
        }
        return signals;
    };
}

function benchCreateComputations(count) {
    return () => {
        const src = signal(0);
        for (let i = 0; i < count; i++) {
            const comp = src.derive((_, val) => val);
            comp.watch((_, val) => {
                counter += val;
                sink += counter;
            });
        }
    };
}

/* === Run === */

group('Kairo: deep propagation',    () => { bench('anod stable', setupDeep()); });
group('Kairo: broad propagation',   () => { bench('anod stable', setupBroad()); });
group('Kairo: diamond',             () => { bench('anod stable', setupDiamond()); });
group('Kairo: triangle',            () => { bench('anod stable', setupTriangle()); });
group('Kairo: mux',                 () => { bench('anod stable', setupMux()); });
group('Kairo: unstable',            () => { bench('anod stable', setupUnstable()); });
group('Kairo: avoidable propagation', () => { bench('anod stable', setupAvoidable()); });
group('Kairo: repeated observers',  () => { bench('anod stable', setupRepeatedObservers()); });
group('CellX 10 layers',            () => { bench('anod stable', setupCellx(10)); });
group('$mol_wire',                  () => { bench('anod stable', setupMolWire()); });
group('Create 1k signals',          () => { bench('anod stable', benchCreateSignals(1_000)); });
group('Create 1k computations',     () => { bench('anod stable', benchCreateComputations(1_000)); });

await run();

console.log(sink, counter);
