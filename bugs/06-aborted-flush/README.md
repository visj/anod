# 06: A throw that escapes a flush breaks the engine

Branch `fix/06-aborted-flush`, based on `fix/base`. Chain A (flush).
Next in the chain: `fix/02-nested-flush`.

## What breaks

When an error escapes `flush()` (an updater throws, an effect with no recover handler throws, a recover handler or cleanup throws), the engine is left in a state it never recovers from:

- Effects that were queued but skipped keep `FLAG_STALE`, and `notify` never queues a stale node again, so they never run again.
- Writes and disposes queued earlier in the same flush are silently dropped.
- A `batch` whose callback throws leaves its writes in the queue, and some unrelated later flush applies them.
- A throwing recover handler escapes before the failing effect is disposed, so it keeps running, and its siblings go deaf.
- A cleanup that throws on re-run is skipped by the flag bookkeeping (the effect goes deaf), and a single-function cleanup runs twice because `_cleanup` is cleared only after the call returns.
- A throwing root cleanup aborts `RootProto._dispose` before `clearOwned`, so the root reports disposed while its effects keep reacting.

```js
c.effect(a, (v) => log(v));
batch(() => { a.set(1); b.set(() => { throw new Error("u"); }); }); // throws
a.set(2); a.set(3); // the effect never runs again
```

## Root cause

- `flush()` stops processing queues once `thrown` is set (`if (!thrown)` around the effect phases) and its `finally` zeroes every queue count. The skipped nodes keep their flags and the dropped entries are lost.
- An exception from the sender drain loop or `flushEffects` leaves the loop with the remaining entries unprocessed.
- `batch` skips `flush()` when its callback throws, but leaves the queue intact.
- `tryRecover` runs unguarded inside the `catch` in `flushEffects`.
- `EffectProto._update` calls `clearCleanup` before its `try`/`finally`; `RootProto._dispose` and `EffectProto._dispose` run cleanups before `clearOwned` with no guard.

## What anod should do

- An error thrown during a flush is reported to the caller (the first unhandled error wins), but it never leaves the engine inconsistent. Every node queued in that flush is either run or has its stale/pending flags reset, so the next write reaches it.
- Writes and disposes queued in the same flush are still applied. A failing updater only loses its own write.
- A `batch` whose callback throws still commits the writes made before the throw, then rethrows. (Rolling back is not possible without snapshots, and leaving them for an unrelated flush is the worst option.)
- A throwing recover handler counts as an unhandled error for that effect: the effect is disposed, the flush continues, and the error is rethrown at the end.
- A throwing cleanup runs exactly once. It counts as an error of its node (wrapped as FATAL) and never stops the disposal of the node or of its owned children.

## Tests (10)

- `test/explore/scheduling.test.js` › throw mid-drain: engine state afterwards › an updater that throws mid-drain does not leave an earlier-notified effect permanently stale
- `test/explore/scheduling.test.js` › throw mid-drain: engine state afterwards › an updater that throws mid-drain does not silently drop queued writes to other signals
- `test/explore/scheduling.test.js` › throw mid-drain: engine state afterwards › an unrecovered effect error does not leave sibling effects in later queues permanently stale
- `test/explore/scheduling.test.js` › throw mid-drain: engine state afterwards › an unrecovered effect error does not drop writes queued by effects that already ran
- `test/explore/scheduling.test.js` › throw mid-drain: engine state afterwards › a batch whose callback throws does not leave its writes for an unrelated flush to commit
- `test/explore/ownership.test.js` › engine state after errors › a dispose queued by an effect survives another effect throwing in the same flush
- `test/explore/ownership.test.js` › engine state after errors › a throwing recover handler still disposes the effect and keeps siblings alive
- `test/explore/ownership.test.js` › cleanup and finalize › a cleanup that throws on re-run does not deafen a self-recovered effect
- `test/explore/ownership.test.js` › cleanup and finalize › a cleanup that throws on re-run runs once and surfaces as a FATAL error
- `test/explore/ownership.test.js` › cleanup and finalize › a throwing root cleanup does not keep owned effects alive

Run with `bun test --conditions=src test/explore/ownership.test.js test/explore/scheduling.test.js`.

## Fix

A failed flush now finishes its work: it records the first unhandled error, keeps draining, and rethrows that error at the end. Only the runaway guard still aborts.

### Changes

