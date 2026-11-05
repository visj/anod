/**
 * App benchmark for alien-signals. Row components are effect scopes.
 */
import { bench, run } from 'mitata';
import { signal, computed, effect, effectScope, startBatch, endBatch } from 'alien-signals';
import { ROWS, REMOUNT, BATCH, FILTERS, LABELS_A, LABELS_B, makeEls, makeEl, initialDone, validate } from './shared.js';
import { saveRun } from '../reactivity/save-run.js';

const LIB = 'alien-signals';

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

/** One row component: its computeds and DOM writes. */
function mountRow(store, row, el) {
    const text = computed(() => {
        computes++;
        return row.label() + ' (' + row.count() + ')';
    });
    const visible = computed(() => {
        computes++;
        const f = store.filter();
        return f === 'all' || (f === 'done') === row.done();
    });
    const id = row.id;
    const selected = computed(() => {
        computes++;
        return store.selected() === id;
    });
    const cls = computed(() => {
        computes++;
        return (selected() ? 'row selected ' : 'row ') + store.theme();
    });
    effect(() => { effects++; el.textContent = text(); });
    effect(() => { effects++; el.hidden = !visible(); });
    effect(() => { effects++; el.className = cls(); });
    effect(() => { effects++; el.checked = row.done(); });
    effect(() => {
        effects++;
        el.title = selected() ? text() + ' *' : text();
    });
}

/** App-level nodes: a ROWS-wide aggregate, its DOM write, and a side effect. */
function mountApp(store, footer) {
    const rows = store.rows;
    const doneCount = computed(() => {
        computes++;
        let n = 0;
        for (let i = 0; i < rows.length; i++) {
            if (rows[i].done()) {
                n++;
            }
        }
        return n;
    });
    effect(() => { effects++; footer.textContent = doneCount() + ' done'; });
    effect(() => { effects++; storage = store.filter(); });
}

/** Builds store, row components (one scope each) and app nodes. */
function createApp(n) {
    const store = createStore(n);
    const els = makeEls(n);
    const views = new Array(n);
    for (let i = 0; i < n; i++) {
        views[i] = effectScope(() => mountRow(store, store.rows[i], els[i]));
    }
    const app = effectScope(() => mountApp(store, makeEl()));
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
            row.label(row.label() === LABELS_A[i] ? LABELS_B[i] : LABELS_A[i]);
        };
    })(),
    'Toggle one row': (() => {
        const { store } = createApp(ROWS);
        let iter = 0;
        return () => {
            const row = store.rows[(iter++ * 7) % ROWS];
            row.done(!row.done());
        };
    })(),
    'Select a row': (() => {
        const { store } = createApp(ROWS);
        let iter = 0;
        return () => {
            store.selected((iter++ * 13) % ROWS);
        };
    })(),
    'Edit 10 rows in a batch': (() => {
        const { store } = createApp(ROWS);
        let iter = 0;
        return () => {
            const base = (iter++ * BATCH) % ROWS;
            startBatch();
            for (let k = 0; k < BATCH; k++) {
                const count = store.rows[base + k].count;
                count(count() + 1);
            }
            endBatch();
        };
    })(),
    'Change filter': (() => {
        const { store } = createApp(ROWS);
        let iter = 0;
        return () => {
            store.filter(FILTERS[++iter % FILTERS.length]);
        };
    })(),
    'Change theme': (() => {
        const { store } = createApp(ROWS);
        return () => {
            store.theme(store.theme() === 'light' ? 'dark' : 'light');
        };
    })(),
    'Remount 100 rows': (() => {
        const { store, els, views } = createApp(ROWS);
        let iter = 0;
        return () => {
            const base = (iter++ * REMOUNT) % ROWS;
            for (let k = base; k < base + REMOUNT; k++) {
                views[k]();
                views[k] = effectScope(() => mountRow(store, store.rows[k], els[k]));
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
