# 12: Queued resource writes revert earlier writes

Branch `fix/12-queued-resource-writes`, based on `fix/10-contextual-flags`. Chain B (contextual and resource writes).
Next in the chain: `fix/13-idle-context-set`.

## What breaks

The single-argument resource form, `r.set(asyncFn)` / `r.post(asyncFn)`, captures the resource's value at the moment it is queued and writes that snapshot back when it drains. A write queued before it is reverted, and the callback sees the old value as `current`.

```js
const r = resource(0);
batch(() => { r.set(5); r.set((rc, cur) => fetchNext(cur)); });
r.get(); // 0, and the callback saw cur = 0
```

## Root cause

- `set` / `SignalProto.post` schedule `{ _value: this._value, _fn: value }` with `asyncAssign`, and `asyncAssign` assigns `payload._value` before running the callback.

## What anod should do

- A queued `set(asyncFn)` is "run the callback against the current value at drain time". It does not write a value of its own, and `current` is the value after every earlier queued write.

## Tests (2)

- `test/explore/scheduling.test.js` › resource writes in queued paths › queued resource set(asyncFn) does not revert an earlier queued write
- `test/explore/scheduling.test.js` › resource writes in queued paths › resource post(asyncFn) after post(value) does not revert the posted value

Run with `bun test --conditions=src test/explore/scheduling.test.js`.

## Fix

Both tests pass.

### Changes

- **`asyncRun(node, fn, time)`** (new drain handler, next to `asyncAssign`): runs `_runAsync(node, fn, node._value)`, writing nothing of its own. The callback's `current` is the value at drain time, after every earlier queued write.
- **`set`** (queued branch of the single-argument resource form) and **`SignalProto.post`** (single-argument resource form) now `schedule(this, value, asyncRun)`. They no longer queue `{ _value: this._value, _fn: value }` through `asyncAssign`. The payload is the callback itself, so this also saves one object allocation per queued call.
- `asyncAssign` is unchanged and still handles the two-argument form `set(value, asyncFn)` / `post(value, asyncFn)`, whose optimistic value is a real write.

### Behavior decisions

- A queued `set(asyncFn)` behaves like the idle form, which already runs the callback against the committed value without writing. It queues behind earlier writes and does not supersede them, as `set()` inside a batch or flush always does ("the last write wins").
- `asyncRun` does not touch `FLAG_SCHEDULED`. Before the fix, its snapshot `assign()` cleared the flag and notified only when it reverted a value, which was the bug. A sync result is still written and notified by `_runAsync` as before.

### Test expectations changed

None.

### Other bugs' tests

None changed state. The neighboring "batched resource set(fn) with a sync result settles without overflowing the stack" (bug 02) still fails the same way. The nested `flush()` in `_runAsync`'s sync branch re-drains the queue entry, which belongs to chain A.

### Hot paths touched

None. `set` changes only in the queued branch of the single-argument resource form, which now schedules the callback directly instead of allocating a payload object. No new fields.
