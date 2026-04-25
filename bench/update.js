/**
 * Targeted benchmark: Effect._update overhead comparison.
 *
 * Compares the current (split try/finally) vs old (unified try/finally)
 * implementations of EffectProto._update. Tests the three main paths:
 *
 *   1. Stable + bound (hottest path, no dep tracking)
 *   2. Dynamic deps (full reconciliation)
 *   3. Async spawn (FLAG_ASYNC path with return-from-try in old)
 *
 * Each scenario is run against both builds to surface any V8 deopt
 * differences from the structural refactor.
 */
import { bench, group, run } from 'mitata';

const newMod = await import('../dist/index-new.js');
const oldMod = await import('../dist/index-old.js');

/** Prevent dead-code elimination */
let sink = 0;

group('effect: stable + bound (1 dep)', () => {
    bench('new (split try/finally)', () => {
        const { signal, root, batch, OPT_STABLE } = newMod;
        let sum = 0;
        const dispose = root((c) => {
            const s = signal(0);
            c.effect(s, (val) => { sum += val; }, OPT_STABLE);
            for (let i = 0; i < 1000; i++) {
                s.set(i);
            }
        });
        sink += sum;
        dispose.dispose();
    });

    bench('old (unified try/finally)', () => {
        const { signal, root, batch, OPT_STABLE } = oldMod;
        let sum = 0;
        const dispose = root((c) => {
            const s = signal(0);
            c.effect(s, (val) => { sum += val; }, OPT_STABLE);
            for (let i = 0; i < 1000; i++) {
                s.set(i);
            }
        });
        sink += sum;
        dispose.dispose();
    });
});

group('effect: stable + unbound (3 deps)', () => {
    bench('new (split try/finally)', () => {
        const { signal, root, OPT_STABLE } = newMod;
        let sum = 0;
        const dispose = root((c) => {
            const a = signal(0);
            const b = signal(0);
            const d = signal(0);
            c.effect((c) => {
                sum += c.val(a) + c.val(b) + c.val(d);
            }, OPT_STABLE);
            for (let i = 0; i < 1000; i++) {
                a.set(i);
            }
        });
        sink += sum;
        dispose.dispose();
    });

    bench('old (unified try/finally)', () => {
        const { signal, root, OPT_STABLE } = oldMod;
        let sum = 0;
        const dispose = root((c) => {
            const a = signal(0);
            const b = signal(0);
            const d = signal(0);
            c.effect((c) => {
                sum += c.val(a) + c.val(b) + c.val(d);
            }, OPT_STABLE);
            for (let i = 0; i < 1000; i++) {
                a.set(i);
            }
        });
        sink += sum;
        dispose.dispose();
    });
});

group('effect: dynamic deps (alternating)', () => {
    bench('new (split try/finally)', () => {
        const { signal, root } = newMod;
        let sum = 0;
        const dispose = root((c) => {
            const toggle = signal(true);
            const a = signal(1);
            const b = signal(2);
            c.effect((c) => {
                if (c.val(toggle)) {
                    sum += c.val(a);
                } else {
                    sum += c.val(b);
                }
            });
            for (let i = 0; i < 1000; i++) {
                toggle.set(i % 2 === 0);
            }
        });
        sink += sum;
        dispose.dispose();
    });

    bench('old (unified try/finally)', () => {
        const { signal, root } = oldMod;
        let sum = 0;
        const dispose = root((c) => {
            const toggle = signal(true);
            const a = signal(1);
            const b = signal(2);
            c.effect((c) => {
                if (c.val(toggle)) {
                    sum += c.val(a);
                } else {
                    sum += c.val(b);
                }
            });
            for (let i = 0; i < 1000; i++) {
                toggle.set(i % 2 === 0);
            }
        });
        sink += sum;
        dispose.dispose();
    });
});

group('effect: batched writes (stable + bound)', () => {
    bench('new (split try/finally)', () => {
        const { signal, root, batch, OPT_STABLE } = newMod;
        let sum = 0;
        const dispose = root((c) => {
            const a = signal(0);
            const b = signal(0);
            c.effect(a, (val) => { sum += val; }, OPT_STABLE);
            c.effect(b, (val) => { sum += val; }, OPT_STABLE);
            for (let i = 0; i < 1000; i++) {
                batch(() => {
                    a.set(i);
                    b.set(i);
                });
            }
        });
        sink += sum;
        dispose.dispose();
    });

    bench('old (unified try/finally)', () => {
        const { signal, root, batch, OPT_STABLE } = oldMod;
        let sum = 0;
        const dispose = root((c) => {
            const a = signal(0);
            const b = signal(0);
            c.effect(a, (val) => { sum += val; }, OPT_STABLE);
            c.effect(b, (val) => { sum += val; }, OPT_STABLE);
            for (let i = 0; i < 1000; i++) {
                batch(() => {
                    a.set(i);
                    b.set(i);
                });
            }
        });
        sink += sum;
        dispose.dispose();
    });
});

group('compute chain: stable + bound (4 deep)', () => {
    bench('new (split try/finally)', () => {
        const { signal, root, OPT_STABLE } = newMod;
        let sum = 0;
        const dispose = root((c) => {
            const s = signal(0);
            const c1 = c.compute(s, (v) => v + 1);
            const c2 = c.compute(c1, (v) => v * 2);
            const c3 = c.compute(c2, (v) => v - 1);
            c.effect(c3, (val) => { sum += val; }, OPT_STABLE);
            for (let i = 0; i < 1000; i++) {
                s.set(i);
            }
        });
        sink += sum;
        dispose.dispose();
    });

    bench('old (unified try/finally)', () => {
        const { signal, root, OPT_STABLE } = oldMod;
        let sum = 0;
        const dispose = root((c) => {
            const s = signal(0);
            const c1 = c.compute(s, (v) => v + 1);
            const c2 = c.compute(c1, (v) => v * 2);
            const c3 = c.compute(c2, (v) => v - 1);
            c.effect(c3, (val) => { sum += val; }, OPT_STABLE);
            for (let i = 0; i < 1000; i++) {
                s.set(i);
            }
        });
        sink += sum;
        dispose.dispose();
    });
});

group('spawn: async effect settle', () => {
    bench('new (split try/finally)', async () => {
        const { signal, root } = newMod;
        let sum = 0;
        await new Promise((done) => {
            const dispose = root((c) => {
                const s = signal(0);
                c.spawn(async (c) => {
                    const val = c.val(s);
                    await c.suspend(Promise.resolve(val));
                    sum += val;
                    if (val >= 99) {
                        done();
                    }
                });
                for (let i = 1; i <= 99; i++) {
                    s.set(i);
                }
            });
        });
        sink += sum;
    });

    bench('old (unified try/finally)', async () => {
        const { signal, root } = oldMod;
        let sum = 0;
        await new Promise((done) => {
            const dispose = root((c) => {
                const s = signal(0);
                c.spawn(async (c) => {
                    const val = c.val(s);
                    await c.suspend(Promise.resolve(val));
                    sum += val;
                    if (val >= 99) {
                        done();
                    }
                });
                for (let i = 1; i <= 99; i++) {
                    s.set(i);
                }
            });
        });
        sink += sum;
    });
});

await run();

/** Guard against DCE */
if (sink === -Infinity) {
    console.log(sink);
}
