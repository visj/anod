# 39: A settle inside another node's run overwrites its dependency stamps

Tests and fix on `fix/settle-stamps`. Found while asking why `settleDefers` scanned with `indexOf` instead of using stamps like `settleDeps`.

## What breaks

A callback suspend's `resolve()` can be called after the run that made it, from inside another node's fn: for example, an effect whose transport answers synchronously. The task settles right there, while the other node (`outer`) is still tracking. The settle stamps senders that `outer` may share, and `outer` then loses or duplicates links:

- **Duplicate link.** `outer` resolves the task and then reads `s`, which is also a dep of the task. The read finds a stamp that isn't `outer`'s and subscribes `s` again.
- **Lost dep.** `outer` reads `s`, then resolves the task, then reads a new dep. The run ends in `patchDeps`, which drops every dep whose stamp isn't the run's own, so `s` is dropped and later writes to `s` never reach `outer`.

```js
const t = c.task((cx) => {
    const v = cx.val(s) + cx.val(u);
    cx.suspend((resolve) => { resolveT = () => resolve(v * 10); });
});
c.effect((cx) => {
    const sv = cx.val(s);
    if (cx.val(k) > 0) resolveT();   // t settles inside this run
    cx.val(w);                       // new dep: patchDeps drops s
});
```

It happens for computes and effects, and through each function a settle stamps with:

- `settleDeps` stamps the task's deps to deduplicate them;
- `settleNotify` stamps the task's sync subscribers (pass 1) and its waiters (pass 2), so a dep of `outer` that subscribes to the task is overwritten too.

A delivery made during the task's own run is safe: `_settle` holds it under FLAG_CALLBACK, and `_update` settles after the fn returns.

## Root cause

`sender._stamp` belongs to the node that is tracking. A tracking run saves the stamps it replaces above FENCE in VSTACK, and puts them back when it ends, so a nested run doesn't disturb the outer one (`_read`, `sweepDeps`). The settle paths took a fresh SEED and wrote stamps without saving them.

## What anod should do

A settle leaves the stamps of every running node as it found them.

## Tests (5)

- `test/explore/hardening.test.js` › 39 › a task resolved before the outer node reads a shared dep is not subscribed twice
- › a compute keeps a dep it read before resolving a task
- › an effect keeps a dep it read before resolving a task
- › a compute keeps a subscriber of the task it resolves
- › settleDefers inside another node's run keeps that node's deps (guard; passes on master)

Run with `bun test --conditions=src test/explore/hardening.test.js`.

## Fix

Two cold-path helpers:

- `stampSaved(sender, stamp)` saves the old stamp to VSTACK when it's above FENCE, as `sweepDeps` does, then writes the new one.
- `restoreStamps(base)` puts back everything saved since `base`, back to front, so a sender saved twice (a sync subscriber that is also a waiter) ends with its first stamp.

`settleDeps` and `settleNotify` stamp through `stampSaved` and call `restoreStamps` before returning (`settleNotify` before pass 4 resumes the waiters). `settleDefers` now deduplicates like `settleDeps`, with `sweepDeps` and stamps instead of an `indexOf` scan per deferred sender, and `hasDep` is removed. The hot paths are unchanged.

## Related

Bug 40 queues a settle made while the engine is busy, as `set()` queues a write, so after it these settle functions no longer run inside another node's run through a resolve. `settleDefers` still does, when a task settles in its own run while another node pulls it. The saves cost nothing when no stamp is above FENCE, and they keep the settle paths safe whichever way they are reached.

## Later: marks instead of stamps

On `feat/action`, the three settle functions stopped using stamps altogether. `settleNotify`, `settleDeps` and `settleDefers` now mark the nodes they dedupe with FLAG_VISIT and clear the marks before they return, as `checkCycle` and `awaits` already did; nothing between the mark and the clear runs user code. A settle then never touches a stamp a running node tracks with, so `stampSaved` and `restoreStamps` are removed, and a receiver no longer needs a `_stamp` field: Effect drops it, and Action never had one. `test/visit.test.js` drives each marking path and checks that no node keeps the mark.
