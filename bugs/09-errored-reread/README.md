# 09: Reading the same errored compute twice in one run

Branch `fix/09-errored-reread`, based on `fix/08-pending-errors`. Chain C (errors).

## What breaks

The first `cx.val(bad)` in a run throws, as it should. A second `cx.val(bad)` in the same run returns the `{ error, type }` object as if it were a normal value.

```js
c.effect((cx) => {
    try { cx.val(bad); } catch {}     // throws
    const v = cx.val(bad);             // returns the error object
});
```

## Root cause

- The stamp fast path at the top of `val()` (`sender._stamp === version`) returns `sender._value` before the `FLAG_ERROR` check.

## What anod should do

- `val()` throws for an errored sender on every read, including repeated reads in one run.

## Tests (1)

- `test/explore/graph.test.js` › nested creation and disposed deps › reading the same errored compute twice in one run throws both times

Run with `bun test --conditions=src test/explore/graph.test.js`.

## Fix

- **`val()`'s "already read this run" fast path (`sender._stamp === version`) now checks `FLAG_ERROR` before returning**, and throws `sender._value` as the slow path does.
- Every other read in `val()` already threw. So did `_readAsync` (after an await), `defer()`, `_suspendTask` and `rejected()`, which never takes this shortcut. This was the only path that leaked the error object as a value.

Why the check has to be on this path:

- A repeated read is recognized only by `_stamp === STAMP`.
- An errored dependency must keep exactly that stamp: `patchDeps` and `REUSED` count it as tracked by it, so the receiver re-runs when the dependency heals.
- So there is no stamp value that would route an errored sender to the slow path without breaking tracking or creating a duplicate subscription.

The error check is therefore unavoidable on the stamp-hit path. It is the cheapest possible form: one flag test on `sender._flag`. That field was already loaded by the disposed check at the top of `val()`, with no store in between, so the engine can reuse the load.

Behavior decisions: none. Every read of an errored sender throws the same `{ error, type }` object (the same identity, so bug 07's classification passes it on unchanged).

Test expectations changed: none.

Other bugs' tests turned green: none.

### Hot paths touched

**`val()`, the stamp fast path.** The repeated-read path gains one `sender._flag & FLAG_ERROR` test and a never-taken branch before `return sender._value`. The first-read paths are unchanged. This is the only hot-path cost in chain C, so please include repeated reads of the same sender within one run in the benchmark pass.

If it shows up, there is an alternative with the same per-read cost but a smaller `val()`. It makes the stamp check skip the refresh/track block (`if (sender._stamp !== version) { ... }`) and lets every path fall through to the single trailing `FLAG_ERROR` check, merging the stable path's duplicate check. I kept the minimal change rather than restructure `val()`.
