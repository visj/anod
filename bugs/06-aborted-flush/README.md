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

_Not fixed yet. The fix branch fills this in._
