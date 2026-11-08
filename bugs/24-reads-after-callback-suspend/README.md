# 24: Reads after a loading callback suspend corrupt dependency links

Tests on `fix/23-hardening`. Fixed on `fix/24-slim-cold` by D9.

## What breaks

A node that calls a callback form of `c.suspend` and then reads another sender in the same synchronous run gets broken dependency links. The callback forms are `c.suspend(fn)`, and `c.suspend(task, onResolve)` on a task that is still loading. The damage depends on the run:

- **Setup run:** the sender read after the suspend keeps a subscriber pair whose slot points at the wrong dep. A later swap-remove in that sender repoints another node's slot. Disposing the node then unlinks an **unrelated** receiver, which stays deaf to that dep for good.
- **Setup run with one earlier dep:** the run ends with FLAG_SINGLE set while `_deps` is non-empty, so `checkSingle` only checks `_dep1`. A task that read a compute after the suspend never re-runs when that compute changes.
- **Dynamic re-run:** each re-run adds another subscriber pair, so the lists keep growing.
- **Disposal:** a sender the node read after the suspend keeps the disposed node in its subscriber list.

```js
const t = c.task((cx) => cx.suspend(new Promise(() => {})));
c.effect((cx) => { cx.val(a2); log.push("r1"); });
c.effect((cx) => { cx.val(a2); log.push("r2"); });
c.effect((cx) => cx.val(b));
const o2 = c.effect((cx) => cx.val(b));
const e = c.spawn((cx) => {
  cx.val(a); cx.val(a2);
  cx.suspend(t, () => {});
  cx.val(b);                 // goes through subscribe() mid-run
});
o2.dispose();
e.dispose();
a2.set(1);                   // only r1 runs; r2 was unlinked from a2
```

All three callback forms reproduce it: a spawn with `cx.suspend(t, () => {})`, a sync effect with `cx.suspend(() => {})` (ComputeContext declares this overload), and a task with `cx.suspend(() => {})` followed by `cx.pending(b)`.

## Root cause

The callback forms set FLAG_LOADING in the middle of the synchronous run (`src/internal.js:1408`, `:1534`, `:1636`). From then on, `val()` (`:521`) and `rejected()` (`:1950`, which `pending()` uses too) take the async path `_readAsync` (`:878`). That path calls `subscribe()` (`:3410`), which links immediately. `subscribe()` is only correct outside the node's own run:

- **Setup run:** deps live in DSTACK until the end of the run, and then `this._deps = stack.slice(...)` (`:2754` for computes, `:3010` for effects) overwrites the `_deps` array that `subscribe()` created. The sender keeps a pair whose depslot indexes into the lost array. Later, `clearReceiver` (`:3478`) writes through that stale slot into whatever now sits at that index.
- **Setup run with no DSTACK entries:** `subscribe()` creates `_deps` and clears FLAG_SINGLE. Then the end of the run sets FLAG_SINGLE again because `_dep1 !== null` (`:2765`, `:3021`).
- **Dynamic re-run:** the version stamp of the sender is not set, so the sweep doesn't see the dep as reused. The next run adds a duplicate, and `patchDeps` never removes the extra pair.

Bug 19 found the FLAG_SINGLE half of this for reads *after an await* and fixed it there ("Dependencies read after an await are tracked like any other"). The synchronous tail of a callback suspend was not covered.

## What anod should do

While a node's synchronous run is still on the stack, its reads are tracked by the sync machinery (stamps, DSTACK, sweep and patch), whether or not the node is already loading. `_readAsync` is only for reads made after the run returned (continuations, callbacks resolved later).

## Tests (6)

- `test/explore/hardening.test.js` › 24 › reading after c.suspend(task, onResolve) does not deafen an unrelated effect
- `test/explore/hardening.test.js` › 24 › reading after c.suspend(setupFn) in a sync effect does not deafen an unrelated effect
- `test/explore/hardening.test.js` › 24 › c.pending() after c.suspend(setupFn) in a task does not deafen an unrelated effect
- `test/explore/hardening.test.js` › 24 › a task re-runs when a compute it read after a loading callback suspend changes
- `test/explore/hardening.test.js` › 24 › a disposed spawn is not left in the subscribers of a sender it read after a loading suspend
- `test/explore/hardening.test.js` › 24 › re-runs do not pile up subscriptions to a sender read after a loading suspend

Run with `bun test --conditions=src test/explore/hardening.test.js`.

## Notes for the fix

FLAG_CALLBACK is already set exactly while the fn that called the callback suspend is still running, and `_update` clears it at the end of the run (`:2846`, `:3047`, `:3071`). Routing to `_readAsync` only when `(flag & (FLAG_LOADING | FLAG_CALLBACK)) === FLAG_LOADING` in `val()` and `rejected()` sends these reads down the sync path. That is one extra bit in a mask the hot path already tests. Check that a callback which settles synchronously (FLAG_LOADING cleared again mid-run) still works, and that the async-await path of bug 19 is unaffected.

## Fix

Fixed by D9 (`bugs/design/README.md`), which settles when a callback suspend's outcome takes effect: never before the node's fn returns. With that rule, nothing settles mid-run, so FLAG_LOADING no longer has to be set at the `c.suspend()` call:

- The callback forms set `FLAG_SUSPEND | FLAG_CALLBACK` while the fn runs, and the async tail of `_update` sets FLAG_LOADING when the fn returns, as `startAsync` does for a returned promise. While the fn runs, the node is not loading, so `val()`, `rejected()`, `track()` and `_suspendTask`'s settled path all take the sync path (stamps, DSTACK, sweep and patch). That is the case for reads before and after the suspend alike.
- `val()` is unchanged. The note above proposed widening its mask with FLAG_CALLBACK, which D9 made unnecessary.
- A sync effect (`c.effect` calling `c.suspend(fn)`) reaches the async tail through `flag & (FLAG_ASYNC | FLAG_CALLBACK | FLAG_DISPOSED)`. `EffectProto._update` now keeps its post-run flags in `flag` (`flag = this._flag &= ...`).

All 6 tests pass, in src and dist.
