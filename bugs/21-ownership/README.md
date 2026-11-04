# 21: Ownership leaks

Branch `fix/21-ownership`, based on `fix/base`. Chain G (ownership).

## What breaks

- A root whose callback throws leaves the effects it already created running, and the caller never gets a handle to dispose them.
- Disposed children pile up in a long-lived root's `_owned` array (100 created-and-disposed effects leave 100 entries), so it grows without bound.
- A cleanup that writes a signal during root disposal re-runs a sibling that is half-way through being disposed.

```js
root((r) => { r.effect((cx) => log(cx.val(s))); throw new Error("setup"); });
s.set(1); // the orphaned effect still logs
```

## Root cause

- `startRoot` has only a `finally`; nothing disposes the root when its callback throws.
- Nothing unlinks a disposed child from its owner; `addOwned` only appends and only `clearOwned` empties the array.
- An idle `dispose()` calls `_dispose` directly without leaving IDLE, so a write in a cleanup flushes immediately while `clearOwned` is mid-way.

## What anod should do

- A root whose callback throws is disposed (its effects and cleanups too) before the error is rethrown.
- A disposed child does not keep a slot in its owner forever; the owner's list is compacted (tombstone-style is fine) so its size tracks live children.
- Disposal is one transaction: writes from cleanups are queued and flushed after the whole subtree is disposed, so no node being disposed re-runs.

## Tests (3)

- `test/explore/ownership.test.js` › disposal timing › a root callback that throws does not leave its effects running
- `test/explore/ownership.test.js` › ownership › disposed children are not retained by a long-lived root
- `test/explore/ownership.test.js` › disposal timing › a cleanup write during root disposal does not re-run a sibling being disposed

Run with `bun test --conditions=src test/explore/ownership.test.js`.

## Fix

_Not fixed yet. The fix branch fills this in._
