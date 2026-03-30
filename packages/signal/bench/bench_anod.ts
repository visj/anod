// bench-anod.ts
import { bench, group, run } from 'mitata';

// Your library
import {
    batch,
    effect,
    compute,
    signal,
} from '../';
import type { IReadonlySignal } from '../';

/* === Kairo Benchmarks === */

function setupDeep() {
    const len = 50;
    const head = signal(0);
    let current: IReadonlySignal<number> = head;
    
    for (let i = 0; i < len; i++) {
        const cSignal = current;
        current = compute(c => c.read(cSignal) + 1);
    }
    
    effect(c => {
        c.read(current);
    });
    
    let i = 0;
    return () => {
        batch(() => head.set(++i));
    };
}

function setupBroad() {
    const head = signal(0);
    for (let i = 0; i < 50; i++) {
        const current = compute<number>(c => c.read(head) + i);
        const current2 = compute(c => c.read(current) + 1);
        effect(c => {
            c.read(current2);
        });
    }
    
    let i = 0;
    return () => {
        batch(() => head.set(++i));
    };
}

function setupDiamond() {
    const width = 5;
    const head = signal(0);
    const branches: IReadonlySignal<number>[] = [];
    
    for (let i = 0; i < width; i++) {
        branches.push(compute(c => c.read(head) + 1));
    }
    
    const sum = compute(c =>
        branches.map(x => c.read(x)).reduce((a, b) => a + b, 0),
    );
    
    effect(c => {
        c.read(sum);
    });
    
    let i = 0;
    return () => {
        batch(() => head.set(++i));
    };
}

function setupTriangle() {
    const width = 10;
    const head = signal(0);
    let current: IReadonlySignal<number> = head;
    const list: IReadonlySignal<number>[] = [];
    
    for (let i = 0; i < width; i++) {
        const prev = current;
        list.push(current);
        current = compute(c => c.read(prev) + 1);
    }
    
    const sum = compute(c =>
        list.map(x => c.read(x)).reduce((a, b) => a + b, 0),
    );
    
    effect(c => {
        c.read(sum);
    });
    
    let i = 0;
    return () => {
        batch(() => head.set(++i));
    };
}

function setupMux() {
    const heads = new Array(100).fill(null).map(() => signal(0));
    const mux = compute(c =>
        heads.map(h => c.read(h)),
    );
    
    const splited = heads
        .map((_, index) => compute(c => c.read(mux)[index]!))
        .map(x => compute(c => c.read(x) + 1));
        
    for (const x of splited) {
        effect(c => {
            c.read(x);
        });
    }
    
    let i = 0;
    return () => {
        const idx = i % heads.length;
        batch(() => heads[idx]!.set(++i));
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
        c.read(current);
    });
    
    let i = 0;
    return () => {
        batch(() => head.set(++i));
    };
}

function setupAvoidable() {
    const head = signal(0);
    const computed1 = compute(c => c.read(head));
    const computed2 = compute(c => {
        c.read(computed1);
        return 0;
    });
    const computed3 = compute(c => c.read(computed2) + 1);
    const computed4 = compute(c => c.read(computed3) + 2);
    const computed5 = compute(c => c.read(computed4) + 3);
    
    effect(c => {
        c.read(computed5);
    });
    
    let i = 0;
    return () => {
        batch(() => head.set(++i));
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
        c.read(current);
    });
    
    let i = 0;
    return () => {
        batch(() => head.set(++i));
    };
}

/* === CellX Benchmark === */

function setupCellx(layers: number) {
    const start = {
        prop1: signal(1),
        prop2: signal(2),
        prop3: signal(3),
        prop4: signal(4),
    };
    
    type CellxLayer = {
        prop1: IReadonlySignal<number>;
        prop2: IReadonlySignal<number>;
        prop3: IReadonlySignal<number>;
        prop4: IReadonlySignal<number>;
    };
    
    let layer: CellxLayer = start;

    for (let i = layers; i > 0; i--) {
        const m = layer;
        const s = {
            prop1: compute(c => c.read(m.prop2)),
            prop2: compute(c => c.read(m.prop1) - c.read(m.prop3)),
            prop3: compute(c => c.read(m.prop2) + c.read(m.prop4)),
            prop4: compute(c => c.read(m.prop3)),
        };

        effect(c => { c.read(s.prop1); });
        effect(c => { c.read(s.prop2); });
        effect(c => { c.read(s.prop3); });
        effect(c => { c.read(s.prop4); });
        effect(c => { c.read(s.prop1); });
        effect(c => { c.read(s.prop2); });
        effect(c => { c.read(s.prop3); });
        effect(c => { c.read(s.prop4); });

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
        
        // We read them directly since this is the outside observer mimicking framework output
        end.prop1.val();
        end.prop2.val();
        end.prop3.val();
        end.prop4.val();
    };
}

/* === $mol_wire Benchmark === */

function setupMolWire() {
    const fib = (n: number): number => {
        if (n < 2) return 1;
        return fib(n - 1) + fib(n - 2);
    };
    const hard = (n: number, _log: string) => n + fib(16);
    const numbers = Array.from({ length: 5 }, (_, i) => i);

    const A = signal(0);
    const B = signal(0);
    const C = compute(c => (c.read(A) % 2) + (c.read(B) % 2));
    const D = compute(c =>
        numbers.map(i => ({ x: i + (c.read(A) % 2) - (c.read(B) % 2) })),
    );
    const E = compute(c => hard(c.read(C) + c.read(A) + c.read(D)[0]!.x, 'E'));
    const F = compute(c => hard(c.read(D)[2]!.x || c.read(B), 'F'));
    const G = compute(
        c => c.read(C) + (c.read(C) || c.read(E) % 2) + c.read(D)[4]!.x + c.read(F),
    );
    
    effect(c => {
        hard(c.read(G), 'H');
    });
    effect(c => {
        c.read(G);
    });
    effect(c => {
        hard(c.read(F), 'J');
    });

    let i = 0;
    return () => {
        i++;
        batch(() => {
            B.set(1);
            A.set(1 + i * 2);
        });
        batch(() => {
            A.set(2 + i * 2);
            B.set(2);
        });
    };
}

/* === Creation Benchmarks === */

function benchCreateSignals(count: number) {
    return () => {
        for (let i = 0; i < count; i++) {
            signal(i);
        }
    };
}

function benchCreateComputations(count: number) {
    return () => {
        const src = signal(0);
        for (let i = 0; i < count; i++) {
            const comp = compute(c => c.read(src));
            effect(c => {
                c.read(comp);
            });
        }
    };
}

/* === Run Benchmarks === */

const kairoBenchmarks = [
    ['deep propagation', setupDeep],
    ['broad propagation', setupBroad],
    ['diamond', setupDiamond],
    ['triangle', setupTriangle],
    ['mux', setupMux],
    ['unstable', setupUnstable],
    ['avoidable propagation', setupAvoidable],
    ['repeated observers', setupRepeatedObservers],
] as const;

for (const [name, setup] of kairoBenchmarks) {
    group(`Kairo: ${name}`, () => {
        bench('anod (explicit context)', setup());
    });
}

for (const layers of [10]) {
    group(`CellX ${layers} layers`, () => {
        bench('anod (explicit context)', setupCellx(layers));
    });
}

group('$mol_wire', () => {
    bench('anod (explicit context)', setupMolWire());
});

group('Create 1k signals', () => {
    bench('anod (explicit context)', benchCreateSignals(1_000));
});

group('Create 1k computations', () => {
    bench('anod (explicit context)', benchCreateComputations(1_000));
});

await run();