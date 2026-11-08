# 38: A bound effect with `OPT_SETUP` that reads its own dep is linked twice

Tests on `fix/23-hardening`. Fixed on `fix/24-slim-cold`. Minor. Found during the simplification scan.

## What breaks

A bound effect created with `OPT_SETUP` whose fn also calls `c.val(dep)` on its bound dep ends up with two links to that dep: one in `_dep1`, one in `_deps`. A bound compute in the same situation keeps one. The duplicate costs memory and an extra subscriber entry to skip on every notify. Notification itself stays correct, because the second entry finds the effect already STALE.

```js
const e = c.effect(d, (v, cx) => { cx.val(d); }, OPT_SETUP);
// d's subscribers list e twice
```

## Root cause

Before calling the fn, `ComputeProto._update` stamps the bound dep with the run's version (`src/internal.js:2740`), so a `c.val(dep)` in the fn sees it as already read. The bound call in `EffectProto._update` doesn't stamp it. So the read records the dep again, and the setup run links it a second time.

## What anod should do

A bound dep is read once per run, whether or not the fn also reads it with `c.val()`, as for computes.

## Tests (1)

- `test/explore/hardening.test.js` › 38 › the bound dep is linked once

Run with `bun test --conditions=src test/explore/hardening.test.js`.

## Notes for the fix

The simplification report proposes one shared bound/unbound call site in each `_update` body. That shared site would stamp the dep in both bodies and fix this as a side effect.

## Fix

`EffectProto._update` stamps the bound dep before the call in its setup/dynamic branch, as `ComputeProto._update` does. A bound effect only takes that branch with `OPT_SETUP`, or when `stable()` was called while it was queued. The stable path that bound effects normally take is unchanged.
