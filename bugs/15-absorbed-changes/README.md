# 15: An absorbed upstream change still tears down async work

Branch `fix/15-absorbed-changes`, based on `fix/base`. Chain E (async settling).
Next in the chain: `fix/16-unchanged-settle`.

## What breaks

When a dependency is notified as *pending* but turns out not to have changed (a compute recomputes to the same value), an in-flight task or spawn is torn down anyway:

- A spawn waiting on a loading task loses its waiter and hangs forever.
- The node's `c.controller()` is aborted although it neither re-ran nor was disposed; the task settles as a FATAL AbortError.
- A loading task pulled through the absorbed change has its activation token moved, so its result is thrown away and it stays loading forever.

```js
const sign = c.compute(s, (v) => v > 0);
c.spawn(async (cx) => { cx.val(sign); await cx.suspend(loadingTask); log("done"); });
s.set(2); // sign stays true, yet the spawn never logs "done"
```

## Root cause

- `EffectProto._receive` and `ComputeProto._receive` call `resetChannel` on any PENDING notice, before anyone knows whether the dependency changed.
- `checkSingle` / `checkRun` set `node._time = time` on a loading task, which invalidates the live activation's time token.

## What anod should do

- In-flight async work is only cancelled when the node actually re-runs or is disposed. A pending notice that resolves to "nothing changed" leaves waiters, controllers, defer snapshots and activation tokens alone.

## Tests (3)

- `test/explore/async.test.js` › absorbed upstream change while awaiting › spawn awaiting a loading task survives an upstream change a compute absorbs
- `test/explore/async.test.js` › absorbed upstream change while awaiting › task controller is not aborted when an upstream compute absorbs the change
- `test/explore/async.test.js` › absorbed upstream change while awaiting › loading task can still settle after a subscriber pulls it through an absorbed change

Run with `bun test --conditions=src test/explore/async.test.js`.

## Fix

The teardown of in-flight async work moves from the notification to the re-run, which is the one place that knows the node really re-runs.

- `ComputeProto._receive`: no longer calls `resetChannel` on a loading task. `ComputeProto._update` already resets the channel on every re-run, so the eager reset was redundant except in the absorbed case, where it was wrong. `FLAG_LOADING` drops out of the fast-path mask, and the branch that only existed for loading tasks goes with it.
- `EffectProto._receive`: no longer clears `FLAG_LOADING | FLAG_SUSPEND` or calls `resetChannel`.
- `EffectProto._update`: does that teardown instead, right after taking the new `_time`, when the previous activation is still loading. It runs before the cleanups, the same order as before.
- `checkSingle` / `checkRun`: the clean path ("no dep changed") no longer moves `node._time`. `_time` is both "when the node last ran" and the activation token captured by `c.suspend`, `resolvePromise` and `resolveIterator`, so moving it without a re-run killed the live activation. Change detection does not need the bump: a dep's `_ctime` is the time it changed, which is either at or before the node's last run (already verified clean) or after the check (still greater than the old `_time`).

### Behavior decisions

- A pull-based task that is notified while loading keeps its controller, waiters and defer snapshots until it is actually pulled and re-runs, or is disposed. Before, any notice aborted its controller, even if nobody ever read the task again. Its result is still dropped if the change was real: `resolvePromise` sees `FLAG_STALE` (or `FLAG_PENDING` with `needsUpdate`) and discards it. This is the contract in the spec and in the README's `c.controller()` section ("aborted when the node re-runs or is disposed").
- In that state, a task the stale task awaits may settle first and resume the stale activation's continuation. That matches `c.suspend(promise)`, which also only checks the activation token. The continuation's return value is discarded as above.
- Effects tear down only a still-loading activation on re-run, as before. `test/async.test.js` › controller works with spawn requires that a completed spawn activation's controller is not aborted.
- `c.version()` now changes only when the node re-runs, which is what the README documents ("increments every time the node re-runs"). Before, a clean pull through `checkRun` also changed it.

### Side effects

- A spawn that is paused while loading, goes stale, and is then resumed now tears down its old activation. `resumeEffect` enqueues the effect without calling `_receive`, so before the fix the old waiter survived and the stale continuation ran next to the new one. No test covers this.
- A task awaiting another task (`c.suspend(task)`) through an absorbed change no longer loses its waiter. Same root cause as the spawn case. No test covers this either.
- No other group's tests changed state.

### Test expectations changed

None.

### Hot paths touched

- `ComputeProto._receive`: less work. One flag dropped from the fast-path mask; the loading branch (a `resetChannel` call, two flag tests and an extra `notify` call site) is gone.
- `EffectProto._receive`: less work. The `FLAG_LOADING` test and the teardown are gone.
- `EffectProto._update`: one added `flag & FLAG_LOADING` test, moved from `_receive`. It now runs once per re-run instead of once per notice.
- `checkSingle` / `checkRun`: less work. One store fewer on each of the three clean paths.
- No fields added.
