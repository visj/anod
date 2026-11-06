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

`flush()` now knows when a drain is running and doesn't start a second one. A root no longer leaves its caller's transaction. Work queued synchronously in the middle of a drain is carried into the drain's next cycle.

### Changes

- New engine global `FLUSHING` (exported and declared in `types/internal.d.ts` like `IDLE`), set while `flush()` drains.
- `flush()`: returns at once while `FLUSHING` is set, so the running drain picks up whatever the caller queued. It saves `IDLE` on entry and restores it on exit instead of forcing `IDLE = true`, so only the outermost transaction goes back to idle. A `flush()` inside a batch still drains (the test expects that) but leaves the batch open.
- `_runAsync`, `CellProto._settle`, `ComputeProto._settle` and `EffectProto._settle` are unchanged. During a drain, their `flush()` call is now a no-op, so a resource or task that settles synchronously writes, notifies and leaves the flushing to the drain.
- `startRoot()`: no longer forces `IDLE = true`. Inside a running effect, the root's writes are queued for the outer flush, its effects run through the non-idle `startEffect` path, and a `.get()` inside it takes the non-idle `_refresh` path, which keeps `FENCE` (and so the outer effect's dependency stamps). At top level nothing changes, since the caller is already idle.
- Queues that grow mid-drain: once a nested `flush()` stops draining on the spot, a node that settles or resumes synchronously during the compute or effect phase is appended past the count that phase took. The phase then zeroed its count, which would leave that node `STALE` and unqueued (deaf); on `fix/base` the nested flush crashed instead. Each phase now compares its count after draining and, if the queue grew, `requeue()` moves the new entries to the front. The `do/while` keeps cycling while any queue is non-empty. `SCOPE_COUNT` is zeroed before the levels drain rather than after, so an effect scoped again at a level already drained is not lost either. This covers the resume-from-an-effect case too.

### Behavior decisions

- `flush()` inside a batch drains the writes queued so far and leaves the batch open, so later writes in the batch stay coalesced. A synchronous settle inside a batch body does the same, because it calls `flush()` while no drain is running.
- Inside a root created by a running effect, writes are queued: the root body reads the old value of a signal it has just written, and the write lands when the outer flush drains.
- Effects queued mid-drain run in the next cycle of the same flush, after that cycle's writes. They see the latest values and count toward the runaway guard.

### Tests

9 of 10 pass. "a task resolving synchronously while created inside an effect re-run settles cleanly" still fails, but only its last assertion: the crash is gone and `t.error` is `false`. `t.get()` is `undefined` because the ASYNC_SYNC tail of `ComputeProto._update` overwrites the value the callback settled synchronously with the function's `undefined` return. That is bug 17 (chain E, "A callback that settles synchronously wins over the function's `undefined` return"). With that overwrite patched out locally, this test passes. It should go green in `fix/all`.

No test expectations changed. No other group's tests changed state.

### Not covered

- After a runaway abort, effects that a sync settle requeued in the last cycle are dropped with the other counters, as before. The runaway cleanup in `flush()`'s `finally` is bug 14's.
- `resume()` inside an effect's *creation* run (the idle `startEffect` path), where no drain is running, still only enqueues: `startEffect` flushes afterwards only when writes or disposes are queued.

### Hot paths touched

- `flush()` entry and exit: one `FLUSHING` check, saving and restoring `IDLE`, and setting `FLUSHING`. Once per flush, not per entry.
- `flush()` compute and effect phases: each keeps its count in a local and compares it after draining (one compare per phase, and per scope level, per cycle). `requeue()` runs only when the queue grew. Per-entry work is unchanged.
- The `do/while` condition checks three more counters, only once the write and dispose counts are zero (the last check of each flush).
- `startRoot()` does less work.
- No node fields added. One new module-level variable (`FLUSHING`).
