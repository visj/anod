/**
 * App benchmark for alien-signals. Row components are effect scopes.
 */
import { bench, run } from 'mitata';
import { signal, computed, effect, effectScope, startBatch, endBatch } from 'alien-signals';
import { ROWS, REMOUNT, BATCH, FILTERS, LABELS_A, LABELS_B, makeEls, makeEl, initialDone, validate, measureAlloc, printAlloc } from './shared.js';
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

/**
 * A keyed selector, like Solid 1's createSelector: one signal per id, and
 * one effect that flips the previous and the next id's signal. A select
 * then reruns two rows instead of every row. alien-signals has no
 * built-in one; this is the helper an app would write.
 * @returns {function(number): function(): boolean}
 */
function createSelector(source) {
    const keys = new Map();
    let prev = source();
    effect(() => {
        const id = source();
        const old = keys.get(prev);
        if (old !== undefined) {
            old(false);
        }
        const next = keys.get(id);
        if (next !== undefined) {
            next(true);
        }
        prev = id;
    });
    return (id) => {
        let s = keys.get(id);
        if (s === undefined) {
            s = signal(id === prev);
            keys.set(id, s);
        }
        return s;
    };
}

/**
 * One row component: its computeds and DOM writes. With a selector,
 * `selected` is the row's selector signal; without one, a computed per
 * row compares the selected id.
 */
function mountRow(store, row, el, isSelected) {
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
    const selected = isSelected !== null
        ? isSelected(id)
        : computed(() => {
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

/**
 * Builds store, app nodes and row components (one scope each). The app
 * owns the selector, so it is built before the rows that read it.
 * `naive` builds the rows without a selector.
 */
function createApp(n, naive = false) {
    const store = createStore(n);
    const els = makeEls(n);
    const views = new Array(n);
    let isSelected = null;
    const app = effectScope(() => {
        if (!naive) {
            isSelected = createSelector(store.selected);
        }
        mountApp(store, makeEl());
    });
    for (let i = 0; i < n; i++) {
        views[i] = effectScope(() => mountRow(store, store.rows[i], els[i], isSelected));
    }
    return {
        store,
        els,
        views,
        isSelected,
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
    'Select a row, no selector': (() => {
        const { store } = createApp(ROWS, true);
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
        const { store, els, views, isSelected } = createApp(ROWS);
        let iter = 0;
        return () => {
            const base = (iter++ * REMOUNT) % ROWS;
            for (let k = base; k < base + REMOUNT; k++) {
                views[k]();
                views[k] = effectScope(() => mountRow(store, store.rows[k], els[k], isSelected));
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
const alloc = await measureAlloc(scenarios);
printAlloc(LIB, alloc);
saveRun('app-' + LIB, results, alloc);
if (storage === null) {
    console.log(storage);
}
