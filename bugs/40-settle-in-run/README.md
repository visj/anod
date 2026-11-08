# 40: A settle inside another node's run is lost on its readers

Tests and fix on `fix/settle-stamps`. Found while testing the fix for bug 39.

## What breaks

A callback suspend's `resolve()` or `reject()` can be called from inside another node's fn. The task settled right there and notified its readers while that node (`outer`) was still running:

- **`outer` reads the task.** The settle marks `outer` stale mid-run, and the end of the run clears the mark. `outer` keeps the loading value it read, and nothing re-runs it.
- **`outer` reads `C`, which reads the task.** The settle marks `C` stale, and `C` notifies the running `outer`, which clears the mark when its run ends. Nothing pulls `C`, so `C` stays FLAG_STALE, and every later notification skips it. `outer` is cut off from `C` for good.

```js
const outer = c.compute((cx) => {
    const v = cx.pending(t) ? -1 : cx.val(t);
    if (cx.val(k) > 0) resolveT(50);   // t settles inside this run
    return v;                          // outer stays -1
});
```

A `set()` made in the same place works, because a write made while the engine isn't idle is queued and drains after the run.

## What anod should do

A settle is a write to the task, so it behaves like one. Made while the engine is busy, it is queued. The task stays loading until the drain settles it, as a compute keeps its old value until it re-runs, so the rest of the run sees a graph that doesn't change under it. A settle made while the task's own fn runs is still held by the task and finishes when the fn returns (D9).

## Tests (5)

- `test/explore/hardening.test.js` › 40 › a task resolved in another node's run settles after it, like a write
- › a task rejected in another node's run errors after it
- › a subscriber of the task is not left stale
- › a settle in a drain does not leave its readers a tick behind (guard)
- › a settle from an effect's run does not leave its readers a tick behind (guard)

The two guards pass on master, which never settled at that point in the drain. They fail with the queue but without the `_ctime` fix below.

## Fix

- **Queue.** In `resolvePromise`, a resolve or reject made while `!IDLE`, outside the task's own run (no FLAG_CALLBACK), goes to the sender queue through `postSettle`. Its drain handler, `settleLater` or `errorLater`, checks `isCurrent` against the activation's time, as the immediate path does, so a task that re-ran or was written in the meantime drops it. The entry sets no FLAG_SCHEDULED, since that flag means queued writes on a resource. Promises, async functions and iterators settle in microtasks, while idle, and are unchanged.
- **`_ctime`.** `ComputeProto._settle` stamped a changed value `TIME + 1`, for the pass that its `flush()` starts. In a drain, that `flush()` returns at once and the readers re-run in the current pass, at `TIME`. The task then looked one tick newer than readers that had already seen the value, so a reader re-ran on the task's next reload and read it as pending, and a settle to the same value never notified it again. It now stamps `TIME` while `FLUSHING`.

Both are on the async settle path; the sync hot paths are unchanged.
