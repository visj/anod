# 04: `OPT_WEAK` loses dependencies

Branch `fix/04-weak-deps`, based on `fix/03-twoway`. Chain D (graph).
Next in the chain: `fix/05-cycle-hang`.

## What breaks

A weak compute that had no dependencies, and picks up its first one after being released, loses that dependency: it returns stale values or crashes `checkRun` with a null `dep._flag`. The original spec also asked for the seed to come back as `prev` after a release. That was later reversed, see "Seed after release" below.

```js
const w = c.compute((cx) => mode ? cx.val(x) : 0, undefined, OPT_WEAK);
// observed, released, then mode = true; w.get(); a.set(2) → w is stale
```

## Root cause

- patchDeps: the branch for "no dep1 yet" writes the first new dependency to `deps[i]`, but never sets `node._dep1` or advances `tail`. The `tail === 0` branch then nulls `_deps`, so the dependency is lost while the sender still lists the node.

## What anod should do

- A weak compute tracks exactly the dependencies of its last run, however many it had before.
- Releasing a weak compute drops its cached value and keeps nothing from its previous life. The seed is only the first `prev`, so the recompute receives `undefined` as `prev`. (Revised, see "Seed after release" below.)

## Tests (3)

- `test/explore/graph.test.js` › dynamic dependencies › weak compute with no deps keeps the dep it picks up after release
- `test/explore/graph.test.js` › dynamic dependencies › weak compute with no deps, re-read by an effect, does not crash checkRun
- `test/explore/graph.test.js` › options › OPT_WEAK: recompute after release gets undefined as prev, not the seed
- `test/explore/graph.test.js` › options › OPT_WEAK: a default parameter reapplies after release
- `test/explore/graph.test.js` › options › OPT_WEAK: a seed mutated in place is not retained after release
- `test/explore/graph.test.js` › options › weak(): recompute after release gets undefined as prev

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

## Seed after release (revised)

The first fix kept the seed in a module-level `WeakMap` (`SEEDS`) and restored it on release, so the recompute got the seed as `prev`. That was reversed:

- **It works against `weak`.** `weak` exists to unload memory. A reducer that mutates its seed in place (`prev.push(x); return prev`) makes the seed the large value, and `SEEDS` kept it alive after release. The next activation then got the old contents as `prev`.
- **It has no meaning.** The seed is the first `prev`, a reducing value. A compute whose value was explicitly dropped has no `prev`, so handing back the initial value is wrong. State that must survive a release belongs in `args`, which the compute keeps for its lifetime.

### What changed

- **`SEEDS`** is removed, with its writes in `compute()`, `task()` and `weak()`.
- **`Compute._drop`** sets `_value = undefined` (it was the seed, or `null`). The recompute gets `undefined` as `prev`, the same as the first run of a seedless compute, so a default parameter (`(cx, prev = []) => …`) reapplies on every fresh activation. That also settles the earlier review note about default parameters.
- **`weak()`** only sets `FLAG_WEAK`. Called before or after the first run, it behaves the same.

### Test expectations changed

- "OPT_WEAK: released compute re-subscribes and updates when observed again" pins `w._value` as `undefined` after release (was `null`).
- "OPT_WEAK: recompute after release gets the seed as prev, not null" is replaced by the four tests listed above.

### Hot paths touched

- **`compute()` / `task()`**: the weak-seed flag test is gone.
- **`Compute._drop`**: one constant store instead of a `WeakMap.get`.
- **Memory:** no `WeakMap`, so no ephemeron work for the garbage collector. A released weak compute holds nothing.
