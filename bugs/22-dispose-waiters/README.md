# 22: Disposal reaches the nodes waiting on a task at the wrong time

Found on `fix/all`, while restoring `c.suspend(task, onResolve, onReject)` (bug 19), and fixed there. There is no separate branch.

## What breaks

When a task is disposed, its waiters are rejected with `Error("Awaited task was disposed")`. When a waiter is disposed while a settle or a disposal is delivering to it, it should be skipped. Neither works:

- **Creation order decides the outcome.** Owners dispose their children in reverse creation order. A spawn created before the task it awaits is disposed after it, so the task rejects a waiter the same teardown is about to dispose. A microtask later, the spawn's `catch` runs on a dead node. Created the other way round, nothing happens.
- **A task await resumes on a disposed node.** `c.suspend(promise)` guards the await; `c.suspend(task)` returned the raw Promise behind the task's waiter entry, with no guard.
- **The callback form runs user code mid-teardown.** `onReject` ran inside the owner's `dispose()`, with the waiter still alive. Without `onReject`, the error went through `recover`, including the handler of the root being disposed.
- **`dispose()` throws.** A waiter whose error disposes it inside the waiter loop left the loop reading its cleared channel: a `TypeError` out of `root.dispose()`, and the waiters after it were never told.
- **A waiter disposed by an earlier waiter during a settle still runs.** Disposal resets a node's flags, `FLAG_RELAY` included, so a callback waiter's `onResolve` was called as a plain function on the disposed node, or a missing `onReject` was called (`TypeError`). A promise or array waiter resumed on the disposed node, and the array re-scan subscribed it to the task again.

## What anod should do

- **A.** A disposed node never resumes, for every waiter kind. A locked node counts as alive until its activation finishes: that is the promise of `c.lock()`.
- **B.** Nothing a waiter's callback does can corrupt the walk over the waiter list.
- **C.** A task disposed in a teardown rejects its waiters after the teardown has finished. Waiters the teardown disposed are skipped, whatever the order; waiters outside it are told.
- **D (open).** Whether the disposal error is a `Defect` from the start, and of which type (FATAL or PANIC). Today an `await` gets a plain `Error`; `onReject` gets it wrapped as FATAL.

## Tests

`test/explore/dispose-waiters.test.js`. Every test has a step-by-step walkthrough of its timing. 15 pass; the decision D test prints what anod does and fails until it is decided.

## Fix

- **Skip disposed waiters (A).** `deliver()`, which every waiter delivery goes through, returns early for a node that is disposed and not locked. That covers settles (pass 4), array re-scans and disposal rejections.
- **Guard the task await at resume (A).** A waiter can be alive when its Promise is resolved and disposed before the await resumes, a microtask later. `guardAwait()` wraps the Promise of a task or array await in `.then(guard)`, as `c.suspend(promise)` always did: a node that is disposed (and not locked) or re-run by then gets `REGRET`, and the await never resumes. This costs a Promise and two closures per await of a loading task; awaits of settled tasks and the callback form are unchanged.
- **Detach, then deliver (B).** `rejectWaiters()` (was `resolveWaiters`) detaches the list and clears every waiter's link back to the task before anything is called, as `settleNotify` does since bug 19.
- **Defer the rejections (C).** Inside a flush or a teardown, `rejectWaiters()` queues the rejections in `REJECTS` instead of calling them. They are delivered once the teardown has finished:
  - in `flush()`, after the dispose queue has drained, and again on the next pass for rejections queued later (by an effect re-run disposing its children); `REJECT_COUNT` keeps the loop going;
  - outside a flush, by `teardown()`, which wraps the direct disposals: a deferred dispose replayed on settle or unlock, a node disposed by its own error, `failStart`. A teardown nested in another, or in the delivery itself, appends to the queue, and the outer walk delivers it.
  - Outside both (a node disposed by a path that is neither), they are delivered at once, still after the links are cleared.

## Hot paths touched

- `flush()`: one counter check after the dispose drain, and one in the loop condition.
- Disposal: unchanged for nodes without waiters. A quick mount/unmount timing (1,000 roots of 5 nodes, created and disposed) showed no difference.
- Settling with waiters: one flag check per waiter.
- Awaiting a loading task: the guard above.
- **Memory:** no new fields. The module gains `REJECTS`, `REJECT_COUNT` and `TEARING`.
