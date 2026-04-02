import { bench, group, run } from 'mitata';

// Competitor libraries
import S from 's-js';
import { createSignal as solidSignal, createMemo as solidMemo, createEffect as solidEffect } from '@solidjs/signals';
import { signal as preactSignal, computed as preactComputed, effect as preactEffect, batch as preactBatch } from '@preact/signals-core';
import { signal as alienSignal, computed as alienComputed, effect as alienEffect } from 'alien-signals';
import { createState as zeixState, createMemo as zeixMemo, createEffect as zeixEffect } from '@zeix/cause-effect';

// Your library
import {
    batch as anodBatch,
    effect as anodEffect,
    compute as anodCompute,
    signal as anodSignal,
} from '../dist/index.mjs';

/* === Framework Adapters === */

const frameworks = [
    {
        name: 'S.js',
        signal: (initialValue) => {
            const data = S.data(initialValue);
            return { val() { return data() }, set: data };
        },
        computed: (fn) => {
            const comp = S(fn);
            return { val() { return comp() } };
        },
        effect: (fn) => S(fn),
        withBatch: (fn) => S.freeze(fn),
        withBuild: (fn) => S.root(fn),
    },
    // {
    // 	name: 'solid-js',
    // 	signal: (initialValue: any) => {
    // 		const [get, set] = solidSignal(initialValue);
    // 		return { val() { return get() }, set };
    // 	},
    // 	computed: (fn: () => any) => {
    // 		const memo = solidMemo(fn);
    // 		return { val() { return memo() } };
    // 	},
    // 	effect: (fn: () => any) => solidEffect(fn, fn),
    // 	withBatch: (fn: () => any) => fn(), // Solid auto-batches, but you can import batch if strictly needed
    // 	withBuild: <T>(fn: () => T) => fn(), 
    // },
    {
        name: 'preact-signals',
        signal: (initialValue) => {
            const sig = preactSignal(initialValue);
            return { val() { return sig.value }, set: (v) => sig.value = v };
        },
        computed: (fn) => {
            const comp = preactComputed(fn);
            return { val() { return comp.value } };
        },
        effect: (fn) => preactEffect(fn),
        withBatch: preactBatch,
        withBuild: (fn) => fn(),
    },
    {
        name: 'alien-signals',
        signal: (initialValue) => {
            const sig = alienSignal(initialValue);
            return { val() { return sig() }, set: sig };
        },
        computed: (fn) => {
            const comp = alienComputed(fn);
            return { val() { return comp() } };
        },
        effect: (fn) => alienEffect(fn),
        withBatch: (fn) => fn(), // alien-signals usually relies on its system for scheduling
        withBuild: (fn) => fn(),
    },
    {
        name: 'cause-effect',
        signal: (initialValue) => {
            const state = zeixState(initialValue);
            return { val() { return state.get() }, set: (v) => state.set(v) };
        },
        computed: (fn) => {
            const memo = zeixMemo(fn);
            return { val() { return memo.get() } };
        },
        effect: (fn) => zeixEffect(fn),
        withBatch: (fn) => fn(),
        withBuild: (fn) => fn(),
    }
]

/* === Generic Setup Benchmarks === */

function setupDeep(fw) {
    return fw.withBuild(() => {
        const len = 50
        const head = fw.signal(0)
        let current = head
        for (let i = 0; i < len; i++) {
            const c = current
            current = fw.computed(() => c.val() + 1)
        }
        fw.effect(() => {
            current.val()
        })
        let i = 0
        return () => {
            fw.withBatch(() => {
                head.set(++i)
            })
        }
    })
}

function setupBroad(fw) {
    return fw.withBuild(() => {
        const head = fw.signal(0)
        for (let i = 0; i < 50; i++) {
            const current = fw.computed(() => head.val() + i)
            const current2 = fw.computed(() => current.val() + 1)
            fw.effect(() => {
                current2.val()
            })
        }
        let i = 0
        return () => {
            fw.withBatch(() => {
                head.set(++i)
            })
        }
    })
}

