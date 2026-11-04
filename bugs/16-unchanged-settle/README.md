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

_Not fixed yet. The fix branch fills this in._
