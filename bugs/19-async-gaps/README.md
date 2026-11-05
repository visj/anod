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

All 10 tests pass. `c.suspend(task, onResolve)` was restored after a maintainer decision (see below). Each sub-issue is a separate, self-contained change.

### unlock

`ComputeProto.unlock` / `EffectProto.unlock` now look at what the lock deferred:

- Nothing deferred (no `FLAG_STALE`, `FLAG_PENDING` or `FLAG_DISPOSED`): release the lock, as before.
- Something deferred and the activation still in flight (`FLAG_LOADING`): the lock holds until the activation settles. `_settle` already replays a change (re-run) or a dispose that arrived while locked, so the stale run is no longer dropped by `resolvePromise`.
- Something deferred and the activation already finished (for example a sync node that locked): release, then replay right away, with `_dispose()` for a deferred dispose, otherwise `_receive()` and a flush.

Behavior decisions:

- I followed the spec ("re-run when the activation finishes") and did not re-run at the `unlock()` call. A re-run from inside `unlock()` would start the new activation while the old continuation is still on the stack, and that continuation's synchronous code after `unlock()` would then run interleaved with the new activation.
- While the lock holds after `unlock()`, a further change is folded into the same replay. It would be anyway: the node is already `FLAG_STALE`, so `notify` skips it.
- Side effect: a dispose that arrived during the lock, followed by `unlock()` mid-flight, used to leak. The continuation was dropped, `_settle` never ran, and the cleanups never ran. Disposal now completes when the activation settles.

**Test expectation changed:** `lock / unlock` › "spawn that unlocks mid-flight still re-runs for a dep change made during the lock". The spawn's re-run (with `s = 2`) locks again and waits on a deferred that the test never resolves, so README lock semantics ("prevents the node from re-running until the current activation completes (or `c.unlock()` is called)", also pinned by `lock.test.js` › "locked spawn ignores mid-flight dep changes") require `s.set(3)` to wait. The final expectation (`runs` ends with 3) could not hold under any implementation of the documented behavior. I added two lines that resolve the re-run's deferred before the assertions, so the re-run reaches its own `unlock()` and replays the change to 3. The assertions are unchanged, and the test still fails on `fix/18-resource-races` (`runs` stays `[1]`).

### controllers

- `Channel._controller` holds one controller or an array, stored the same way as `_cleanup` (single value, array from the second). `controller()` appends.
- The new helper `abortControllers()` aborts all of them. `resetChannel`, `ComputeProto._dispose` and `EffectProto._dispose` use it.
- `EffectProto._update`: when a node with a channel re-runs, it releases the previous activation's controllers, without aborting them.

Conflict to review: the README says the controller "is automatically aborted when the node re-runs or is disposed", and the spec repeats it. But the original test `async.test.js` › controller › "controller works with spawn" pins that a *completed* spawn activation's controller is **not** aborted on re-run ("Abort only happens when the spawn is actively loading"). The original test wins here. An in-flight activation's controllers are aborted on re-run (`_receive` → `resetChannel`), and the current ones on dispose. A completed activation's controllers are released on re-run, which is what the old single slot did when the next `controller()` call overwrote it. With an array, releasing on re-run is also what keeps them from piling up across completed activations. Tasks are unaffected: `ComputeProto._update` already resets the channel, aborting the controllers, on every re-run. To make spawns match the README instead, call `resetChannel` from `EffectProto._update` and update that test.

### suspend arrays

- **`_stepArray`.** A rejected member, a disposed member, or the awaiter itself fails the await, with the member's error or `ILLEGAL_READ`. On failure, as on success, it clears `FLAG_BLOCKED` and subscribes the awaiter to every live member (new helper `subscribeArray`). The waiter bound to the blocked member now re-enters the scan on reject too (`send(node, task, step, step)`), so a rejection or dispose of that member goes through the same path instead of rejecting directly.
- **`_suspendArray` fast path.** Same checks. It subscribes before throwing, like the single-task fast path.
- **`resetChannel`** clears `FLAG_BLOCKED`, so an array await that is abandoned (re-run, or loading node notified) no longer leaves it set.
- **`CellProto._dispose`** now sets `FLAG_DISPOSED` before resolving its waiters, as `ComputeProto._dispose` does. Otherwise a woken array scan saw a still-loading resource, re-bound its waiter to the array being cleared, and hung.

Behavior decisions:

- A disposed member rejects with `ILLEGAL_READ` ("Cannot read a disposed node or yourself"), like `c.suspend(disposedTask)` or `c.val(disposed)`. This includes a blocked member disposed while awaited, which used to reject with "Awaited task was disposed". After disposal the scan cannot tell a task from a resource. Awaiting a single task keeps its messages.
- Failures follow scan order, as before: a member that fails after a still-loading one is reported once the loading one settles.

