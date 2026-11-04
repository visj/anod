# 10: A contextual write wipes its writer's state

Branch `fix/10-contextual-flags`, based on `fix/base`. Chain B (contextual and resource writes).
Next in the chain: `fix/12-queued-resource-writes`.

## What breaks

`c.set(sender, v)` and `c.post(sender, v)` pause the writing node so it ignores its own write. When the write drains, the writer's stale, pending and paused flags are all cleared unconditionally. Consequences:

- A compute that was made stale by another dependency in the same drain stays at its old value forever.
- An effect misses an external write to another of its dependencies.
- A node the user paused with `pause()` silently resumes, or `resume()` finds nothing to replay.
- An update that arrived during `c.lock()` is lost.
- The README's interceptor pattern misses a later external write: the guarded write notifies everyone except the paused interceptor and clears `FLAG_SCHEDULED`, so a second write in the same drain notifies no one.

```js
// effect F writes `a` when trigger changes; comp reads trigger and a, and c.set(b, …)
trigger.set(5);
comp.get(); // 0, while a is 5, permanently
```

## Root cause

- `guardedAssign` / `guardedAsyncAssign`: `finally { receiver._flag &= ~(FLAG_PAUSED | FLAG_STALE | FLAG_PENDING); }`.
- The idle path of `contextSet` does the same after `notify`.
- Notify dedup (`FLAG_SCHEDULED`) assumes the first notify reached every subscriber, but a guarded write deliberately skips the paused writer.

## What anod should do

- A contextual write only suppresses the notification caused by that write, for that writer. It leaves the writer's flags exactly as they were before the write, apart from that one notification.
- A user `pause()` is never undone by a contextual write.
- A later write in the same drain still reaches a writer that was skipped by its own guarded write.

## Tests (6)

- `test/explore/scheduling.test.js` › contextual writes (c.set / c.post) › a compute's own c.set does not erase staleness caused by another dependency
- `test/explore/scheduling.test.js` › contextual writes (c.set / c.post) › an effect's own c.set does not swallow an external write to another dependency in the same drain
- `test/explore/scheduling.test.js` › contextual writes (c.set / c.post) › an interceptor still sees an external write that drains after its own guarded write
- `test/explore/scheduling.test.js` › contextual writes (c.set / c.post) › a paused spawn stays paused after its own contextual post drains
- `test/explore/scheduling.test.js` › contextual writes (c.set / c.post) › resume() re-runs an effect that went stale while paused, even if its c.post drained meanwhile
- `test/explore/async.test.js` › lock / unlock › locked spawn: c.set() to an unrelated signal does not erase the deferred re-run

Run with `bun test --conditions=src test/explore/async.test.js test/explore/scheduling.test.js`.

## Fix

All 6 tests pass. Besides the two listed root causes there was a third: when the guarded write reached its writer through a compute, the writer went deaf to that compute for good. The fix handles all three in the contextual write handlers. `assign()`, `notify()` and `flush()` are unchanged.

### Changes

- **`unguard(receiver, flag)`** (new, next to `guardedAssign`): lifts the guard after the write. It clears only the `FLAG_PAUSED | FLAG_STALE | FLAG_PENDING` bits the receiver did not hold before the write (`receiver._flag &= flag | ~(...)`). A user `pause()`, a lock's deferred staleness and staleness from another dep all survive. If the receiver was clean before the write and the write reached it as `FLAG_PENDING`, it pulls the receiver's stale or pending deps (see below).
- **`guardedAssign` / `guardedAsyncAssign`**: snapshot the receiver's flags, pause it, and call `unguard` in the `finally`. They also re-arm the sender's `FLAG_SCHEDULED` if it was set before the write. `assign()` clears that bit on the first changing write, and the guarded write skipped its writer. With the bit re-armed, the next changing write to the same sender in the drain notifies again, and so reaches the writer. The drain still clears the bit once every write has run.
- **`contextSet`** (idle path): same snapshot, pause, `notify`, `unguard`, then `flush()` as before.

### The transitive case

The original test `interceptor.test.js` › "paused receiver ignores transitive notifications" requires that a guarded write must not re-run its writer through a compute either. On `fix/base`, the compute `X` between the sender and the writer is marked `FLAG_STALE`, but its `FLAG_PENDING` to the paused writer is then cleared. `X` stays stale with the writer unmarked. `notify()` stops at an already-stale compute, so no later change to the sender ever reaches the writer, unless something else pulls `X`. For example, an effect that reads `compute(s)` and does `c.set(s, …)` once never runs again. A spawn interceptor that reads its signal through a compute stops intercepting.

Clearing the writer's `FLAG_PENDING` while `X` is stale is what breaks it, so `unguard` brings the writer's stale or pending deps up to date (`dep._refresh()` with `FENCE = SEED`, like `needsUpdate`). The writer still does not re-run, and the next change to the sender propagates through `X` to it again. This only happens when the writer was clean before the write and the write reached it as `FLAG_PENDING`. If the writer was already stale or pending, it runs or gets checked later anyway, and pulls `X` itself then.

Two tests pin this down. I added them to `test/explore/scheduling.test.js` › contextual writes: "a writer that reads its target through a compute still sees later writes" and "an interceptor reading through a compute sees an external write in the same drain". Both fail on `fix/base`.

### Behavior decisions

- **Flags are cleared by difference, not restored from a snapshot.** If an updater pulls the receiver (a compute) during the write, its fresh state is not overwritten with the old `FLAG_STALE`.
- **`FLAG_SCHEDULED` is re-armed unconditionally**, not only when the writer was actually skipped. The re-notify only ORs `FLAG_STALE` onto subscribers that are already stale, so it is a no-op for everyone except the skipped writer. It costs one extra subscriber walk, and only when another write to the same sender follows in the same drain. Notifying only the skipped writer would need extra per-write state.
- **The pull runs compute fns earlier than before.** They run while the write drains (or before the idle flush), not when the writer next runs. A stale task dep restarts its async work there. Its settle is a new notification, so the writer will see it.
- **The writer's `_time` is not advanced.** For async nodes `_time` is the activation id (`resolvePromise` compares it), so moving it would drop in-flight work. As a result, if the writer is later checked through another compute that turns out unchanged, `needsUpdate` sees the compute that changed through the writer's own write and re-runs the writer once. `fix/base` does the same, because the writer's check pulls the orphaned compute. Likewise, a writer that was already pending before its write may re-run through a compute its own write changed. `needsUpdate` cannot tell where a change came from.

### Test expectations changed

None.

### Other bugs' tests

None changed state. Exactly the 6 listed tests turned green, plus the 2 tests added above.

### Hot paths touched

None of `set`, `notify`, `val`, `_read`, `_update`, `_receive`, the `flush`/`flushEffects` loops or `checkRun`/`needsUpdate`. The contextual write paths (`guardedAssign`, `guardedAsyncAssign`, the idle `contextSet`) each do one more flag read and a few bit operations per write. The dep pull loop only runs when the write reached a clean writer through a compute. No new fields on any node.
