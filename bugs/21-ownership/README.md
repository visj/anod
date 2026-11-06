# 21: Ownership leaks

Branch `fix/21-ownership`, based on `fix/base`. Chain G (ownership).

## What breaks

- A root whose callback throws leaves the effects it already created running, and the caller never gets a handle to dispose them.
- Disposed children pile up in a long-lived root's `_owned` array (100 created-and-disposed effects leave 100 entries), so it grows without bound.
- A cleanup that writes a signal during root disposal re-runs a sibling that is half-way through being disposed.

```js
root((r) => { r.effect((cx) => log(cx.val(s))); throw new Error("setup"); });
s.set(1); // the orphaned effect still logs
```

## Root cause

- `startRoot` has only a `finally`; nothing disposes the root when its callback throws.
- Nothing unlinks a disposed child from its owner; `addOwned` only appends and only `clearOwned` empties the array.
- An idle `dispose()` calls `_dispose` directly without leaving IDLE, so a write in a cleanup flushes immediately while `clearOwned` is mid-way.

## What anod should do

- A root whose callback throws is disposed (its effects and cleanups too) before the error is rethrown.
- A disposed child does not keep a slot in its owner forever; the owner's list is compacted (tombstone-style is fine) so its size tracks live children.
- Disposal is one transaction: writes from cleanups are queued and flushed after the whole subtree is disposed, so no node being disposed re-runs.

## Tests (3)

- `test/explore/ownership.test.js` › disposal timing › a root callback that throws does not leave its effects running
- `test/explore/ownership.test.js` › ownership › disposed children are not retained by a long-lived root
- `test/explore/ownership.test.js` › disposal timing › a cleanup write during root disposal does not re-run a sibling being disposed

Run with `bun test --conditions=src test/explore/ownership.test.js`.

## Fix

All 3 tests pass. No other test changed state: the same 86 `test/explore` tests fail before and after, minus these 3. The original suite passes (510/510) against both source and dist.

### What changed

- **`startRoot`** catches a throw from the root callback, disposes the root (its cleanups and owned nodes), then rethrows. If that disposal also throws, the setup error still wins.
- **`dispose()`**, when idle, now runs as its own transaction. It sets `IDLE = false` around `_dispose()`, then flushes whatever the cleanups queued: writes, and disposes of other nodes. Nothing being torn down can re-run halfway through. The flush sits in a `finally`, so writes made before a throwing cleanup still commit before the error propagates (the same rule bug 06 sets for `batch`). The non-idle path is unchanged: it queues onto `DISPOSES`.
- **`flush()`'s `DISPOSES` drain** reads `DISPOSER_COUNT` on each pass instead of a snapshot. This was needed for the change above. Disposes queued by a cleanup used to be dropped if they were queued during the drain. That bug already existed under `batch`, and it would now have hit plain idle chains too (a cleanup disposes a node whose cleanup disposes another). The drain also reads each node's `_owner` before `_dispose()` and passes it to `purgeOwned`.
- **`purgeOwned(owner)`** (new, in the ownership section, next to `addOwned`/`clearOwned`) runs after a child is disposed on its own. It handles only live owners that aren't already queued. When idle, it compacts the owner at once. Inside a transaction, it sets `FLAG_PURGE` and queues the owner onto `PURGES`. The `PURGES` phase comes after the `DISPOSES` drain in the same pass, so the child is already flagged disposed when the compaction runs.
- **`RootProto._purge` / `EffectProto._purge`** (new) compact `_owned` in place, dropping every `FLAG_DISPOSED` entry. This is the tombstone sweep `_subs` already uses, with two differences: it is order-preserving (siblings are still disposed in reverse creation order), and it has no counter. `PURGES` now holds owners as well as senders. On an owner, `FLAG_PURGE` means "queued to compact `_owned`".
- **`SignalProto._owner = ComputeProto._owner = null`**: prototype defaults, so `dispose()` and the drain can read `_owner` on any node. This follows the existing `SignalProto._equal = null` pattern.
- Types: `PURGES` is `Array<Sender | Owner>` in `types/internal.d.ts`. In `src/types.js`, `Disposer` gains `_owner` and `Owner` gains `_purge()`.

### Behavior decisions

