# 16: A task that settles to its previous value never resolves its waiters

Branch `fix/16-unchanged-settle`, based on `fix/15-absorbed-changes`. Chain E (async settling).
Next in the chain: `fix/17-lost-results`.

## What breaks

When a task's async activation settles to a value equal to its current one, the settle is skipped entirely. Anything awaiting the task hangs, and `c.defer()` bookkeeping is skipped:

- A spawn awaiting a re-running task hangs when the task settles to its previous value.
- A callback-suspend task that resolves to its seed value never resolves waiters.
- A deferred dependency that changed during the await does not re-run the task if the result is unchanged, and the task loses its subscription to it.
- `c.defer()` in a task that returns synchronously never subscribes the deferred dependency.

```js
const t = c.task(async (cx) => { cx.val(s); return await cx.suspend(load()); }); // always returns 1
c.spawn(async (cx) => { await cx.suspend(t); log("resumed"); });
s.set(2); // t re-runs, settles to 1 again, the spawn never logs "resumed"
```

## Root cause

- `ComputeProto._settle` returns early when the value is unchanged, skipping `settleNotify` (waiters), `settleDeps` (defers) and the loading-state notification.
- The callback branch clears `FLAG_INIT` before the settle, so the seed value counts as unchanged.
- The ASYNC_SYNC tail of `ComputeProto._update` never calls `settleDeps`.

## What anod should do

- Settling always completes the activation: it clears loading, resolves waiters, and processes defers. Only the value notification to subscribers depends on whether the value changed (as with any compute).

## Tests (4)

- `test/explore/async.test.js` › settling to an unchanged value › spawn awaiting a re-running task resumes when it settles to its previous value
- `test/explore/async.test.js` › settling to an unchanged value › callback-suspend task resolving to its seed value still resolves waiters
- `test/explore/async.test.js` › settling to an unchanged value › c.defer: a deferred dep that changed during the await re-runs the task even if the result is unchanged
- `test/explore/async.test.js` › settling to an unchanged value › c.defer in a task that returns synchronously still subscribes the deferred dep

Run with `bun test --conditions=src test/explore/async.test.js`.

## Fix

Settling now always completes the activation. Only the value write, the `_ctime` bump and the subscriber notification depend on the value having changed.

- `ComputeProto._settle`: the early return on an unchanged value is gone. It computes `changed` once. If the value changed, it writes the value and bumps `_ctime`. It then always runs `settleDeps` (dedup plus deferred deps, which may ask for a re-run), always resolves the waiters, and always does the lock / stale re-run check. Only `notify` and the `flush` that drains it stay behind `changed`. That is also what the old unchanged branch did: it notified nobody and did not flush.
- `settleNotify`: takes an optional `quiet` flag, passed when the value did not change. With it, passes 1 and 2 still run: waiters are resolved and subscribed, with the dedup against existing subscribers. Pass 3, which marks subscribers stale, is skipped. The parameter is optional, so `CellProto._settle`'s call is unchanged.
- `ComputeProto._update`: the callback-suspend branch keeps `FLAG_INIT` until `_settle`, like the promise and iterator paths already do. The first settle of a callback task therefore counts as a change and notifies its subscribers, even when it resolves to the seed.
- `ComputeProto._update` / `EffectProto._update`: when an async node's fn returns a sync value, the `ASYNC_SYNC` tail calls the new `settleDefers` if `c.defer()` was used. This settle never goes through `_settle`.
- `settleDefers` (new, with `hasDep`) subscribes each deferred sender the node does not already depend on. It deduplicates by scanning `_dep1` / `_deps` instead of using `settleDeps`' stamps. The sync tail can run nested inside an outer node's run, for example an effect pulling the task through `c.val()`, and restamping the task's deps there would overwrite the outer node's stamps. The outer node would then add the same dep twice.

### Behavior decisions

- **Subscribers are not notified when a task settles to an unchanged value.** The spec says so ("as with any compute"), and it keeps `test/suspend.test.js` › loading suppresses downstream intact. **For the maintainer:** a subscriber that read the task *while* it was loading, typically through `c.pending(t)`, keeps that view. For example, an effect and a task both read `filter`. The effect re-runs first, pulls the task (now loading) and shows "Loading...". The task then settles to the same value, and the effect is never told. `fix/base` behaves the same way, because there nothing is delivered at all. If this should change, one cheap rule without new fields: on an unchanged settle, notify only subscribers whose `_time >= this._time`, the ones that ran after this activation started and so may have seen it loading. A subscriber that only pulled the task through `needsUpdate` keeps its older `_time` and is not woken. Resources (`CellProto._settle`) notify on every settle, so they don't have this gap.
- A callback task that re-runs before its first settle now keeps `FLAG_INIT` through the re-run. As on the promise path, the abandoned first activation's cleanups then run at the next re-run after the settle instead of right away.
- A deferred dep of a sync-returning activation is subscribed when the run ends. The "changed during the await" re-run check is skipped. The value was read in this same run, so only a write from inside the run could have changed it, and a sync compute ignores that case as well (`_update` clears the `FLAG_STALE` its own write caused).
- The same sync-tail fix applies to spawns, which had the same gap: a spawn whose body returns synchronously never subscribed its `c.defer()` deps, and kept the stale snapshot in its channel.

### Side effects

- Spawns that return synchronously now subscribe their deferred deps. No test covers this.
- No other group's tests changed state.

### Test expectations changed

None.

### Hot paths touched

- `ComputeProto._update`: only inside `if (flag & FLAG_ASYNC)`, so sync computes are untouched. The callback branch does one flag write fewer. A task that returns a sync value pays one `FLAG_CHANNEL` test, plus the defer null checks only if it has a channel.
- `EffectProto._update`: the same for spawns that return a sync value. Sync effects are untouched.
- `ComputeProto._settle` and `settleNotify` run once per async settle, not per update. An unchanged settle now does the work it used to skip (`settleDeps`, waiters), but none of that work is extra on a changed settle. `settleNotify` gains one boolean test.
- `settleDefers` / `hasDep` only run for an async node that returns a sync value after calling `c.defer()`.
- No fields added.
