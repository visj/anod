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

_Not fixed yet. The fix branch fills this in._
