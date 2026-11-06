# 18: Resource races

Branch `fix/18-resource-races`, based on `fix/base`. Chain F (async API).
Next in the chain: `fix/19-async-gaps`.

## What breaks

- A plain `r.set(v)` while an async write is in flight is later overwritten by the stale server result, and `loading` stays true. That breaks last-write-wins.
- A synchronous callback that supersedes an in-flight write (`r.set(() => 7)`) never resolves the resource's waiters; a spawn awaiting `r` hangs.
- An effect checking `c.pending(r)` never sees `loading` become true for `r.set(v, asyncFn)`.

```js
r.set("b", async (rc) => await rc.suspend(save("b")));
r.set("plain");
// later: r.get() === "server", r.loading stayed true until then
```

## Root cause

- The plain-value path of `set` neither bumps `_time` nor clears `FLAG_LOADING`, so the in-flight activation still matches when it settles.
- The ASYNC_SYNC branch of `_runAsync` writes and flushes but never resolves the resource's channel waiters.
- `set` notifies and flushes the optimistic value before `_runAsync` sets `FLAG_LOADING`.

## What anod should do

- Any later write to a resource supersedes earlier in-flight activations: the stale result is discarded and loading ends.
- Every way an activation completes (sync value, promise, iterator, error) resolves the resource's waiters.
- Subscribers notified of an optimistic value observe `loading === true` in the same flush.

## Tests (3)

- `test/explore/async.test.js` › resource › plain set() during an in-flight async write is not overwritten by the stale result
- `test/explore/async.test.js` › resource › sync asyncFn superseding an in-flight write resolves the resource's waiters
- `test/explore/async.test.js` › resource › effect checking c.pending(resource) sees the optimistic value as loading

Run with `bun test --conditions=src test/explore/async.test.js`.

## Fix

All three tests pass. The changes are in `set`, `_runAsync` and `CellProto._settle`.

### What changed

- **`set` (idle path), plain write.** The existing `FLAG_SCHEDULED` test now checks `FLAG_SCHEDULED | FLAG_LOADING`. When a resource with an activation in flight gets a plain write (`asyncFn === undefined`), `set` bumps `_time` and calls `_settle(value)`. The new token orphans the old activation, so `CellProto.suspend` and `resolvePromise` drop its result. `_settle` ends loading, resolves the waiters with the written value and notifies.
- **`set` (idle path), `set(value, asyncFn)`.** `_runAsync` now runs between `notify` and `flush` instead of after the flush. By the time the subscribers of the optimistic value run, `FLAG_LOADING` is already set.
- **`_runAsync`.** The ASYNC_SYNC branch now settles through `_settle` instead of writing, notifying and flushing inline, so it resolves the resource's waiters. If the activation superseded one in flight (`FLAG_LOADING` was set on entry), it settles even when the value is unchanged or the result is `undefined`, so loading ends and the waiters resume. The callback-suspend early return now tests `FLAG_SUSPEND` alone instead of `FLAG_SUSPEND && FLAG_LOADING`: once the callback form was used, the callback owns settlement, even when it already settled synchronously.
- **`CellProto._settle`.** It called `settleNotify` (which resolves the waiters and notifies every other subscriber) and then `notify` on all subscribers. The second call re-ran each waiter that had just been resumed, so a spawn awaiting `c.suspend(r)` ran its continuation twice. It now calls `notify` only when there are no waiters, like `ComputeProto._settle`. Without this, the second test gets `[7, 7]`.

### Behavior decisions

- A plain write supersedes the activation in flight even when the value is equal, the same way an idle `set` supersedes queued posts regardless of equality. It always notifies, because loading changed. The equality function is not called on this path.
- `set(value, asyncFn)` on a loading resource does not resolve the waiters with the optimistic value. The optimistic value is not a settled one, so the waiters keep waiting for the new activation's result.
- With a sync `asyncFn` in the two-argument form, subscribers now run once, with the final value. They used to see the optimistic value first and then the result in a second flush. This matches the README ("If the callback returns a sync value, it settles immediately with no loading state"). A sync throw now goes straight to the error state in the same way.
- `asyncFn`'s synchronous part now runs after the optimistic write has notified but before the flush. Reading a compute from there pulls it up to date as usual. If that part writes another signal, the flush that write starts runs the subscribers early, and they see `loading === false`, as before this fix.
- An optimistic write equal to the current value still notifies nobody (`resource.test.js` › "resource with custom equality skips notification when equal"), so subscribers don't see loading in that case.
- A resource callback whose `c.suspend(cb)` settles synchronously keeps the callback's value, even if the function also returns a promise (an `async` callback). It used to be overwritten when the promise resolved to `undefined`. This is the resource side of bug 17.

### Not covered (needs a decision once chains A and B land)

The same supersession is missing on two other write paths. Both live in code that other chains are rewriting, so I left them alone:

- **Queued plain writes:** `batch(() => r.set(v))`, `r.post(v)` and `c.post(r, v)` drain through `assign`, which neither bumps `_time` nor ends loading, so the stale result still wins. Fixing it needs a `FLAG_LOADING` check in `assign` (the drain handler, a warm path), and `asyncAssign` must stop routing its optimistic write through that check, otherwise it would resolve the waiters with the optimistic value. `asyncAssign` is rewritten by bug 12 (chain B), and the drain loop by bugs 11 and 14 (chain A). Recommendation: do this after those merge. Add `FLAG_LOADING` to the existing `FLAG_MUTABLE | FLAG_SCHEDULED` masks in the queued `set` and `post` paths (free), and handle loading in `assign` with one flag test.
- **Idle `c.set(r, v)` / `c.set(r, v, fn)`:** `contextSet`'s idle branch has the same two problems (no supersession, and `_runAsync` after the flush). Bug 13 (chain B) rewrites that branch to mirror `set`. When both are merged, port the two `set` changes above to it.

### Tests

- No test expectations changed.
- No other group's tests changed state.
- The original suite still has 510 passing tests, but now runs 1624 `expect()` calls instead of 1627. Three spawns in `resource.test.js` ("spawn awaits a loading resource and receives value on settle", "... re-settles, spawn gets latest", "... that settles later") call `expect` inside their body and no longer run a second time after being resumed (the `CellProto._settle` double notification above).

### Hot paths touched

- `set`, idle path: the `FLAG_SCHEDULED` test became `FLAG_SCHEDULED | FLAG_LOADING`. For a plain signal it is the same load, AND and branch as before; only the mask changed. Only a loading resource enters the new inner test. The `asyncFn !== undefined` test now runs before `flush()` instead of after it, and the unchanged-value path tests `asyncFn === undefined` as before, so a plain signal does the same work on both paths.
- `_runAsync` and `CellProto._settle` are resource-only. `notify`, `flush`, `assign` and the receivers are untouched.
- No new fields on any node (the activation token is the existing `Cell._time`).
