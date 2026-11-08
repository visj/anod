# 28: A weak compute's throwing cleanup corrupts its reader

Tests on `fix/23-hardening`. Fixed on `fix/24-slim-cold`.

## What breaks

When a reader stops reading an `OPT_WEAK` compute, the compute loses its last subscriber and is released. If one of its cleanups throws, the error escapes from inside the reader's dependency reconciliation:

- **The reader is blamed:** the error is caught as the reader's error. Without `recover` the reader is disposed. It did nothing wrong.
- **With a recovering reader:** the reader survives, but its deps are half patched. It no longer runs for its new deps, and it still runs for the dep it dropped.
- **With a compute reader:** `patchDeps` sits outside the try in `ComputeProto._update`. The error escapes `_update` and leaves STAMP, VCOUNT and REUSED unrestored. It then reaches the flush's pre-run check (bug 33).

```js
const w = c.compute((cx) => {
  cx.cleanup(() => { throw new Error("cleanup"); });
  return cx.val(src);
}, undefined, OPT_WEAK);
c.effect((cx) => {
  cx.recover(() => true);
  if (cx.val(mode)) { cx.val(w); cx.val(x); } else { cx.val(y); cx.val(z); }
});
mode.set(false);
y.set(1); // effect does not run, expected it to
x.set(1); // effect runs, expected it not to
```

## Root cause

`clearReceiver` (`src/internal.js:3478`) calls `send._drop()` (`:3505`) when a weak sender loses its last subscriber. `ComputeProto._drop` (`:985`) runs `clearCleanup` inline. `clearReceiver` is called from `patchDeps` (`:2771`) in the middle of the reconciliation, and from `clearDeps`. A throw there unwinds through `patchDeps` with some deps connected and some not.

Bug 06's README listed this under "Not covered": "`ComputeProto._drop` (a weak compute releasing its value) runs cleanups from inside `clearReceiver`, in the middle of `patchDeps`/`clearDeps`. A throw there still escapes mid-reconciliation."

## What anod should do

Fix 06's contract is that "a throwing cleanup counts as an error of its node", and that an error never leaves the engine inconsistent. Releasing a weak compute must not abort the reader's reconciliation, and the cleanup error belongs to the weak compute, not to the reader. Once the reader's deps are consistent, the error can surface the way other teardown errors do (for example, rethrown at the end of the flush).

## Tests (2)

- `test/explore/hardening.test.js` › 28 › a reader that drops a weak compute whose cleanup throws keeps tracking its new deps
- `test/explore/hardening.test.js` › 28 › the reader is not disposed for the weak compute's cleanup error

Run with `bun test --conditions=src test/explore/hardening.test.js`.

## Notes for the fix

- Options: catch in `_drop` and record the error for the flush to rethrow, or queue weak releases and run them after `patchDeps` or `clearDeps` returns. The second also keeps user code (cleanups) out of the middle of link surgery.
- The tests accept the error surfacing to the writer: they wrap `mode.set(false)` in try/catch.

## Fix

The second option: a weak release no longer runs user code in the middle of a reader's reconciliation.

- `ComputeProto._drop` still marks the compute STALE and releases its value at once. In a transaction, it queues its cleanups with `schedule(node, null, releaseWeak)` instead of running them. The flush drains them in its writes phase, once the reader's `patchDeps` or `clearDeps` has finished, still before the write returns.
- `releaseWeak` runs the cleanups unless the compute was read again in the meantime. A re-run already ran them at its start, and the cleanups it holds then belong to the new run. It checks that the compute is still STALE and has no subscribers.
- A throwing cleanup is the weak compute's error. It is wrapped as a Defect, and the flush rethrows it once it has drained, as it does for a disposal's cleanup error. The reader's deps are consistent, it is neither blamed nor disposed, and a compute reader's `_update` no longer unwinds with its globals unrestored.
- At idle, no reader is mid-reconciliation (node fns never run idle since bug 34), so `_drop` still runs the cleanups inline. That covers a weak task released when it settles, and a teardown outside a flush.

Nothing on the hot path changed: `clearReceiver` and `patchDeps` are untouched, and the change is inside `_drop`, which only weak computes reach.

Tests added: `hardening.test.js` › 28 › "a compute that drops a weak compute whose cleanup throws keeps tracking its new deps" (fails on master), and two guards in `weak.test.js`: the cleanups still run before the write returns, and a weak compute picked up again in the same flush keeps its new run's cleanups.
