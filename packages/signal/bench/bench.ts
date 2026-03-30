import { bench, group, run } from 'mitata'

// Your library
import {
    batch as anodBatch,
    effect as anodEffect,
    compute as anodCompute,
    signal as anodSignal,
} from '../';

// Competitor libraries
import S from 's-js';
import { createSignal as solidSignal, createMemo as solidMemo, createEffect as solidEffect } from '@solidjs/signals';
import { signal as preactSignal, computed as preactComputed, effect as preactEffect, batch as preactBatch } from '@preact/signals-core';
import { signal as alienSignal, computed as alienComputed, effect as alienEffect } from 'alien-signals';
import { createState as zeixState, createMemo as zeixMemo, createEffect as zeixEffect } from '@zeix/cause-effect';

import type { Computed, ReactiveFramework } from './reactive-framework.js'

/* === Framework Adapters === */

const frameworks: ReactiveFramework[] = [
    {
        name: 'S.js',
        signal: (initialValue: any) => {
            const data = S.data(initialValue);
            return { val() { return data() }, set: data };
        },
        computed: (fn: () => any) => {
            const comp = S(fn);
            return { val() { return comp() } };
        },
        effect: (fn: () => any) => S(fn),
        withBatch: (fn: () => any) => S.freeze(fn),
        withBuild: <T>(fn: () => T) => S.root(fn) as T,
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
        signal: (initialValue: any) => {
            const sig = preactSignal(initialValue);
            return { val() { return sig.value }, set: (v: any) => sig.value = v };
        },
        computed: (fn: () => any) => {
            const comp = preactComputed(fn);
            return { val() { return comp.value } };
        },
        effect: (fn: () => any) => preactEffect(fn),
        withBatch: preactBatch,
        withBuild: <T>(fn: () => T) => fn(),
    },
    {
        name: 'alien-signals',
        signal: (initialValue: any) => {
            const sig = alienSignal(initialValue);
            return { val() { return sig() }, set: sig };
        },
        computed: (fn: () => any) => {
            const comp = alienComputed(fn);
            return { val() { return comp() } };
        },
        effect: (fn: () => any) => alienEffect(fn),
        withBatch: (fn: () => any) => fn(), // alien-signals usually relies on its system for scheduling
        withBuild: <T>(fn: () => T) => fn(),
    },
    // {
    //     name: 'anod',
    //     signal: anodSignal,
    //     computed: anodCompute,
    //     effect: anodEffect,
    //     withBatch: anodBatch,
    //     withBuild: <T>(fn: () => T) => fn(),
    // },
    {
        name: 'cause-effect',
        signal: (initialValue: any) => {
            const state = zeixState(initialValue);
            return { val() { return state.get() }, set: (v: any) => state.set(v) };
        },
        computed: (fn: () => any) => {
            const memo = zeixMemo(fn);
            return { val() { return memo.get() } };
        },
        effect: (fn: () => any) => zeixEffect(fn),
        withBatch: (fn: () => any) => fn(),
        withBuild: <T>(fn: () => T) => fn(),
    }
]

/* === Kairo Benchmarks === */

function setupDeep(fw: ReactiveFramework) {
    return fw.withBuild(() => {
        const len = 50
        const head = fw.signal(0)
        let current = head as { val: () => number }
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

function setupBroad(fw: ReactiveFramework) {
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

function setupDiamond(fw: ReactiveFramework) {
    return fw.withBuild(() => {
        const width = 5
        const head = fw.signal(0)
        const branches: { val(): number }[] = []
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

function setupTriangle(fw: ReactiveFramework) {
    return fw.withBuild(() => {
        const width = 10
        const head = fw.signal(0)
        let current = head as { val: () => number }
        const list: { val: () => number }[] = []
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

function setupMux(fw: ReactiveFramework) {
    return fw.withBuild(() => {
        const heads = new Array(100).fill(null).map(_ => fw.signal(0))
        const mux = fw.computed(() =>
            Object.fromEntries(heads.map(h => h.val()).entries()),
        )
        const splited = heads
            .map((_, index) => fw.computed(() => mux.val()[index]!))
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
                heads[idx]!.set(++i)
            })
        }
    })
}

function setupUnstable(fw: ReactiveFramework) {
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

function setupAvoidable(fw: ReactiveFramework) {
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

function setupRepeatedObservers(fw: ReactiveFramework) {
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

/* === CellX Benchmark === */

function setupCellx(fw: ReactiveFramework, layers: number) {
    return fw.withBuild(() => {
        const start = {
            prop1: fw.signal(1),
            prop2: fw.signal(2),
            prop3: fw.signal(3),
            prop4: fw.signal(4),
        }
        type CellxLayer = {
            prop1: { val(): number }
            prop2: { val(): number }
            prop3: { val(): number }
            prop4: { val(): number }
        }
        let layer: CellxLayer = start

        for (let i = layers; i > 0; i--) {
            const m: CellxLayer = layer
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

/* === $mol_wire Benchmark === */

function setupMolWire(fw: ReactiveFramework) {
    return fw.withBuild(() => {
        const fib = (n: number): number => {
            if (n < 2) return 1
            return fib(n - 1) + fib(n - 2)
        }
        const hard = (n: number, _log: string) => n + fib(16)
        const numbers = Array.from({ length: 5 }, (_, i) => i)

        const A = fw.signal(0)
        const B = fw.signal(0)
        const C = fw.computed(() => (A.val() % 2) + (B.val() % 2))
        const D = fw.computed(() =>
            numbers.map(i => ({ x: i + (A.val() % 2) - (B.val() % 2) })),
        )
        const E = fw.computed(() => hard(C.val() + A.val() + D.val()[0]!.x, 'E'))
        const F = fw.computed(() => hard(D.val()[2]!.x || B.val(), 'F'))
        const G = fw.computed(
            () => C.val() + (C.val() || E.val() % 2) + D.val()[4]!.x + F.val(),
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

/* === Creation Benchmarks === */

function benchCreateSignals(fw: ReactiveFramework, count: number) {
    return () => {
        fw.withBuild(() => {
            for (let i = 0; i < count; i++) {
                fw.signal(i)
            }
        })
    }
}

function benchCreateComputations(fw: ReactiveFramework, count: number) {
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
] as const

// Run all Kairo benchmarks for all frameworks
for (const [name, setup] of kairoBenchmarks) {
	group(`Kairo: ${name}`, () => {
		for (const fw of frameworks) {
			bench(fw.name, setup(fw))
		}
	})
}

// CellX benchmarks
for (const layers of [10]) {
	group(`CellX ${layers} layers`, () => {
		for (const fw of frameworks) {
			bench(fw.name, setupCellx(fw, layers))
		}
	})
}

// $mol_wire benchmark
group('$mol_wire', () => {
	for (const fw of frameworks) {
		bench(fw.name, setupMolWire(fw))
	}
})

// Creation benchmarks
group('Create 1k signals', () => {
	for (const fw of frameworks) {
		bench(fw.name, benchCreateSignals(fw, 1_000))
	}
})

group('Create 1k computations', () => {
    for (const fw of frameworks) {
        bench(fw.name, benchCreateComputations(fw, 1_000))
    }
})

await run()