function setupDiamond(fw) {
    return fw.withBuild(() => {
        const width = 5
        const head = fw.signal(0)
        const branches = []
        for (let i = 0; i < width; i++) {
            branches.push(fw.computed(() => head.val() + 1))
        }
        const sum = fw.computed(() =>
            branches.map(x => x.val()).reduce((a, b) => a + b, 0),
        )
        fw.effect(() => {
            sum.val()
        })
        let i = 0
        return () => {
            fw.withBatch(() => {
                head.set(++i)
            })
        }
    })
}

function setupTriangle(fw) {
    return fw.withBuild(() => {
        const width = 10
        const head = fw.signal(0)
        let current = head
        const list = []
        for (let i = 0; i < width; i++) {
            const c = current
            list.push(current)
            current = fw.computed(() => c.val() + 1)
        }
        const sum = fw.computed(() =>
            list.map(x => x.val()).reduce((a, b) => a + b, 0),
        )
        fw.effect(() => {
            sum.val()
        })
        let i = 0
        return () => {
            fw.withBatch(() => {
                head.set(++i)
            })
        }
    })
}

function setupMux(fw) {
    return fw.withBuild(() => {
        const heads = new Array(100).fill(null).map(_ => fw.signal(0))
        const mux = fw.computed(() => {
            return heads.map(h => h.val())
        });
        const splited = heads
            .map((_, index) => fw.computed(() => mux.val()[index]))
            .map(x => fw.computed(() => x.val() + 1))
        for (const x of splited) {
            fw.effect(() => {
                x.val()
            })
        }
        let i = 0
        return () => {
            const idx = i % heads.length
            fw.withBatch(() => {
                heads[idx].set(++i)
            })
        }
    })
}

function setupUnstable(fw) {
    return fw.withBuild(() => {
        const head = fw.signal(0)
        const double = fw.computed(() => head.val() * 2)
        const inverse = fw.computed(() => -head.val())
        const current = fw.computed(() => {
            let result = 0
            for (let i = 0; i < 20; i++) {
                result += head.val() % 2 ? double.val() : inverse.val()
            }
            return result
        })
        fw.effect(() => {
            current.val()
        })
        let i = 0
        return () => {
            fw.withBatch(() => {
                head.set(++i)
            })
        }
    })
}

function setupAvoidable(fw) {
    return fw.withBuild(() => {
        const head = fw.signal(0)
        const computed1 = fw.computed(() => head.val())
        const computed2 = fw.computed(() => {
            computed1.val()
            return 0
        })
        const computed3 = fw.computed(() => computed2.val() + 1)
        const computed4 = fw.computed(() => computed3.val() + 2)
        const computed5 = fw.computed(() => computed4.val() + 3)
        fw.effect(() => {
            computed5.val()
        })
        let i = 0
        return () => {
            fw.withBatch(() => {
                head.set(++i)
            })
        }
    })
}

function setupRepeatedObservers(fw) {
    return fw.withBuild(() => {
        const size = 30
        const head = fw.signal(0)
        const current = fw.computed(() => {
            let result = 0
            for (let i = 0; i < size; i++) {
                result += head.val()
            }
            return result
        })
        fw.effect(() => {
            current.val()
        })
        let i = 0
        return () => {
            fw.withBatch(() => {
                head.set(++i)
            })
        }
    })
}

