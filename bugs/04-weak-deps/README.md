# 04: `OPT_WEAK` loses dependencies and its seed

Branch `fix/04-weak-deps`, based on `fix/03-twoway`. Chain D (graph).
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

### What changed

- **`patchDeps`**: in the "no dep1 yet" branch (the node had no deps before this run), the first new dep now becomes `node._dep1`. It used to be written to `deps[i]` without advancing `tail`. The remaining new deps fill `deps[0..]` as before, and the existing trim/`FLAG_SINGLE` logic then handles 1 vs. many correctly. The node tracks exactly the deps of its last run, whether it had 0, 1 or many before.
- **`SEEDS`** (new module-level `WeakMap<Compute, *>`): holds the seed of computes created with `OPT_WEAK` and a seed other than `undefined`.
  - **`compute()` / `task()`** register the seed right after construction, when `flag & FLAG_WEAK`.
  - **`Compute._drop`** resets `_value` to the stored seed, or to `null` without one, instead of always `null`. The next run therefore receives the seed as `prev`, as on the very first run. The cached derived value is still released; only the user's own seed is kept.

### Behavior decisions

- **Seedless weak compute: `prev` is `null` after release, not `undefined`.** The README says a released weak compute "nulls out its value", and the passing explore test "OPT_WEAK: released compute re-subscribes and updates when observed again" pins `w._value === null` after release. Making `prev` `undefined` while `_value` stays `null` would need a branch in `_update` on every run. So the "seed as prev" contract holds for every seed the user gives, including an explicit `null`, while a compute created without a seed keeps the documented `null`. **For maintainer review:** a seedless reducer with a default parameter (`(cx, prev = []) => …`) does not get its default after a release.
- The seed is kept in a `WeakMap`, not a new `Compute` field, so non-weak computes pay nothing. The entry goes away with the node.
- `compute.weak()` does not exist on this branch (bug 20 adds it). How it interacts with the seed is decided there.

### Test expectations changed

None.

### Other groups

No other group's tests changed state. `test/explore` goes from 86 to 83 failures, exactly the three tests listed above. Extra probes (not committed) pass: a weak compute moving 0 → 3 → 0 → 1 → 4 → 2 → 0 → 4 deps across release cycles keeps exactly one live back-pointer per dep and the right `FLAG_SINGLE`; bound weak computes and weak tasks get their seed back; an explicit `null` seed yields `null`.

### Hot paths touched

- **`patchDeps`**: only the "no dep1 before this run" branch changed, at the same cost: it assigns `node._dep1` instead of `deps[i]`. That branch is reached only when the node had zero deps before the run.
- **`compute()` / `task()`** (creation): one extra flag test per node. Plus `WeakMap.set` only for weak computes created with a seed.
- **`Compute._drop`** (release, rare): one `WeakMap.get`.
- `_update`, `val`, `_read`, `notify` and `checkRun` are untouched.
- **Memory:** no fields were added to any node constructor. `SEEDS` holds one entry per weak compute that was created with a seed.
