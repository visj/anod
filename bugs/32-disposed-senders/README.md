# 32: Disposed senders are accepted by `c.defer()` and the bound factories

Tests on `fix/23-hardening`. Fixed on `fix/24-slim-cold`. Minor.

## What breaks

`c.val()`, `c.rejected()` and `c.suspend()` throw ILLEGAL_READ for a disposed sender. Three other entry points accept one:

- `c.defer(s)` on a disposed sender returns its stale value (`null` for a disposed signal) instead of throwing.
- A deferred sender disposed while the task awaits is subscribed at settle. The disposed sender then holds a reference to the task (`s._sub1 === t`), which keeps it alive.
- `c.effect(s, fn)` (and the other bound factories) over a disposed signal runs `fn(null)`, a value the signal never held, and links the effect into the disposed signal.

```js
const s = signal(1);
s.dispose();
c.effect(s, (v) => console.log(v)); // logs null
s._sub1;                            // the effect
```

## Root cause

- `defer()` (`src/internal.js:1872`) has no FLAG_DISPOSED check, unlike `val()` (`:518`).
- `settleDeps` (`:4612`) calls `subscribe(node, sender)` for each deferred sender without checking FLAG_DISPOSED. `clearReceiver` later returns early for a disposed sender, so the link is never removed from that side.
- The bound factories call `connect(depOrFn, node, -1)` (`:3230`, `:3270`, `:3305`, `:3352`) without the check.

## What anod should do

- Since D8, only owned nodes (computes, tasks, effects) can be disposed, so the tests use a compute owned by another root. A disposed sender is rejected the same way at every read entry point: `c.defer()` and the bound factories throw ILLEGAL_READ, like `c.val()`.
- `settleDeps` doesn't link a deferred sender that was disposed during the await. Whether that counts as "changed" (re-run) or is just dropped is a small decision. Dropping it matches how a disposed dep is treated elsewhere.

## Tests (3)

- `test/explore/hardening.test.js` › 32 › c.defer() of a disposed sender throws like c.val()
- `test/explore/hardening.test.js` › 32 › a deferred sender disposed during the await is not linked to the task at settle
- `test/explore/hardening.test.js` › 32 › a bound effect over a disposed compute does not run with null

Run with `bun test --conditions=src test/explore/hardening.test.js`.

## Fix

- `defer()` falls back to `val()` for a disposed sender, as it does for a self-read, so it throws ILLEGAL_READ.
- `settleDeps` and `settleDefers` skip a deferred sender that was disposed in the meantime. It is dropped, not counted as changed: a disposed node never changes again (D4).
- Bound factories: the factory itself has no check, so creation (the mount benchmark) is unchanged. The check sits in the bound path of both `_update`s, which already tested the dep for `FLAG_ERROR`. That test is widened to `FLAG_ERROR | FLAG_DISPOSED`, one constant in dist. A new cold helper, `boundError(dep)`, returns the Defect the node fails with. It also drops the link the factory made into the disposed dep, so the dep holds no reference to the node.
  - A bound compute or task over a disposed dep starts errored with ILLEGAL_READ, without calling its fn.
  - A bound effect or spawn throws ILLEGAL_READ on its first run, as a `c.val()` of the dep would, to its owner's `recover` or the caller.
  - `OPT_DEFER` skips the first run of a bound effect, so `deferEffect` checks the dep and runs the effect at once when the dep is disposed, which fails it the same way.
  - The same check covers a dep disposed later (D4): the node keeps its value until something else re-runs it, and that run fails with ILLEGAL_READ.

This differs from "What anod should do" above in one way: a bound compute doesn't throw from the factory. It fails like any compute whose first run reads a disposed node, which keeps the check off the creation path.

Tests added: `hardening.test.js` › D4 (3) and the rewritten `dispose.test.js` › bound dep1 error/dispose guards (2).
