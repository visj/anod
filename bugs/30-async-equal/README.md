# 30: `c.equal()` is ignored when a task settles asynchronously

Tests on `fix/23-hardening`. Fixed on `fix/24-slim-cold`.

## What breaks

The README says `c.equal()` controls "whether downstream subscribers are notified after a compute re-runs". In a task that calls it after an `await`, it has no effect:

- `c.equal(true)` with a new object: subscribers are still notified.
- `c.equal(false)` with the same reference: subscribers are not notified.

```js
const t = c.task(async (cx, prev) => {
  cx.val(id);
  const data = await cx.suspend(fetchUser());
  cx.equal(prev !== undefined && prev.name === data.name);
  return data;
});
```

This is the natural place to call it: the comparison needs the awaited data.

## Root cause

Only the sync tail of `ComputeProto._update` reads FLAG_EQUAL and FLAG_NOTEQUAL. `ComputeProto._settle` (`src/internal.js:2511`) decides `changed` by reference alone: `value !== this._value || !!(flag & (FLAG_INIT | FLAG_ERROR))`.

## What anod should do

`c.equal()` works the same whether the task returned synchronously or settled later. `_settle` honors FLAG_EQUAL and FLAG_NOTEQUAL, and clears them, as the sync tail does. If called before the await, it applies to the settle of the same activation.

## Tests (2)

- `test/explore/hardening.test.js` › 30 › c.equal(true) after an await keeps subscribers idle
- `test/explore/hardening.test.js` › 30 › c.equal(false) after an await notifies subscribers of the same reference

Run with `bun test --conditions=src test/explore/hardening.test.js`.

## Notes for the fix

With FLAG_EQUAL, `_settle` should still store the new value (as the sync path does) and still resolve the waiters: bug 16 requires a settle to an unchanged value to resolve them.

## Fix

`ComputeProto._settle` decides `changed` as the sync tail does: an error or the first settle always counts. Otherwise a new value counts unless `FLAG_EQUAL` is set, and the same value counts only if `FLAG_NOTEQUAL` is set. The value is stored either way, and the waiters are resolved either way (bug 16).

### Behavior decisions

- The flags are cleared by the next `_update`, not by the settle. In an async generator, a `c.equal()` call therefore applies to every later yield of the same activation.
