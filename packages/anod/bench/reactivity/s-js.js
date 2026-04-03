import { bench, group, run } from 'mitata';
import S from 's-js';

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
            S.freeze(() => { head(++i); });
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
            S.freeze(() => { head(++i); });
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
            S.freeze(() => { head(++i); });
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
            S.freeze(() => { head(++i); });
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
            S.freeze(() => { heads[idx](++i); });
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
            S.freeze(() => { head(++i); });
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
            S.freeze(() => { head(++i); });
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
            S.freeze(() => { head(++i); });
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
        S(() => { const v = G();             counter += v; sink += counter; });
        S(() => { const v = hard(F(), 'J'); counter += v; sink += counter; });
        let i = 0;
        return () => {
            i++;
            S.freeze(() => { B(1); A(1 + i * 2); });
            S.freeze(() => { A(2 + i * 2); B(2); });
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

/* === Run === */

group('Kairo: deep propagation',    () => { bench('S.js', setupDeep()); });
group('Kairo: broad propagation',   () => { bench('S.js', setupBroad()); });
group('Kairo: diamond',             () => { bench('S.js', setupDiamond()); });
group('Kairo: triangle',            () => { bench('S.js', setupTriangle()); });
group('Kairo: mux',                 () => { bench('S.js', setupMux()); });
group('Kairo: unstable',            () => { bench('S.js', setupUnstable()); });
group('Kairo: avoidable propagation', () => { bench('S.js', setupAvoidable()); });
group('Kairo: repeated observers',  () => { bench('S.js', setupRepeatedObservers()); });
group('CellX 10 layers',            () => { bench('S.js', setupCellx(10)); });
group('$mol_wire',                  () => { bench('S.js', setupMolWire()); });
group('Create 1k signals',          () => { bench('S.js', benchCreateSignals(1_000)); });
group('Create 1k computations',     () => { bench('S.js', benchCreateComputations(1_000)); });

await run();

console.log(sink, counter);