function setupCellx(fw, layers) {
    return fw.withBuild(() => {
        const start = {
            prop1: fw.signal(1),
            prop2: fw.signal(2),
            prop3: fw.signal(3),
            prop4: fw.signal(4),
        }

        let layer = start

        for (let i = layers; i > 0; i--) {
            const m = layer
            const s = {
                prop1: fw.computed(() => m.prop2.val()),
                prop2: fw.computed(() => m.prop1.val() - m.prop3.val()),
                prop3: fw.computed(() => m.prop2.val() + m.prop4.val()),
                prop4: fw.computed(() => m.prop3.val()),
            }

            fw.effect(() => { s.prop1.val() })
            fw.effect(() => { s.prop2.val() })
            fw.effect(() => { s.prop3.val() })
            fw.effect(() => { s.prop4.val() })
            fw.effect(() => { s.prop1.val() })
            fw.effect(() => { s.prop2.val() })
            fw.effect(() => { s.prop3.val() })
            fw.effect(() => { s.prop4.val() })

            layer = s
        }

        const end = layer
        let toggle = false
        return () => {
            toggle = !toggle
            fw.withBatch(() => {
                start.prop1.set(toggle ? 4 : 1)
                start.prop2.set(toggle ? 3 : 2)
                start.prop3.set(toggle ? 2 : 3)
                start.prop4.set(toggle ? 1 : 4)
            })
            end.prop1.val()
            end.prop2.val()
            end.prop3.val()
            end.prop4.val()
        }
    })
}

function setupMolWire(fw) {
    return fw.withBuild(() => {
        const fib = (n) => {
            if (n < 2) return 1
            return fib(n - 1) + fib(n - 2)
        }
        const hard = (n, _log) => n + fib(16)
        const numbers = Array.from({ length: 5 }, (_, i) => i)

        const A = fw.signal(0)
        const B = fw.signal(0)
        const C = fw.computed(() => (A.val() % 2) + (B.val() % 2))
        const D = fw.computed(() =>
            numbers.map(i => ({ x: i + (A.val() % 2) - (B.val() % 2) })),
        )
        const E = fw.computed(() => hard(C.val() + A.val() + D.val()[0].x, 'E'))
        const F = fw.computed(() => hard(D.val()[2].x || B.val(), 'F'))
        const G = fw.computed(
            () => C.val() + (C.val() || E.val() % 2) + D.val()[4].x + F.val(),
        )
        fw.effect(() => {
            hard(G.val(), 'H')
        })
        fw.effect(() => {
            G.val()
        })
        fw.effect(() => {
            hard(F.val(), 'J')
        })

        let i = 0
        return () => {
            i++
            fw.withBatch(() => {
                B.set(1)
                A.set(1 + i * 2)
            })
            fw.withBatch(() => {
                A.set(2 + i * 2)
                B.set(2)
            })
        }
    })
}

function benchCreateSignals(fw, count) {
    return () => {
        fw.withBuild(() => {
            for (let i = 0; i < count; i++) {
                fw.signal(i)
            }
        })
    }
}

function benchCreateComputations(fw, count) {
    return () => {
        fw.withBuild(() => {
            const src = fw.signal(0);
            for (let i = 0; i < count; i++) {
                const c = fw.computed(() => src.val());
                fw.effect(() => {
                    c.val();
                });
            }
        })
    }
}


/* === Anod Setup Benchmarks === */