- `flush()`: the dispose and write drains catch per entry, record the first error and continue. The effect phases always run (the `if (!thrown)` guards are gone), and the `do/while` keeps cycling while writes or disposes are queued. So writes queued by effects that already ran are applied, and every queued effect runs.
- `flushEffects()`: the `catch` clears `FLAG_STALE | FLAG_PENDING` (a cleanup that throws aborts `_update` before its own `finally` does), records the run's error before disposing, and catches a disposal that throws.
- `tryRecover()`: a handler that throws leaves the error unhandled (`RECOVER_NONE`), so the effect is disposed and its error is rethrown. This covers every caller (`flushEffects`, `startEffect`, `EffectProto._settle`).
- `batch()`: `flush()` moved into the `finally`, so a throwing callback commits the writes it made before the throw, then the throw propagates.
- `clearCleanup()`: the single-function form clears `_cleanup` before calling it, so it runs exactly once. In the array form a throw no longer stops the remaining cleanups: each cleanup is popped before it runs, so the `finally` just runs `clearCleanup` again on what is left.
- `clearOwned()`: the same resume trick. A child whose cleanup throws is disposed, and so are its siblings.
- `RootProto._dispose`, `EffectProto._dispose`, `ComputeProto._dispose`: the steps after the cleanups (owned children, channel abort, releasing references) run in `finally` blocks.
- `ComputeProto._update`: a cleanup that throws on re-run fails that run. The compute stores `{ error, type: FATAL }`, keeps its deps, and runs again on the next change. Without this, the throw escaped from `needsUpdate`/`checkRun` into whichever effect was pulling the compute, and left the compute `PENDING` (deaf).
- `dispose()`: an idle dispose whose cleanup throws finishes the disposal, then throws `{ error, type: FATAL }`.

### Behavior decisions

- **Keep running effects after an error.** The spec allows either running a queued effect or resetting its flags. The README says effects "are always push-based. When their dependencies change, they are enqueued into the flush loop and re-run automatically", and this spec says the writes in a failed flush are still applied. So an effect whose dependency took a committed write has to re-run. Resetting without running would also be unsafe: an effect that reads a compute, reset while the compute is still `STALE`, never hears from it again. Siblings in the same queue already ran on `fix/base`; now later queues run too.
- **Error shapes.** Effect errors keep the `{ error, type }` shape they get from the recover pipeline. A throwing updater is rethrown raw, as on the idle `set()` path. A cleanup error during disposal goes through no recover handler. It is wrapped as `{ error, type: FATAL }` once, where it leaves the engine: an idle `dispose()`, the flush's dispose drain, or the disposal of a failed effect in `flushEffects`. Inside the engine it travels raw, so a child's cleanup error raised during its parent's re-run is wrapped only once, by the parent's `catch`.
- **Whose error is it?** A cleanup that throws on an effect's re-run is that effect's run error. Its recover handlers from the previous activation are still registered, so `c.recover(() => true)` keeps the effect alive. The owned children of that activation are only disposed if the effect is disposed (otherwise its next run disposes them).
- **Throwing recover handler.** The effect's original error is what propagates. The handler's own error is dropped.
- **Several errors in one teardown.** When more than one cleanup throws while a single node is torn down, the last error wins, as with nested `finally` blocks and as with `DisposableStack`. Across a flush, the first unhandled error wins. The runaway error still replaces any earlier error, since the flush really was cut short.
- **`batch` with two errors.** If the callback throws and committing its writes throws as well, the commit's error propagates (JS `finally` semantics).

### Test expectations changed

Both changes are in `test/explore/scheduling.test.js` › throw mid-drain:
- "an updater that throws mid-drain does not leave an earlier-notified effect permanently stale": `runs` is 2 right after the batch (the effect runs for the committed `a = 1`) and 3 after `a.set(2)`. The original expected 2 after `a.set(2)`, which only holds if the failed flush skips an effect whose dependency was committed. That contradicts the README's push-based effects, quoted above.
- "an unrecovered effect error does not leave sibling effects in later queues permanently stale": `e2` is 2 after the failed `s.set(1)` and 3 after `s.set(2)`, for the same reason.

Both tests still check what they were written for: the next write re-runs the effect.

### Side effects

- Bug 01's two tests ("an unowned effect that throws on creation surfaces a FATAL error", "an unowned effect that throws on re-run is disposed") pass on this branch. The global `c`'s Clock has no `_recover`, so `_checkRecover` throws a TypeError, which the new `tryRecover` catch treats as unhandled. The outcome is the one bug 01 asks for, but the proper fix (giving the Clock `_recover = null`) is still bug 01's.
- The first half of bug 14's "aborted drains leave no phantom queued-write marker on senders" now holds, because the write drain no longer aborts. The runaway half is left to bug 14.

### Not covered

- `ComputeProto._drop` (a weak compute releasing its value) runs cleanups from inside `clearReceiver`, in the middle of `patchDeps`/`clearDeps`. A throw there still escapes mid-reconciliation. `_drop` belongs to bug 04.
- `startEffect` and `EffectProto._settle` dispose a failed effect directly. If that disposal throws, its raw error propagates instead of the effect's error. Bug 07 reworks those paths.

### Hot paths touched

- `flush()` write and dispose drains: a `try/catch` around each entry's call. In V8 a `try` block costs nothing until it throws, and the per-entry work is otherwise unchanged. The effect phases lose a branch (`if (!thrown)`), and so does the `do/while` condition.
- `flushEffects()`: only the `catch` block changed.
- `ComputeProto._update`: a `try/catch` inside the existing `_cleanup !== null` branch, nothing on the common path.
- `clearCleanup()`: the single-function form moves its store before the call. The array form gains a `try/finally` and one compare per call.
- `clearOwned()`: a `try/finally` and one compare per call.
- `dispose()` (idle) and the three `_dispose` methods: `try/catch` or `try/finally` only.
- No node fields added.