### suspend inputs

- **`suspend()` and `CellProto.suspend()`** now return `Promise.resolve(thenable).then(guards)`. `Promise.resolve` returns a native promise as is, so nothing changes for promises. A thenable is adopted, so `await c.suspend(thenable)` yields its value.
- **`_suspendTask`** throws `ILLEGAL_READ` when awaiting itself, like `val()`. Array awaits do the same (see above).
- **`c.suspend(task, onResolve, onReject)` is restored.** It existed in `ed91691` and was dropped in `50cd012` when the setup-function form came in, but the types kept the overloads. It now works like `.then(onResolve, onReject)` without the Promise:
  - A settled task (or array of tasks) calls the callback before `suspend()` returns, inside the run, so its reads are tracked normally. A task settles with what the callback returns, through the same `FLAG_CALLBACK` path a synchronous setup-form `resolve` uses.
  - A loading task stores the user's callbacks directly as its waiter (no Promise, no closures) and marks the node loading. `FLAG_RELAY` (bit 21, free since bug 07) tells the waiter loop that the node settles with what the callback returns (`relay()`), or fails with what it throws. `deliver()` picks between that and a plain call; an array walk (`FLAG_BLOCKED`) relays only when its snapshot is complete.
  - An error without `onReject` fails the node (`node._error`), as a throwing await would. A re-run (`resetChannel` clears `FLAG_RELAY`) or dispose drops the waiter.
  - A callback suspend can't start while another suspend is pending (`FLAG_SUSPEND | FLAG_LOADING`), which also rules it out after an `await`.
- **Waiters resume after the settle has notified.** The reason the callback form was unsafe to call from the waiter loop was the loop's position: `settleNotify` called waiter callbacks in pass 2, before pass 3 marked the task's other subscribers stale, and the callers cleared `_waiters` only afterwards. The array await's internal re-scan was already exposed to this: an array over a task and a task depending on it resolved with a mixed snapshot (`[2, 10]` instead of `[2, 20]`). Pass 2 now only subscribes and stamps, pass 4 calls the callbacks, and every caller detaches `_waiters` before `settleNotify`, so a waiter added from a callback goes into a fresh list. `test/suspend-callback.test.js` › settle order covers both forms.

### post-await reads

`subscribe()` clears `FLAG_SINGLE` when it creates `_deps`, as `_read` does. A setup run that read one dependency leaves `FLAG_SINGLE` set, so a dependency added after an await went unchecked by `checkSingle`.

### Found, not fixed

A related gap that predates this change: when `c.suspend([...])` takes the fast path synchronously, during a setup run that already read two or more dependencies with `val()`, `subscribe()` appends the members to `_deps`, and the end of the setup run then overwrites `_deps` with its DSTACK slice. The node still sits in the members' subscriber lists, but `needsUpdate` never checks them, so it misses their changes. `clearDeps` doesn't remove it either, so a disposed node stays in their subscriber lists. Reproduction: a spawn doing `c.val(s1); c.val(s2); await c.suspend([t]);` with `t` settled does not re-run when `t` changes. The fix is to track members in the sync scope with version stamps, as `val()` does (the single-task fast path in `_suspendTask` does this, but also skips `val()`'s already-read and `stable()` checks). It's a different root cause from this spec, so I left it out.

### Tests

- 10 of 10 pass. "c.suspend(task, onResolve) calls onResolve as the public types declare" passes since the callback form was restored (below). `test/suspend-callback.test.js` covers it in full.
- One test expectation changed: the unlock test, explained above.
- No other group's tests changed state. The original suite is unchanged: 510 passing tests, 1624 `expect()` calls.

### Hot paths touched

- `EffectProto._update`: the `FLAG_LOCKED` test became `FLAG_LOCKED | FLAG_CHANNEL`. That is the same cost for effects without a channel (only the mask changed). Effects with a channel pay one inner test and one store per re-run.
- `subscribe()`: one flag clear, only on the branch that allocates `_deps`. `subscribe` serves async reads and settles, not the sync `val()` path.
- `c.suspend(promise)`: one `Promise.resolve()` call per suspend, which returns a native promise unchanged.
- `resetChannel`: one flag clear (channel nodes only, on re-run or a loading node's notification). It also calls `abortControllers` instead of `.abort()`. Note for merging: chain E also edits `resetChannel` and `_receive`.
- No new fields. `Channel._controller` may now hold an array (same field, typed in `src/types.js` and the `Channel` constructor).
