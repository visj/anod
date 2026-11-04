# 02: A flush started inside another flush corrupts it

Branch `fix/02-nested-flush`, based on `fix/06-aborted-flush`. Chain A (flush).
Next in the chain: `fix/11-drain-writes`.

## What breaks

Several paths start a second `flush()` while one is already running. The inner flush re-walks the shared queues from index 0: it reads slots the outer loop already nulled (`null … '_flag'`), re-runs queue entries forever (`Maximum call stack size exceeded`), and on exit sets `IDLE = true` while the outer flush or batch is still running.

Ways to get there:
- `flush()` called inside an effect or compute.
- `root()` inside an effect: `startRoot` forces `IDLE = true`, so a write in the root body flushes immediately. The `.get()` of a stale compute in there also resets `FENCE`, so the outer effect loses its dependencies.
- A resource callback that returns synchronously while the write queue drains: `asyncAssign → _runAsync → flush()`, and the error path `_error → _settle → flush()`.
- A task whose `c.suspend(cb)` callback resolves synchronously: `ComputeProto._settle` calls `flush()` while not idle.
- `flush()` inside `batch()`: later writes in the batch apply immediately instead of being coalesced.

```js
root((r) => {
    r.effect((cx) => { if (cx.val(s) === 1) flush(); });
    r.effect((cx) => { cx.val(s); });
});
s.set(1); // the first effect dies with TypeError: null ... '_flag'
```

## Root cause

- `flush()` sets `IDLE = false` on entry and `IDLE = true` in `finally` unconditionally, with no guard against re-entry.
- `startRoot` saves and forces `IDLE = true` for the root body.
- `_runAsync` (sync result), `CellProto._settle` and `ComputeProto._settle` call `flush()` without checking whether a flush is already running.

## What anod should do

- `flush()` is re-entrant-safe. Called while a flush or batch is active, it does not start a second drain over the same queues; the active flush picks up the new work.
- Only the outermost transaction (flush, batch or idle write) sets `IDLE` back to `true`.
- A root created inside a running effect does not leave the outer transaction. Its writes are queued and drained by the outer flush, and reading a stale compute inside it keeps the outer node's dependency stamps intact.
- A resource or task that settles synchronously during a drain writes and notifies, and leaves the flushing to the active drain.

## Tests (10)

- `test/explore/scheduling.test.js` › re-entrant flush › flush() inside an effect does not crash when sibling effects are queued
- `test/explore/scheduling.test.js` › re-entrant flush › flush() inside a compute does not turn the compute into a FATAL error
- `test/explore/scheduling.test.js` › re-entrant flush › a root created inside an effect can write a signal without corrupting the outer flush
- `test/explore/scheduling.test.js` › re-entrant flush › flush() inside batch keeps later writes in the batch coalesced
- `test/explore/scheduling.test.js` › resource writes in queued paths › batched resource set(fn) with a sync result settles without overflowing the stack
- `test/explore/scheduling.test.js` › resource writes in queued paths › resource set(value, fn) with a sync result from inside an effect does not overflow the stack
- `test/explore/scheduling.test.js` › resource writes in queued paths › batched resource set(value, fn) whose fn throws synchronously sets the error state
- `test/explore/async.test.js` › callback suspend › a task resolving synchronously inside batch() does not end the batch early
- `test/explore/async.test.js` › callback suspend › a task resolving synchronously while created inside an effect re-run settles cleanly
- `test/explore/graph.test.js` › version stamping across nesting › nested root: .get() of a stale compute inside an effect keeps the effect's deps

Run with `bun test --conditions=src test/explore/async.test.js test/explore/graph.test.js test/explore/scheduling.test.js`.

## Fix

_Not fixed yet. The fix branch fills this in._