const anodBench = {
    setupDeep() {
        const len = 50;
        const head = anodSignal(0);
        let current = head;
        
        for (let i = 0; i < len; i++) {
            const cSignal = current;
            current = anodCompute(c => c.read(cSignal) + 1);
        }
        
        anodEffect(c => {
            c.read(current);
        });
        
        let i = 0;
        return () => {
            anodBatch(() => head.set(++i));
        };
    },

    setupBroad() {
        const head = anodSignal(0);
        for (let i = 0; i < 50; i++) {
            const current = anodCompute(c => c.read(head) + i);
            const current2 = anodCompute(c => c.read(current) + 1);
            anodEffect(c => {
                c.read(current2);
            });
        }
        
        let i = 0;
        return () => {
            anodBatch(() => head.set(++i));
        };
    },

    setupDiamond() {
        const width = 5;
        const head = anodSignal(0);
        const branches = [];
        
        for (let i = 0; i < width; i++) {
            branches.push(anodCompute(c => c.read(head) + 1));
        }
        
        const sum = anodCompute(c =>
            branches.map(x => c.read(x)).reduce((a, b) => a + b, 0),
        );
        
        anodEffect(c => {
            c.read(sum);
        });
        
        let i = 0;
        return () => {
            anodBatch(() => head.set(++i));
        };
    },

    setupTriangle() {
        const width = 10;
        const head = anodSignal(0);
        let current = head;
        const list = [];
        
        for (let i = 0; i < width; i++) {
            const prev = current;
            list.push(current);
            current = anodCompute(c => c.read(prev) + 1);
        }
        
        const sum = anodCompute(c =>
            list.map(x => c.read(x)).reduce((a, b) => a + b, 0),
        );
        
        anodEffect(c => {
            c.read(sum);
        });
        
        let i = 0;
        return () => {
            anodBatch(() => head.set(++i));
        };
    },

    setupMux() {
        const heads = new Array(100).fill(null).map(() => anodSignal(0));
        const mux = anodCompute(c => {
            return heads.map(h => c.read(h))
        });
        
        const splited = heads
            .map((_, index) => anodCompute(c => c.read(mux)[index]))
            .map(x => anodCompute(c => c.read(x) + 1));
            
        for (const x of splited) {
            anodEffect(c => {
                c.read(x);
            });
        }
        
        let i = 0;
        return () => {
            const idx = i % heads.length;
            anodBatch(() => heads[idx].set(++i));
        };
    },

    setupUnstable() {
        const head = anodSignal(0);
        const double = anodCompute(c => c.read(head) * 2);
        const inverse = anodCompute(c => -c.read(head));
        
        const current = anodCompute(c => {
            let result = 0;
            for (let i = 0; i < 20; i++) {
                result += c.read(head) % 2 ? c.read(double) : c.read(inverse);
            }
            return result;
        });
        
        anodEffect(c => {
            c.read(current);
        });
        
        let i = 0;
        return () => {
            anodBatch(() => head.set(++i));
        };
    },

    setupAvoidable() {
        const head = anodSignal(0);
        const computed1 = anodCompute(c => c.read(head));
        const computed2 = anodCompute(c => {
            c.read(computed1);
            return 0;
        });
        const computed3 = anodCompute(c => c.read(computed2) + 1);
        const computed4 = anodCompute(c => c.read(computed3) + 2);
        const computed5 = anodCompute(c => c.read(computed4) + 3);
        
        anodEffect(c => {
            c.read(computed5);
        });
        
        let i = 0;
        return () => {
            anodBatch(() => head.set(++i));
        };
    },

    setupRepeatedObservers() {
        const size = 30;
        const head = anodSignal(0);
        
        const current = anodCompute(c => {
            let result = 0;
            for (let i = 0; i < size; i++) {
                result += c.read(head);
            }
            return result;
        });
        
        anodEffect(c => {
            c.read(current);
        });
        
        let i = 0;
        return () => {
            anodBatch(() => head.set(++i));
        };
    },

    setupCellx(layers) {
        const start = {
            prop1: anodSignal(1),
            prop2: anodSignal(2),
            prop3: anodSignal(3),
            prop4: anodSignal(4),
        };
        
        let layer = start;

        for (let i = layers; i > 0; i--) {
            const m = layer;
            const s = {
                prop1: anodCompute(c => c.read(m.prop2)),
                prop2: anodCompute(c => c.read(m.prop1) - c.read(m.prop3)),
                prop3: anodCompute(c => c.read(m.prop2) + c.read(m.prop4)),
                prop4: anodCompute(c => c.read(m.prop3)),
            };

            anodEffect(c => { c.read(s.prop1); });
            anodEffect(c => { c.read(s.prop2); });
            anodEffect(c => { c.read(s.prop3); });
            anodEffect(c => { c.read(s.prop4); });
            anodEffect(c => { c.read(s.prop1); });
            anodEffect(c => { c.read(s.prop2); });
            anodEffect(c => { c.read(s.prop3); });
            anodEffect(c => { c.read(s.prop4); });

            layer = s;
        }

        const end = layer;
        let toggle = false;
        
        return () => {
            toggle = !toggle;
            anodBatch(() => {
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
    },

    setupMolWire() {
        const fib = (n) => {
            if (n < 2) return 1;
            return fib(n - 1) + fib(n - 2);
        };
        const hard = (n, _log) => n + fib(16);
        const numbers = Array.from({ length: 5 }, (_, i) => i);

        const A = anodSignal(0);
        const B = anodSignal(0);
        const C = anodCompute(c => (c.read(A) % 2) + (c.read(B) % 2));
        const D = anodCompute(c =>
            numbers.map(i => ({ x: i + (c.read(A) % 2) - (c.read(B) % 2) })),
        );
        const E = anodCompute(c => hard(c.read(C) + c.read(A) + c.read(D)[0].x, 'E'));
        const F = anodCompute(c => hard(c.read(D)[2].x || c.read(B), 'F'));
        const G = anodCompute(
            c => c.read(C) + (c.read(C) || c.read(E) % 2) + c.read(D)[4].x + c.read(F),
        );
        
        anodEffect(c => {
            hard(c.read(G), 'H');
        });
        anodEffect(c => {
            c.read(G);
        });
        anodEffect(c => {
            hard(c.read(F), 'J');
        });

        let i = 0;
        return () => {
            i++;
            anodBatch(() => {
                B.set(1);
                A.set(1 + i * 2);
            });
            anodBatch(() => {
                A.set(2 + i * 2);
                B.set(2);
            });
        };
    },

    benchCreateSignals(count) {
        return () => {
            for (let i = 0; i < count; i++) {
                anodSignal(i);
            }
        };
    },

    benchCreateComputations(count) {
        return () => {
            const src = anodSignal(0);
            for (let i = 0; i < count; i++) {
                const comp = anodCompute(c => c.read(src));
                anodEffect(c => {
                    c.read(comp);
                });
            }
        };
    }
};

/* === Run Benchmarks === */

// Define array with mapping: [Name, Generic Setup, Anod Setup]
const kairoBenchmarks = [
    ['deep propagation', setupDeep, anodBench.setupDeep],
    ['broad propagation', setupBroad, anodBench.setupBroad],
    ['diamond', setupDiamond, anodBench.setupDiamond],
    ['triangle', setupTriangle, anodBench.setupTriangle],
    ['mux', setupMux, anodBench.setupMux],
    ['unstable', setupUnstable, anodBench.setupUnstable],
    ['avoidable propagation', setupAvoidable, anodBench.setupAvoidable],
    ['repeated observers', setupRepeatedObservers, anodBench.setupRepeatedObservers],
];

// Run all Kairo benchmarks for Anod + all frameworks
for (const [name, setup, anodSetup] of kairoBenchmarks) {
    group(`Kairo: ${name}`, () => {
        bench('anod (explicit context)', anodSetup());
        for (const fw of frameworks) {
            bench(fw.name, setup(fw));
        }
    });
}

// CellX benchmarks
for (const layers of [10]) {
    group(`CellX ${layers} layers`, () => {
        bench('anod (explicit context)', anodBench.setupCellx(layers));
        for (const fw of frameworks) {
            bench(fw.name, setupCellx(fw, layers));
        }
    });
}

// $mol_wire benchmark
group('$mol_wire', () => {
    bench('anod (explicit context)', anodBench.setupMolWire());
    for (const fw of frameworks) {
        bench(fw.name, setupMolWire(fw));
    }
});

// Creation benchmarks
group('Create 1k signals', () => {
    bench('anod (explicit context)', anodBench.benchCreateSignals(1_000));
    for (const fw of frameworks) {
        bench(fw.name, benchCreateSignals(fw, 1_000));
    }
});

group('Create 1k computations', () => {
    bench('anod (explicit context)', anodBench.benchCreateComputations(1_000));
    for (const fw of frameworks) {
        bench(fw.name, benchCreateComputations(fw, 1_000));
    }
});

await run();