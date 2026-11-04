# 04: `OPT_WEAK` loses dependencies and its seed

Branch `fix/04-weak-deps`, based on `fix/03-dropped-subscriptions`. Chain D (graph).
Next in the chain: `fix/05-cycle-hang`.

## What breaks

A weak compute that had no dependencies, and picks up its first one after being released, loses that dependency: it returns stale values or crashes `checkRun` with a null `dep._flag`. Separately, after a weak compute is released and read again, its function gets `null` as `prev` instead of the seed value it was created with.

```js
const w = c.compute((cx) => mode ? cx.val(x) : 0, undefined, OPT_WEAK);
// observed, released, then mode = true; w.get(); a.set(2) → w is stale
```

## Root cause

- patchDeps: the branch for "no dep1 yet" writes the first new dependency to `deps[i]`, but never sets `node._dep1` or advances `tail`. The `tail === 0` branch then nulls `_deps`, so the dependency is lost while the sender still lists the node.
- `_drop` sets `_value = null` and the seed is not kept anywhere.

## What anod should do

- A weak compute tracks exactly the dependencies of its last run, however many it had before.
- Releasing a weak compute drops its cached value, but the next run still receives the seed as `prev`, as on the very first run. That matches "the next read triggers a fresh recompute" and the `prev: T` type.

## Tests (3)

- `test/explore/graph.test.js` › dynamic dependencies › weak compute with no deps keeps the dep it picks up after release
- `test/explore/graph.test.js` › dynamic dependencies › weak compute with no deps, re-read by an effect, does not crash checkRun
- `test/explore/graph.test.js` › options › OPT_WEAK: recompute after release gets the seed as prev, not null

Run with `bun test --conditions=src test/explore/graph.test.js`.

## Fix

_Not fixed yet. The fix branch fills this in._
