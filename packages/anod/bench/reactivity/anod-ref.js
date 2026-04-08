/**
 * Reference benchmark using only compute() and effect() — the "dumb" API
 * that matches what other frameworks expose. No derive/transmit/watch/bound
 * optimizations. This measures anod's baseline performance when used the
 * same way as alien-signals, preact-signals, etc.
 */
import { bench, group, run } from 'mitata';
import { EXPECTED, OVERRIDES_ANOD } from './expected.js';
import {
    batch,
    compute,
    effect,
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
        current = compute(c => { counter++; return c.read(prev) + 1; });
    }
    const tail = current;
    effect(c => {
        counter++;
        sink += c.read(tail);
    });
    let i = 0;
    return () => {
        batch(() => { head.set(++i); });
    };
}

function setupBroad() {
    const head = signal(0);
    for (let i = 0; i < 50; i++) {
        const current = compute(c => { counter++; return c.read(head) + i; });
        const current2 = compute(c => { counter++; return c.read(current) + 1; });
        effect(c => {
            counter++;
            sink += c.read(current2);
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
        branches.push(compute(c => { counter++; return c.read(head) + 1; }));
    }
    const sum = compute(c => {
        counter++;
        let total = 0;
        for (let i = 0; i < branches.length; i++) {
            total += c.read(branches[i]);
        }
        return total;
    });
    effect(c => {
        counter++;
        sink += c.read(sum);
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
    for (let i = 0; i < width - 1; i++) {
        const prev = current;
        list.push(current);
        current = compute(c => { counter++; return c.read(prev) + 1; });
    }
    list.push(current);
    const sum = compute(c => {
        counter++;
        let total = 0;
        for (let i = 0; i < list.length; i++) {
            total += c.read(list[i]);
        }
        return total;
    });
    effect(c => {
        counter++;
        sink += c.read(sum);
    });
    let i = 0;
    return () => {
        batch(() => { head.set(++i); });
    };
}

function setupMux() {
    const heads = new Array(100).fill(null).map(() => signal(0));
    const mux = compute(c => { counter++; return heads.map(h => c.read(h)); });
    const split = heads
        .map((_, index) => compute(c => { counter++; return c.read(mux)[index]; }))
        .map(x => compute(c => { counter++; return c.read(x) + 1; }));
    for (const x of split) {
        effect(c => {
            counter++;
            sink += c.read(x);
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
    const double = compute(c => { counter++; return c.read(head) * 2; });
    const inverse = compute(c => { counter++; return -c.read(head); });
    const current = compute(c => {
        counter++;
        let result = 0;
        for (let i = 0; i < 20; i++) {
            result += c.read(head) % 2 ? c.read(double) : c.read(inverse);
        }
        return result;
    });
    effect(c => {
        counter++;
        sink += c.read(current);
    });
    let i = 0;
    return () => {
        batch(() => { head.set(++i); });
    };
}

function setupAvoidable() {
    const head = signal(0);
    const computed1 = compute(c => { counter++; return c.read(head); });
    const computed2 = compute(c => { counter++; c.read(computed1); return 0; });
    const computed3 = compute(c => { counter++; return c.read(computed2) + 1; });
    const computed4 = compute(c => { counter++; return c.read(computed3) + 2; });
    const computed5 = compute(c => { counter++; return c.read(computed4) + 3; });
    effect(c => {
        counter++;
        sink += c.read(computed5);
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
        counter++;
        let result = 0;
        for (let i = 0; i < size; i++) {
            result += c.read(head);
        }
        return result;
    });
    effect(c => {
        counter++;
        sink += c.read(current);
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
            prop1: compute(c => { counter++; return c.read(m.prop2); }),
            prop2: compute(c => { counter++; return c.read(m.prop1) - c.read(m.prop3); }),
            prop3: compute(c => { counter++; return c.read(m.prop2) + c.read(m.prop4); }),
            prop4: compute(c => { counter++; return c.read(m.prop3); }),
        };
        effect(c => { counter++; sink += c.read(s.prop1); });
        effect(c => { counter++; sink += c.read(s.prop2); });
        effect(c => { counter++; sink += c.read(s.prop3); });
        effect(c => { counter++; sink += c.read(s.prop4); });
        effect(c => { counter++; sink += c.read(s.prop1); });
        effect(c => { counter++; sink += c.read(s.prop2); });
        effect(c => { counter++; sink += c.read(s.prop3); });
        effect(c => { counter++; sink += c.read(s.prop4); });
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
    const C = compute(c => { counter++; return (c.read(A) % 2) + (c.read(B) % 2); });
    const D = compute(c => {
        counter++;
        return numbers.map(i => ({ x: i + (c.read(A) % 2) - (c.read(B) % 2) }));
    });
    const E = compute(c => { counter++; return hard(c.read(C) + c.read(A) + c.read(D)[0].x, 'E'); });
    const F = compute(c => { counter++; return hard(c.read(D)[2].x || c.read(B), 'F'); });
    const G = compute(c => {
        counter++;
        return c.read(C) + (c.read(C) || c.read(E) % 2) + c.read(D)[4].x + c.read(F);
    });
    effect(c => { counter++; sink += hard(c.read(G), 'H'); });
    effect(c => { counter++; sink += c.read(G); });
    effect(c => { counter++; sink += hard(c.read(F), 'J'); });
    let i = 0;
    return () => {
        i++;
        batch(() => { B.set(1); A.set(1 + i * 2); });
        batch(() => { A.set(2 + i * 2); B.set(2); });
    };
}

/* === Validation === */

function validate(name, setupFn) {
    const expected = OVERRIDES_ANOD[name] ?? EXPECTED[name];
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

/* === Run === */

group('Kairo: deep propagation', () => { bench('anod-ref', setupDeep()); });
group('Kairo: broad propagation', () => { bench('anod-ref', setupBroad()); });
group('Kairo: diamond', () => { bench('anod-ref', setupDiamond()); });
group('Kairo: triangle', () => { bench('anod-ref', setupTriangle()); });
group('Kairo: mux', () => { bench('anod-ref', setupMux()); });
group('Kairo: unstable', () => { bench('anod-ref', setupUnstable()); });
group('Kairo: avoidable propagation', () => { bench('anod-ref', setupAvoidable()); });
group('Kairo: repeated observers', () => { bench('anod-ref', setupRepeatedObservers()); });
group('CellX 10 layers', () => { bench('anod-ref', setupCellx(10)); });
group('$mol_wire', () => { bench('anod-ref', setupMolWire()); });

await run();

console.log(sink, counter);
