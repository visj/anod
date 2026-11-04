# 19: Smaller async gaps

Branch `fix/19-async-gaps`, based on `fix/18-resource-races`. Chain F (async API).

## What breaks

A set of independent gaps in the async API:

- **unlock:** calling `c.unlock()` mid-flight loses the spawn's re-runs for good, for that change and every later one.
- **controllers:** with two `c.controller()` calls in one activation, only the second is aborted; the README says the controller "is automatically aborted when the node re-runs or is disposed".
- **suspend arrays:** a rejected member of `c.suspend([...])` (on the slow and the fast path) leaves the spawn unsubscribed; `FLAG_BLOCKED` from an abandoned array await is never cleared and breaks later task subscriptions; a member disposed while pending resolves as `null`.
- **suspend inputs:** `c.suspend(thenable)` returns `undefined`; `c.suspend(task, onResolve)` is declared in the types but the callbacks are ignored; a task that awaits itself deadlocks silently.
- **post-await reads:** a task that reads a compute after an await does not re-run when that compute changes.

## Root cause

- `unlock` only clears `FLAG_LOCKED`; the STALE flag set while locked (without `_receive`) is never acted on, and `resolvePromise` drops the stale run.
- `controller()` stores a single `channel._controller`.
- `_stepArray` rejects without subscribing; the fast path throws before the subscribe loop; `FLAG_BLOCKED` is set and never cleared on re-run; `_stepArray` never checks `FLAG_DISPOSED`.
- `suspend` returns the thenable's own `.then()` result; the task overload ignores its callbacks; `_suspendTask` has no self check (unlike `val()`).
- `subscribe()` appends to `_deps` but never clears `FLAG_SINGLE` (unlike `_read`), so `checkSingle` only checks `dep1`.

## What anod should do

- `unlock()` replays a change that arrived while locked (re-run when the activation finishes, or immediately if it already has).
- Every controller created in an activation is aborted when the node re-runs or is disposed.
- A rejected or disposed array member settles the await with an error (never `null`), and the node stays subscribed to every member so it re-runs when they change.
- `c.suspend(thenable)` resolves to the thenable's value; the declared callback overload works; awaiting yourself throws (like `val()`'s ILLEGAL_READ).
- Dependencies read after an await are tracked like any other.

## Tests (10)

- `test/explore/async.test.js` › lock / unlock › spawn that unlocks mid-flight still re-runs for a dep change made during the lock
- `test/explore/async.test.js` › c.controller() › every controller created in one activation is aborted on re-run
- `test/explore/async.test.js` › c.suspend([...]) › spawn that catches an array rejection re-runs when the rejected task recovers
- `test/explore/async.test.js` › c.suspend([...]) › fast path: catching an already-rejected array member keeps the spawn subscribed
- `test/explore/async.test.js` › c.suspend([...]) › FLAG_BLOCKED from an abandoned array await does not break later task subscriptions
- `test/explore/async.test.js` › c.suspend([...]) › a task disposed while an array await is pending does not resolve as null
- `test/explore/async.test.js` › c.suspend() inputs › c.suspend(thenable) resolves to the thenable's value
- `test/explore/async.test.js` › c.suspend() inputs › c.suspend(task, onResolve) calls onResolve as the public types declare
- `test/explore/async.test.js` › c.suspend() inputs › a task awaiting itself fails instead of deadlocking
- `test/explore/graph.test.js` › dynamic dependencies › task re-runs when a compute it read after an await changes

Run with `bun test --conditions=src test/explore/async.test.js test/explore/graph.test.js`.

## Fix

_Not fixed yet. The fix branch fills this in._
