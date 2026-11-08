# 27: A callback that settles synchronously ends a spawn's activation mid-body

Tests on `fix/23-hardening`. Fixed on `fix/24-slim-cold`.

## What breaks

When a spawn calls `cx.suspend((resolve, reject) => ...)` and the callback settles synchronously, the spawn's activation is finished while its body is still running:

- **resolve:** the finalizers run inside the `suspend` call, before the rest of the body. The README says finalize "runs at the end of _this_ run".
- **reject:** the spawn is torn down from inside its own fn. The deps of a setup run are still in DSTACK, so `clearDeps` misses them, and the end of the run then attaches them to the disposed node. The disposed spawn stays in its deps' subscriber lists and keeps them alive. The error is swallowed (see design question D7).
- **with `c.defer()`:** `settleDeps` runs in the middle of the body and subscribes the node while its sync run is still tracking deps.

```js
c.spawn((cx) => {
  cx.finalize(() => order.push("finalize"));
  cx.suspend((res) => res(1));
  order.push("body");
});
order; // ["finalize", "body"], expected ["body", "finalize"]
```

## Root cause

`ComputeProto._settle` checks FLAG_CALLBACK (`src/internal.js:2530`): a settle from inside the running fn only writes the value, and `_update` finishes the settle after the fn returns. `EffectProto._settle` (`:3085`) has no such guard. It clears FLAG_LOADING, runs `clearFinalize`, `settleDeps` or `teardown` right away, while `_update` is still inside `this._fn(...)`.

Bug 17 fixed the compute side and left the spawn side to the maintainer ("a spawn whose callback settles synchronously still runs `EffectProto._settle` mid-run"). No test covered it.

## What anod should do

A synchronous settle from inside the fn is recorded, and the activation is completed by `_update` once the fn has returned and its deps are tracked, as for computes:

- finalizers run after the body;
- a reject is handled like an error at the end of the run;
- deferred deps are settled after the run.

## Tests (2)

- `test/explore/hardening.test.js` › 27 › finalize runs after the body when the callback resolves synchronously
- `test/explore/hardening.test.js` › 27 › a spawn disposed by a synchronous reject does not stay subscribed to its deps

Run with `bun test --conditions=src test/explore/hardening.test.js`.

## Behavior decisions

What a synchronous reject should do is open (design question D7): treat it like a throw in the body, which is rethrown to the creator or the flush, or like an async error, which goes through `recover` and then disposes. The second test doesn't depend on that choice: it catches anything thrown and only checks that no links are left.

## Fix

A callback that settles while the spawn's fn is still running is recorded, and `_update` finishes the activation once the fn has returned, as bug 17 did for tasks. A synchronous reject throws (D7).

- `EffectProto._settle`: with `FLAG_CALLBACK` set (the fn that called `c.suspend(cb)` is still running) it only clears `FLAG_LOADING` and returns.
- `EffectProto._error`: with `FLAG_CALLBACK` set it clears `FLAG_LOADING` and throws the raw error. The catch sites (`flushEffects`, `failStart`) wrap it with `defect()` and treat it like a throw in the body: `recover`, dispose, and rethrow to the creator or the flush.
- `EffectProto._update`, async tail: if `FLAG_CALLBACK` is still set but loading is not, the callback settled during the run. The tail clears the bit and calls `_settle()`, which runs the finalizers, `settleDeps`, the lock release and the replay, now after the body and with the run's deps tracked. As on every callback-suspend path, the fn's return value is ignored.
- `flushEffects`' catch and `failStart` clear `FLAG_SUSPEND | FLAG_CALLBACK`: a throw ends the activation, so a callback that fires later is never mistaken for a settle from inside the fn. In `flushEffects` the bits join an existing mask.
- `isCurrent` (the shared staleness guard): a settle while `FLAG_CALLBACK` is set belongs to the running activation. An effect clears the `FLAG_STALE` that queued its re-run only after its fn returns, so before, a synchronous resolve in a re-run was dropped as stale and the spawn stayed loading until the next change. Found while writing the D7 tests. The check comes after `FLAG_DISPOSED`, so a node disposed by its own body still drops the settle.

**Reworked by D9.** A delivery while the fn runs is now held on the `HELD` stack and applied by `_update` once the fn returns, instead of being recorded in place by `_settle`. The tests above still pass. A synchronous reject now lets the rest of the body run before the run fails (see D7's revision).

### Behavior decisions

- **A reject caught inside the setup fn:** `reject` throws, so a setup fn that catches the throw itself has handled the error. The activation then finishes as settled. *No longer true since D9: `reject` doesn't throw, and the run fails once the fn returns.*

### Tests added

- 27 › a synchronous reject reaches the creator, as a throw in the body does (D7)
- 27 › a synchronous reject in a re-run goes to recover (D7)
- 27 › a callback that resolves synchronously in a re-run finishes that run
