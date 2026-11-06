# 17: Async nodes that hang or lose their result

Branch `fix/17-lost-results`, based on `fix/16-unchanged-settle`. Chain E (async settling).

## What breaks

- A task whose async generator returns without yielding stays loading forever.
- A task whose `c.suspend(cb)` callback calls `resolve(42)` synchronously ends up with `undefined`; `reject(err)` synchronously sets the error flag but loses the error object.

```js
const t = c.task(async function* () { return 5; });   // loading forever
const u = c.task((cx) => { cx.suspend((res) => res(42)); }); // u.get() is undefined
```

## Root cause

- `resolveIterator` returns on `result.done` without settling the node.
- The ASYNC_SYNC tail of `ComputeProto._update` writes the function's return value (`undefined`) over the value the callback already settled.

## What anod should do

- A finished iterator settles the node: with the returned value if it has one, otherwise keeping the last yielded value (or the seed), and clears loading.
- A callback that settles synchronously wins over the function's `undefined` return; the node ends with the resolved value or the `{ error, type }` object.

## Tests (3)

- `test/explore/async.test.js` › async iterators › task whose async generator returns without yielding is not stuck loading
- `test/explore/async.test.js` › callback suspend › task: resolve() called synchronously in the setup fn keeps the resolved value
- `test/explore/async.test.js` › callback suspend › task: reject() called synchronously in the setup fn keeps the error object

Run with `bun test --conditions=src test/explore/async.test.js`.

## Fix

A finished iterator now always settles, and a callback that settles while the task's fn is still running only writes the value. The task's own `_update` finishes the settle once the fn has returned.

- `resolveIterator`: on `result.done` it settles with the return value if there is one. With no return value it settles only if the node is still loading (it never yielded), to its current value, the seed or the previous value. If it did yield, the last yield already settled the node, so the value and loading state are left alone. This also covers spawns and resources, which share `resolveIterator`. Both had the same hang.
- `FLAG_CALLBACK` (new flag bit, `1 << 27`): `suspend()`'s callback branch sets it together with `FLAG_SUSPEND | FLAG_LOADING`. It means "the fn that called `c.suspend(cb)` is still running". `ComputeProto._update` clears it once the fn has returned, on every exit of the async tail and in the final flag write.
- `ComputeProto._settle`: with `FLAG_CALLBACK` set, it clears loading/init as before. If the value changed, it writes it with `_ctime = this._time`, the running activation's time, as a sync compute's tail does. Then it returns. Before, it ran the full settle mid-run: notify, `flush()`, `settleDeps` and the lock re-run check, all from inside the task's own fn. The tail then overwrote the value with the fn's `undefined` return.
- `ComputeProto._update`, async tail: if `FLAG_CALLBACK` is still set but loading is not, the callback settled during the run. The fn's return value is ignored, as on every callback-suspend path. The tail finishes the settle: it subscribes deferred deps through `settleDefers` (from bug 16, scan-based, safe to call mid-pull), then resolves waiters through `settleNotify(..., quiet)` and returns. This is the same order as the sync tail added in bug 16.
- `ComputeProto._update`, both catch blocks: a throw clears `FLAG_CALLBACK` along with setting `FLAG_ERROR`. A fn that resolves and then throws therefore ends with the error, through the normal sync-result path.

### Behavior decisions

- **A callback that settles synchronously wins over the fn's return value.** The spec only covers the `undefined` return, but `_update` already ignores the return value whenever a callback suspend is still loading. Letting the return value win only when the callback happened to be synchronous would make the result depend on timing.
- **A throw after a synchronous settle wins.** The fn did not complete, and with a sync compute a throw also replaces whatever the fn did before it.
- **No notify or flush for a synchronous settle.** It is part of the running activation: the value change is stamped with that run's `_time` and seen by pull (`_ctime > _time`), as with a sync compute. Subscribers were already marked PENDING/STALE by whatever caused the run. That is also why waiters are resolved with `quiet` (pass 3 of `settleNotify` is skipped). There is no lock / stale re-run check either. A dep that the fn itself changes during the run does not re-run the task, because `_update` clears the `FLAG_STALE` its own run caused. That matches a sync compute and the sync tail in bug 16.
- **An iterator that returns nothing after yielding keeps the last yield.** `result.value === undefined` counts as "no return value", the same way the resource sync path treats `undefined` as "no value".
- **Effects (spawns) are unchanged.** `suspend()` sets `FLAG_CALLBACK` on them too, but only the Compute code reads it: an effect has no value for its fn's return to overwrite, so the spec's case does not apply. `EffectProto._update` clears the bit with the same constant mask. **For the maintainer:** a spawn whose callback settles synchronously still runs `EffectProto._settle` mid-run. Its finalizers run before the fn returns, `settleDeps` restamps deps while the spawn's own run is tracking them (only with `c.defer()`), and a sync `reject()` disposes or recovers the spawn from inside its fn. This is the same on `fix/base`, and no test covers it. The fix would mirror this one (defer to the tail when `FLAG_CALLBACK` is set), with the error/recover path moved into `EffectProto._update`.

### Side effects

- Two bug 02 tests now pass, because a synchronous callback settle no longer calls `flush()` from inside the running task:
	- `test/explore/async.test.js` › callback suspend › a task resolving synchronously inside batch() does not end the batch early
	- `test/explore/async.test.js` › callback suspend › a task resolving synchronously while created inside an effect re-run settles cleanly
- Dynamic deps of a callback task that resolves synchronously on re-run are no longer corrupted. Before, the mid-run settle restamped the task's deps (`settleDeps`) and could re-run it re-entrantly, so `patchDeps` dropped live deps and duplicated others. In a probe, after `a.set(2)` the task `c.val(a) + c.val(b); c.suspend(res => res(v)); c.val(cc)` had lost `a` and `b` and subscribed `cc` twice. Its value stayed `undefined` and `b.set()` no longer re-ran it. With the fix the deps stay `a, b, cc` and each re-run updates the value.
- Spawn and resource async generators that finish without yielding no longer stay loading. No test covers these.
- No other test changed state.

### Test expectations changed

None.

### Hot paths touched

- `ComputeProto._update`: the async tail gains one `FLAG_CALLBACK` test for a task whose fn did not leave a callback suspend loading. Everything else is behind it. The callback-loading exit gains one flag write. The final flag write for all computes uses a wider constant mask (`~(FLAG_INIT | FLAG_CALLBACK)`), which costs nothing. The catch blocks do one extra `&` on the error path only.
- `EffectProto._update`: only the constant masks change.
- `ComputeProto._settle` (once per async settle) gains one flag test. `resolveIterator`'s done branch runs once per iterator.
- `suspend()`'s callback branch sets one more bit.
- No fields added. **One new flag bit:** `FLAG_CALLBACK = 1 << 27`, exported from `src/internal.js` and declared in `types/internal.d.ts`. Other chains adding flag bits may collide on bit 27 when merging.

### Not fixed (found while testing)

- A task re-run that returns a sync value while a spawn awaits the previous, still loading activation leaves the spawn hanging. The plain `ASYNC_SYNC` tail writes the value but never resolves `chan._waiters`. Example: `r.task(s, (v, c) => v === 1 ? c.suspend(promise) : v * 10)` with a spawn awaiting it, then `s.set(2)`. The spawn never resumes. This is the same on `fix/base`. Fixing it means checking `FLAG_WAITER` after the write at the end of `ComputeProto._update` (or duplicating the write inside the async branch), a hot-path change left for the maintainer.
