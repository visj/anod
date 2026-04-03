import { bench, group, run } from 'mitata';
import { signal as preactSignal, computed as preactComputed } from '@preact/signals-core';
import { signal as alienSignal, computed as alienComputed, startBatch, endBatch } from 'alien-signals';
import { signal, effect, batch } from 'anod';
import { list } from '../dist/index.mjs';

const SIZE = 10000;

/**
 * Helper: create an array of SIZE numbers [0..SIZE-1]
 */
function makeArray() {
    let arr = [];
    for (let i = 0; i < SIZE; i++) {
        arr[i] = i;
    }
    return arr;
}

let sink = 0;

/* ─── every + pop (short-circuit: prev=true, only DEL) ─── */

group('every() + pop()', () => {
    bench('anod _mod', () => {
        let l = list(makeArray());
        let c = l.every((v) => v >= 0);
        c.val();

        for (let i = 0; i < 100; i++) {
            l.pop();
            sink += c.val() ? 1 : 0;
        }
    });

    bench('anod baseline (push — no short-circuit)', () => {
        let l = list(makeArray());
        let c = l.every((v) => v >= 0);
        c.val();

        for (let i = 0; i < 100; i++) {
            l.push(i);
            sink += c.val() ? 1 : 0;
        }
    });

    bench('alien-signals (immutable)', () => {
        let arr = makeArray();
        let s = alienSignal(arr);
        let c = alienComputed(() => s().every((v) => v >= 0));
        c();

        for (let i = 0; i < 100; i++) {
            arr = arr.slice(0, -1);
            s(arr);
            sink += c() ? 1 : 0;
        }
    });

    bench('preact-signals (immutable)', () => {
        let arr = makeArray();
        let s = preactSignal(arr);
        let c = preactComputed(() => s.value.every((v) => v >= 0));
        c.value;

        for (let i = 0; i < 100; i++) {
            arr = arr.slice(0, -1);
            s.value = arr;
            sink += c.value ? 1 : 0;
        }
    });
});

/* ─── some + pop (short-circuit: prev=false, only DEL) ─── */

group('some() + pop()', () => {
    bench('anod _mod', () => {
        let l = list(makeArray());
        let c = l.some((v) => v > SIZE + 100);
        c.val();

        for (let i = 0; i < 100; i++) {
            l.pop();
            sink += c.val() ? 1 : 0;
        }
    });

    bench('anod baseline (push — no short-circuit)', () => {
        let l = list(makeArray());
        let c = l.some((v) => v > SIZE + 100);
        c.val();

        for (let i = 0; i < 100; i++) {
            l.push(i);
            sink += c.val() ? 1 : 0;
        }
    });

    bench('alien-signals (immutable)', () => {
        let arr = makeArray();
        let s = alienSignal(arr);
        let c = alienComputed(() => s().some((v) => v > SIZE + 100));
        c();

        for (let i = 0; i < 100; i++) {
            arr = arr.slice(0, -1);
            s(arr);
            sink += c() ? 1 : 0;
        }
    });

    bench('preact-signals (immutable)', () => {
        let arr = makeArray();
        let s = preactSignal(arr);
        let c = preactComputed(() => s.value.some((v) => v > SIZE + 100));
        c.value;

        for (let i = 0; i < 100; i++) {
            arr = arr.slice(0, -1);
            s.value = arr;
            sink += c.value ? 1 : 0;
        }
    });
});

/* ─── indexOf + push (mutation=true, found index < push pos) ─── */

group('indexOf(mutation) + push()', () => {
    bench('anod _mod', () => {
        let l = list(makeArray());
        let c = l.indexOf(5500, true);
        c.val();

        for (let i = 0; i < 100; i++) {
            l.push(SIZE + i);
            sink += c.val();
        }
    });

    bench('anod baseline (no mutation flag)', () => {
        let l = list(makeArray());
        let c = l.indexOf(5500);
        c.val();

        for (let i = 0; i < 100; i++) {
            l.push(SIZE + i);
            sink += c.val();
        }
    });

    bench('alien-signals (immutable)', () => {
        let arr = makeArray();
        let s = alienSignal(arr);
        let c = alienComputed(() => s().indexOf(5500));
        c();

        for (let i = 0; i < 100; i++) {
            arr = arr.concat(SIZE + i);
            s(arr);
            sink += c();
        }
    });

    bench('preact-signals (immutable)', () => {
        let arr = makeArray();
        let s = preactSignal(arr);
        let c = preactComputed(() => s.value.indexOf(5500));
        c.value;

        for (let i = 0; i < 100; i++) {
            arr = arr.concat(SIZE + i);
            s.value = arr;
            sink += c.value;
        }
    });
});

/* ─── includes + push (mutation=true, found before push pos) ─── */

group('includes(mutation) + push()', () => {
    bench('anod _mod', () => {
        let l = list(makeArray());
        let c = l.includes(5500, true);
        c.val();

        for (let i = 0; i < 100; i++) {
            l.push(SIZE + i);
            sink += c.val() ? 1 : 0;
        }
    });

    bench('anod baseline (no mutation flag)', () => {
        let l = list(makeArray());
        let c = l.includes(5500);
        c.val();

        for (let i = 0; i < 100; i++) {
            l.push(SIZE + i);
            sink += c.val() ? 1 : 0;
        }
    });

    bench('alien-signals (immutable)', () => {
        let arr = makeArray();
        let s = alienSignal(arr);
        let c = alienComputed(() => s().includes(5500));
        c();

        for (let i = 0; i < 100; i++) {
            arr = arr.concat(SIZE + i);
            s(arr);
            sink += c() ? 1 : 0;
        }
    });

    bench('preact-signals (immutable)', () => {
        let arr = makeArray();
        let s = preactSignal(arr);
        let c = preactComputed(() => s.value.includes(5500));
        c.value;

        for (let i = 0; i < 100; i++) {
            arr = arr.concat(SIZE + i);
            s.value = arr;
            sink += c.value ? 1 : 0;
        }
    });
});

/* ─── findIndex + push (mutation=true) ─── */

group('findIndex(mutation) + push()', () => {
    bench('anod _mod', () => {
        let l = list(makeArray());
        let c = l.findIndex((v) => v === 5500, void 0, true);
        c.val();

        for (let i = 0; i < 100; i++) {
            l.push(SIZE + i);
            sink += c.val();
        }
    });

    bench('anod baseline (no mutation flag)', () => {
        let l = list(makeArray());
        let c = l.findIndex((v) => v === 5500);
        c.val();

        for (let i = 0; i < 100; i++) {
            l.push(SIZE + i);
            sink += c.val();
        }
    });

    bench('alien-signals (immutable)', () => {
        let arr = makeArray();
        let s = alienSignal(arr);
        let c = alienComputed(() => s().findIndex((v) => v === 5500));
        c();

        for (let i = 0; i < 100; i++) {
            arr = arr.concat(SIZE + i);
            s(arr);
            sink += c();
        }
    });

    bench('preact-signals (immutable)', () => {
        let arr = makeArray();
        let s = preactSignal(arr);
        let c = preactComputed(() => s.value.findIndex((v) => v === 5500));
        c.value;

        for (let i = 0; i < 100; i++) {
            arr = arr.concat(SIZE + i);
            s.value = arr;
            sink += c.value;
        }
    });
});

await run();

/** Prevent dead-code elimination */
if (sink < -1e18) {
    console.log(sink);
}
