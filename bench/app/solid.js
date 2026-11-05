/**
 * App benchmark for Solid 2.0 (@solidjs/signals). Row components are
 * roots, DOM writes are render effects, app side effects are effects.
 * Writes are deferred, so every scenario ends with flush(), as Solid's
 * renderer does.
 */
import { bench, run } from 'mitata';
import { createSignal, createMemo, createRoot, createEffect, createRenderEffect, flush } from '@solidjs/signals';
import { ROWS, REMOUNT, BATCH, FILTERS, LABELS_A, LABELS_B, makeEls, makeEl, initialDone, validate } from './shared.js';
import { saveRun } from '../reactivity/save-run.js';

const LIB = 'solid';

let computes = 0;
let effects = 0;
let storage = '';

function createStore(n) {
    const rows = new Array(n);
    for (let i = 0; i < n; i++) {
        const [label, setLabel] = createSignal(LABELS_A[i]);
        const [count, setCount] = createSignal(0);
        const [done, setDone] = createSignal(initialDone(i));
        rows[i] = { id: i, label, setLabel, count, setCount, done, setDone };
    }
    const [theme, setTheme] = createSignal('light');
    const [filter, setFilter] = createSignal('all');
    const [selected, setSelected] = createSignal(-1);
    return { rows, theme, setTheme, filter, setFilter, selected, setSelected };
}

/** One row component: its memos and DOM writes. */
function mountRow(store, row, el) {
    const text = createMemo(() => {
        computes++;
        return row.label() + ' (' + row.count() + ')';
    });
    const visible = createMemo(() => {
        computes++;
        const f = store.filter();
        return f === 'all' || (f === 'done') === row.done();
    });
    const id = row.id;
    const selected = createMemo(() => {
        computes++;
        return store.selected() === id;
    });
    const cls = createMemo(() => {
        computes++;
        return (selected() ? 'row selected ' : 'row ') + store.theme();
    });
    createRenderEffect(text, (v) => { effects++; el.textContent = v; });
    createRenderEffect(visible, (v) => { effects++; el.hidden = !v; });
    createRenderEffect(cls, (v) => { effects++; el.className = v; });
    createRenderEffect(row.done, (v) => { effects++; el.checked = v; });
    createRenderEffect(
        () => (selected() ? text() + ' *' : text()),
        (v) => { effects++; el.title = v; }
    );
}

/** App-level nodes: a ROWS-wide aggregate, its DOM write, and a side effect. */
function mountApp(store, footer) {
    const rows = store.rows;
    const doneCount = createMemo(() => {
        computes++;
        let n = 0;
        for (let i = 0; i < rows.length; i++) {
            if (rows[i].done()) {
                n++;
            }
        }
        return n;
    });
    createRenderEffect(doneCount, (v) => { effects++; footer.textContent = v + ' done'; });
    createEffect(store.filter, (v) => { effects++; storage = v; });
}

/** Builds store, row components (one root each) and app nodes. */
function createApp(n) {
    const store = createStore(n);
    const els = makeEls(n);
    const views = new Array(n);
    for (let i = 0; i < n; i++) {
        views[i] = createRoot((dispose) => {
            mountRow(store, store.rows[i], els[i]);
            return dispose;
        });
    }
    const app = createRoot((dispose) => {
        mountApp(store, makeEl());
        return dispose;
    });
    flush();
    return {
        store,
        els,
        views,
        dispose() {
            for (let i = 0; i < n; i++) {
                views[i]();
            }
            app();
        },
    };
}

const scenarios = {
    'Mount + unmount 1k rows': () => {
        createApp(ROWS).dispose();
    },
    'Edit one row': (() => {
        const { store } = createApp(ROWS);
        let iter = 0;
        return () => {
            const i = iter++ % ROWS;
            const row = store.rows[i];
            row.setLabel(row.label() === LABELS_A[i] ? LABELS_B[i] : LABELS_A[i]);
            flush();
        };
    })(),
    'Toggle one row': (() => {
        const { store } = createApp(ROWS);
        let iter = 0;
        return () => {
            const row = store.rows[(iter++ * 7) % ROWS];
            row.setDone(!row.done());
            flush();
        };
    })(),
    'Select a row': (() => {
        const { store } = createApp(ROWS);
        let iter = 0;
        return () => {
            store.setSelected((iter++ * 13) % ROWS);
            flush();
        };
    })(),
    'Edit 10 rows in a batch': (() => {
        const { store } = createApp(ROWS);
        let iter = 0;
        return () => {
            const base = (iter++ * BATCH) % ROWS;
            for (let k = 0; k < BATCH; k++) {
                const row = store.rows[base + k];
                row.setCount(row.count() + 1);
            }
            flush();
        };
    })(),
    'Change filter': (() => {
        const { store } = createApp(ROWS);
        let iter = 0;
        return () => {
            store.setFilter(FILTERS[++iter % FILTERS.length]);
            flush();
        };
    })(),
    'Change theme': (() => {
        const { store } = createApp(ROWS);
        return () => {
            store.setTheme(store.theme() === 'light' ? 'dark' : 'light');
            flush();
        };
    })(),
    'Remount 100 rows': (() => {
        const { store, els, views } = createApp(ROWS);
        let iter = 0;
        return () => {
            const base = (iter++ * REMOUNT) % ROWS;
            for (let k = base; k < base + REMOUNT; k++) {
                views[k]();
                views[k] = createRoot((dispose) => {
                    mountRow(store, store.rows[k], els[k]);
                    return dispose;
                });
            }
            flush();
        };
    })(),
};

validate(LIB, scenarios, () => {
    const got = { computes, effects };
    computes = effects = 0;
    return got;
});

for (const name in scenarios) {
    bench(name, scenarios[name]);
}

const results = await run();
saveRun('app-' + LIB, results);
if (storage === null) {
    console.log(storage);
}
