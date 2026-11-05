/**
 * App benchmark for anod. Single-dep computes and DOM writes use the
 * bound API (c.compute(dep, fn), c.effect(dep, fn)), as katode emits.
 * ANOD_API=unbound builds every node with the unbound API instead.
 */
import { bench, run } from 'mitata';
import { signal, root, batch } from '../../dist/index.js';
import { ROWS, REMOUNT, BATCH, FILTERS, LABELS_A, LABELS_B, makeEls, makeEl, initialDone, validate } from './shared.js';
import { saveRun } from '../reactivity/save-run.js';

const BOUND = process.env.ANOD_API !== 'unbound';
const LIB = BOUND ? 'anod' : 'anod-unbound';

let computes = 0;
let effects = 0;
let storage = '';

function createStore(n) {
    const rows = new Array(n);
    for (let i = 0; i < n; i++) {
        rows[i] = { id: i, label: signal(LABELS_A[i]), count: signal(0), done: signal(initialDone(i)) };
    }
    return {
        rows,
        theme: signal('light'),
        filter: signal('all'),
        selected: signal(-1),
    };
}

/** One row component: its computes and DOM writes, owned by r. */
function mountRow(r, store, row, el) {
    const text = r.compute((cx) => {
        computes++;
        return cx.val(row.label) + ' (' + cx.val(row.count) + ')';
    });
    const visible = r.compute((cx) => {
        computes++;
        const f = cx.val(store.filter);
        return f === 'all' || (f === 'done') === cx.val(row.done);
    });
    const id = row.id;
    const selected = BOUND
        ? r.compute(store.selected, (sel) => {
            computes++;
            return sel === id;
        })
        : r.compute((cx) => {
            computes++;
            return cx.val(store.selected) === id;
        });
    const cls = r.compute((cx) => {
        computes++;
        return (cx.val(selected) ? 'row selected ' : 'row ') + cx.val(store.theme);
    });
    if (BOUND) {
        r.effect(text, (v) => { effects++; el.textContent = v; });
        r.effect(visible, (v) => { effects++; el.hidden = !v; });
        r.effect(cls, (v) => { effects++; el.className = v; });
        r.effect(row.done, (v) => { effects++; el.checked = v; });
    } else {
        r.effect((cx) => { effects++; el.textContent = cx.val(text); });
        r.effect((cx) => { effects++; el.hidden = !cx.val(visible); });
        r.effect((cx) => { effects++; el.className = cx.val(cls); });
        r.effect((cx) => { effects++; el.checked = cx.val(row.done); });
    }
    r.effect((cx) => {
        effects++;
        el.title = cx.val(selected) ? cx.val(text) + ' *' : cx.val(text);
    });
}

/** App-level nodes: a ROWS-wide aggregate, its DOM write, and a side effect. */
function mountApp(r, store, footer) {
    const rows = store.rows;
    const doneCount = r.compute((cx) => {
        computes++;
        let n = 0;
        for (let i = 0; i < rows.length; i++) {
            if (cx.val(rows[i].done)) {
                n++;
            }
        }
        return n;
    });
    if (BOUND) {
        r.effect(doneCount, (v) => { effects++; footer.textContent = v + ' done'; });
        r.effect(store.filter, (v) => { effects++; storage = v; });
    } else {
        r.effect((cx) => { effects++; footer.textContent = cx.val(doneCount) + ' done'; });
        r.effect((cx) => { effects++; storage = cx.val(store.filter); });
    }
}

/** Builds store, row components (one owner each) and app nodes. */
function createApp(n) {
    const store = createStore(n);
    const els = makeEls(n);
    const views = new Array(n);
    for (let i = 0; i < n; i++) {
        views[i] = root((r) => mountRow(r, store, store.rows[i], els[i]));
    }
    const app = root((r) => mountApp(r, store, makeEl()));
    return {
        store,
        els,
        views,
        dispose() {
            for (let i = 0; i < n; i++) {
                views[i].dispose();
            }
            app.dispose();
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
            row.label.set(row.label.get() === LABELS_A[i] ? LABELS_B[i] : LABELS_A[i]);
        };
    })(),
    'Toggle one row': (() => {
        const { store } = createApp(ROWS);
        let iter = 0;
        return () => {
            const row = store.rows[(iter++ * 7) % ROWS];
            row.done.set(!row.done.get());
        };
    })(),
    'Select a row': (() => {
        const { store } = createApp(ROWS);
        let iter = 0;
        return () => {
            store.selected.set((iter++ * 13) % ROWS);
        };
    })(),
    'Edit 10 rows in a batch': (() => {
        const { store } = createApp(ROWS);
        let iter = 0;
        return () => {
            const base = (iter++ * BATCH) % ROWS;
            batch(() => {
                for (let k = 0; k < BATCH; k++) {
                    const count = store.rows[base + k].count;
                    count.set(count.get() + 1);
                }
            });
        };
    })(),
    'Change filter': (() => {
        const { store } = createApp(ROWS);
        let iter = 0;
        return () => {
            store.filter.set(FILTERS[++iter % FILTERS.length]);
        };
    })(),
    'Change theme': (() => {
        const { store } = createApp(ROWS);
        return () => {
            store.theme.set(store.theme.get() === 'light' ? 'dark' : 'light');
        };
    })(),
    'Remount 100 rows': (() => {
        const { store, els, views } = createApp(ROWS);
        let iter = 0;
        return () => {
            const base = (iter++ * REMOUNT) % ROWS;
            for (let k = base; k < base + REMOUNT; k++) {
                views[k].dispose();
                views[k] = root((r) => mountRow(r, store, store.rows[k], els[k]));
            }
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
