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

_Not fixed yet. The fix branch fills this in._
