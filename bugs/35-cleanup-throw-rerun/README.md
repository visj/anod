# 35: A throwing cleanup on re-run leaves the previous run's children alive

Tests on `fix/23-hardening`. Fixed on `fix/24-slim-cold`, together with D2. Found while looking into design question D2.

## What breaks

When an owner effect re-runs and one of its cleanups throws, the children it created in the previous run are not disposed. The parent recovers (or is torn down later), but in the meantime the old children stay alive and keep reacting, after the resources they used were released.

```js
c.effect((cx) => {
  cx.recover(() => true);
  const v = cx.val(s);
  cx.cleanup(() => { if (v === 0) throw new Error("cleanup"); });
  cx.effect((cx2) => { cx2.val(other); log.push("child" + v); });
});
s.set(1);      // the cleanup throws; the child of run 0 is not disposed
other.set(1);  // logs "child0"
```

## Root cause

`EffectProto._update` (`src/internal.js:2936`) calls `clearCleanup(this)` and then `clearOwned(this)` with no `try`/`finally` between them. `clearCleanup` rethrows once all cleanups have run, so `clearOwned` is skipped, and so is resetting `_recover` and `clearFinalize`.

`EffectProto._dispose` (`:3157`) and `RootProto._dispose` (`:2104`) already nest the two in `try`/`finally` ("A throwing cleanup, here or in a child, still finishes the disposal"). Only the re-run path lacks it.

## What anod should do

The teardown of a run always completes: every cleanup runs and every owned child is disposed, whichever of them throws. After that, the error counts as an error of the node, as fix 06 decided. This holds whatever order D2 settles on.

## Tests (1)

- `test/explore/hardening.test.js` › 35 › the previous run's child is disposed when the parent's cleanup throws

Run with `bun test --conditions=src test/explore/hardening.test.js`.

## Notes for the fix

Mirror `_dispose`: nest the two calls in `try`/`finally` in `EffectProto._update`. This is outside the hot path (only owners with cleanups reach it), and a `try`/`finally` costs nothing when nothing throws. If D2 changes the order, change it in all three places together.

## Fix

Fixed together with D2 (children first), in all three places:

- **`EffectProto._update`:** the head nests the null tests. An owner with only children calls `clearOwned`, and one with only cleanups calls `clearCleanup`, as before. Only an owner with both calls the new `clearRun`, which is `try { clearOwned } finally { clearCleanup }`. If both throw, the cleanup's error wins, as with nested `finally` blocks.
- **`EffectProto._dispose` and `RootProto._dispose`:** the two nested `try`/`finally` blocks swap their order, so the children go first there too. The root's field reset moved into an inner `finally`, so a throwing cleanup no longer skips it.
- **Where the error goes:** `clearOwned` no longer resets the owner's recover handler; its callers already did. So an error in the teardown of a run, whether a child's cleanup threw or the node's own, reaches the recover handler of the run being torn down, then the owners. Before, a child's error skipped that handler, because `clearOwned` had already reset it.

`clearOwned` and `clearCleanup` keep finishing their own lists when one entry throws.

Tests added: the `hardening.test.js` › D2 block (5 tests, all failing on master): the order on re-run, on effect dispose and on root dispose, a child's throw not skipping the parent's cleanup, and a child's teardown error reaching the previous run's handler.
