# App benchmark

A list view of 1,000 rows, built the way a typical app uses signals: many signals feeding many computes, with effects mostly writing DOM values. The same graph is built in every suite, and each suite checks at startup that it runs exactly the same number of computes and effects per scenario (`EXPECTED` in `shared.js`).

## The graph

Per row, state in a store: `label`, `count`, `done` signals.

Per row, a component (one owner each):

| Node | Kind | Deps |
| :-- | :-- | :-- |
| `text = label + ' (' + count + ')'` | compute | 2 |
| `visible = filter is 'all', or matches done` | compute | 1–2 (`done` is read only when filtered) |
| `selected = selectedId === id` | compute | 1, a signal every row shares |
| `cls = selected + theme` | compute | 2 |
| `textContent ← text`, `hidden ← visible`, `className ← cls`, `checked ← done` | DOM write | 1 each |
| `title ← text + selected` | DOM write | 2 |

App level: `doneCount` over every row's `done` (1,000 deps), `footer ← doneCount`, and a side effect persisting `filter`.

DOM elements are plain objects, so the numbers measure the reactive engine, not a DOM.

## Scenarios

| Scenario | What happens | Work per iteration |
| :-- | :-- | :-- |
| Mount + unmount 1k rows | build every row component and the app, then dispose them | 4,001 computes, 5,002 effects |
| Edit one row | change one row's label | 1 compute, 2 effects |
| Toggle one row | flip one row's `done` | 1 compute (the 1,000-dep `doneCount`), 2 effects |
| Select a row | change the selected id | 1,002 computes, 4 effects |
| Edit 10 rows in a batch | bump 10 rows' counts in one batch | 10 computes, 20 effects |
| Change filter | cycle all → done → open | 1,000 computes, up to 1,001 effects |
| Change theme | toggle light/dark | 1,000 computes, 1,000 effects |
| Remount 100 rows | dispose and rebuild 100 row components (scrolling, navigation) | 400 computes, 500 effects |

## Per library

- **anod** (`anod.js`): single-dep computes and DOM writes use the bound API (`c.compute(dep, fn)`, `c.effect(dep, fn)`), as katode emits. `ANOD_API=unbound node anod.js` builds every node with `c.compute(fn)` / `c.effect(fn)`.
- **alien-signals** (`alien-signals.js`): `computed`, `effect`, one `effectScope` per row component.
- **Solid 2.0** (`solid.js`): `createMemo`, `createRenderEffect` for DOM writes, `createEffect` for the side effect, one `createRoot` per row component. Writes are deferred, so every scenario ends with `flush()`, as Solid's renderer does.

Run from this directory: `node anod.js`, `node alien-signals.js`, `node solid.js`. Results are saved next to the other suites' runs, in `../reactivity/runs/app-*.json`.