- **Which disposals compact the owner.** An effect disposed through `dispose()` frees its slot at the end of the transaction, whether the call was idle, inside a `batch`, or inside a running effect. Effects disposed by the engine after an error, and owned computes disposed explicitly, do not queue their owner. Their slot goes at the owner's next compaction (any explicit child dispose sweeps every tombstone), re-run or disposal. See "Open points".
- **Nested disposes are queued.** A `dispose()` called from a cleanup during a disposal is queued like any other non-idle dispose. It is drained in the same transaction, before the queued writes are applied, because the flush drains `DISPOSES` before `SENDERS`.
- **Idle compaction runs directly**, not through a flush. This matters for a root created inside a running effect: `startRoot` forces `IDLE = true` there (bug 02), and a flush started from that spot would corrupt the outer one. A flush only starts when a cleanup actually queued work, the same as before.
- **Writes from pending posts commit early.** When the dispose transaction flushes, it also applies writes that `post()` had queued for the next microtask. `startEffect`, `startCompute` and `Compute.get()` already do the same.
- **The emptied list is kept.** An owner whose children have all been compacted keeps an empty `_owned` array instead of `null`, just as it does after `clearOwned`.
- **The setup error wins in `startRoot`.** Errors from the root's disposal are swallowed there ("the first error wins", as in bug 06).

### Test expectations changed

None.

### Hot paths touched

- **Effect creation (`addOwned`, the factories), re-runs (`_update`, `clearOwned`), `notify`, `flushEffects`** and every flush phase other than the `DISPOSES` drain: untouched.
- **`flush()`'s `DISPOSES` drain:** for each queued dispose it adds one `_owner` load and a `purgeOwned` flag check, and it reads the global `DISPOSER_COUNT` instead of a local. This only runs when disposes are queued.
- **`dispose()`:** the idle path adds a `try`/`finally`, two `IDLE` writes, two queue-count checks and an `_owner` check. For roots (as in the benchmarks) `_owner` is `null`, so no compaction runs.
- **Memory:** no new instance fields and no new flag bits. `FLAG_PURGE` is reused on owners. `_owner` and `_purge` are prototype properties, and `_purge` reuses an existing mangled name.
- **Compaction cost:** a full pass over the owner's `_owned` each time it runs. Inside a `batch` or flush, that is one pass per owner per flush pass. Idle `dispose()` calls on children of one owner, one at a time and not newest-first, cost O(n) each, so O(n²) to dispose n children like that. A batch, or disposing the owner, avoids it. To make it amortized O(1) like `_subs`, the owner would need a tombstone counter: a new field on Root (4 → 5) and on Effect (14 → 15). I did not add one because of the memory concern; it is the maintainer's call.

### Open points for the maintainer

- **Error-disposed effects.** The `node._dispose()` calls after `tryRecover` in `startEffect`, `flushEffects` and `EffectProto._settle` do not compact the owner, so a long-lived root with a `recover` handler whose children keep failing still accumulates tombstones until some sibling is disposed explicitly. Those call sites belong to chains A and C, so I left them alone. Recommendation: once A and C land, read `node._owner` before each of those `_dispose()` calls and pass it to `purgeOwned` (rare path, no hot-path cost). Moving the call into `EffectProto._dispose` would cover every path at once. But it would add an owner-state check to each child disposal in `clearOwned`, which runs on every re-run of an effect that owns children.
- **Owned computes** keep no reference to their owner, so an explicitly disposed compute is only swept along with its siblings. Fixing that needs an `_owner` field on Compute, a numerous node. I don't recommend it.
- **Async disposals.** `EffectProto._settle` and `ComputeProto._settle` call `_dispose()` directly at idle (a deferred dispose of a locked node, or an unrecoverable async error). Those disposals do not get the transaction yet. Recommendation: route them through the same `IDLE = false` / flush pattern (chains E/F).
- **Stuck `FLAG_PURGE`.** `flush()`'s `finally` zeroes `PURGE_COUNT` on a throw without clearing `FLAG_PURGE`. An owner queued in the aborted pass then never compacts again, which is the same hole senders already have. Bug 06's fix should run or reset `PURGES` on abort.
- **Merge points with chain A.** Two conflicts are likely. In the `DISPOSES` drain loop, keep both the re-read of `DISPOSER_COUNT` and the `purgeOwned(owner)` after each `_dispose()`. In `startRoot`, bug 02 stops it forcing `IDLE`; keep the new `catch`, since it works the same either way (inside an outer transaction the dispose is just queued). The changes to `RootProto._dispose`/`EffectProto._dispose`/`clearCleanup` do not overlap with this branch.
