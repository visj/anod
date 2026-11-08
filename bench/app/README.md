# App benchmark

A list view of 1,000 rows, built the way a typical app uses signals: many signals feeding many computes, with effects mostly writing DOM values. The same graph is built in every suite, and each suite checks at startup that it runs exactly the same number of computes and effects per scenario (`EXPECTED` in `shared.js`).

## The graph

Per row, state in a store: `label`, `count`, `done` signals.

Per row, a component (one owner each):

| Node | Kind | Deps |
| :-- | :-- | :-- |
| `text = label + ' (' + count + ')'` | compute | 2 |
| `visible = filter is 'all', or matches done` | compute | 1–2 (`done` is read only when filtered) |
| `selected` | the library's selector | 1 key, flipped only for the previous and the next selected row |
| `cls = selected + theme` | compute | 2 |
| `textContent ← text`, `hidden ← visible`, `className ← cls`, `checked ← done` | DOM write | 1 each |
| `title ← text + selected` | DOM write | 2 |

App level: `doneCount` over every row's `done` (1,000 deps), `footer ← doneCount`, and a side effect persisting `filter`.

DOM elements are plain objects, so the numbers measure the reactive engine, not a DOM.

### Selection

Apps don't give every row a compute over the shared selected id: a select would rerun all 1,000 of them. They use a selector, which keeps one reactive key per row and flips only the previous and the next one.

- **Solid 2.0** replaces 1.x's `createSelector` with `createProjection`: a store holding `true` under the selected id, which each row reads at its own key.
- **anod** and **alien-signals** have no built-in selector, so each suite has the same few-line helper an app would write: a signal per row id, and one effect on the selected id that sets the previous row's signal to `false` and the next row's to `true`.

Using a projection makes Solid slower in scenarios that never touch the selection. Toggling a row, which only reads 1,000 plain signals, goes from about 34 to 44 µs, and changing the theme from about 0.47 to 0.71 ms. It appears to be a global effect of store proxies in Solid's read path. Real Solid apps use stores throughout, so the suite keeps the projection.

The selector's own run is not counted as a compute or an effect. "Select a row, no selector" keeps the per-row compute, as a measure of a 1,000-wide fan-out.

## Scenarios

| Scenario | What happens | Work per iteration |
| :-- | :-- | :-- |
| Mount + unmount 1k rows | build every row component and the app, then dispose them | 3,001 computes, 5,002 effects |
| Edit one row | change one row's label | 1 compute, 2 effects |
| Toggle one row | flip one row's `done` | 1 compute (the 1,000-dep `doneCount`), 2 effects |
| Select a row | change the selected id | 2 computes, 4 effects |
| Select a row, no selector | change the selected id, with a compute per row over it | 1,002 computes, 4 effects |
| Edit 10 rows in a batch | bump 10 rows' counts in one batch | 10 computes, 20 effects |
| Change filter | cycle all → done → open | 1,000 computes, up to 1,001 effects |
| Change theme | toggle light/dark | 1,000 computes, 1,000 effects |
| Remount 100 rows | dispose and rebuild 100 row components (scrolling, navigation) | 300 computes, 500 effects |

## Per library

Each suite uses its library the way it is documented, with every tool it offers for this graph, but nothing an app would not write.

- **anod** (`anod.js`): single-dep computes and DOM writes use the bound API (`c.compute(dep, fn)`, `c.effect(dep, fn)`), as katode emits. `doneCount` is marked `stable()`, the documented case: it always reads the same 1,000 signals. `ANOD_API=unbound node anod.js` builds every node with `c.compute(fn)` / `c.effect(fn)`.
- **alien-signals** (`alien-signals.js`): `computed`, `effect`, one `effectScope` per row component, `startBatch`/`endBatch` for the batch.
- **Solid 2.0** (`solid.js`): `createMemo`, `createRenderEffect` with a compute and an effect function for DOM writes, `createEffect` for the side effect, `createProjection` for the selection, one `createRoot` per row component. Writes are deferred, so every scenario ends with `flush()`, as Solid's renderer does. Node resolves `@solidjs/signals` to its production build.

### Memory

mitata's heap column diffs `heapUsed` around each sample, so a garbage collection inside a sample hides whatever was allocated before it. The more a library allocates, the more often that happens, so the column under-reports the heaviest allocator most. In "Edit 10 rows in a batch" it showed Solid at 649 B and anod at 1.3 KB, while Solid actually allocates about 8.5 KB and anod about 1 KB.

After the timing run, each suite therefore measures the bytes allocated per iteration with V8's sampling heap profiler (`measureAlloc` in `shared.js`). The profiler also counts objects that were already collected. It prints a table, and saves the figure as `alloc` next to mitata's `heap` in the run file; `compare.js` shows `alloc` when both runs have it.

Some of what the table shows is the benchmark's own work, not the engine's. Every library builds the same strings: in "Edit 10 rows in a batch", all but about 40 B of anod's allocation is the ten `text` strings and the closure passed to `batch()`. The strings grow as the counts climb over a long run, so the figure drifts up slightly for every library. Two real differences:
- In "Select a row, no selector", alien-signals allocates about 40 bytes per row. Its `propagate` pushes a stack frame for every node with more than one subscriber, and each row's `selected` compute has two (`cls` and the title write).
- In "Change filter", anod allocates about 64 bytes per row every third iteration. `visible` gains a second dep when the filter leaves 'all', and that allocates a new `_deps` array, because the array was dropped when the dep went away.
