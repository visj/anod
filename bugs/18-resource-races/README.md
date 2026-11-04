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

_Not fixed yet. The fix branch fills this in._
