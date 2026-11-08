# 31: `c.refuse()` in an async task exposes the previous value as its error

Tests on `fix/23-hardening`. Fixed on `fix/24-slim-cold`.

## What breaks

In an `async` task, `return cx.refuse(x)` flags the task as errored right away, but the `Defect` only arrives with the promise, a microtask later. A reader that runs in between sees the task as errored with its **previous value** as the error:

- `c.val(t)` throws the previous value (here the number `10`), not a `Defect`.
- `c.rejected(t)` returns the previous value.
- `t.error` is true while `t.get()` is not a `Defect`.

```js
const t = c.task(async (cx) => {
  const v = cx.val(s);
  if (v < 0) return cx.refuse("negative");
  return v * 2;
});
// t settled at 10
c.effect((cx) => {
  cx.val(s);
  try { cx.val(t); } catch (e) { /* e === 10 */ }
});
s.set(-1);
```

## Root cause

`ComputeProto.refuse` (`src/internal.js:1190`) sets FLAG_ERROR on the node and returns the Defect. In a sync compute, `_update` stores the Defect in the same run. An async fn's synchronous part ends at its first `await`, or at the implicit await of the `async` return, so `_value` keeps the previous result until `_settle`. Meanwhile, `val()` and `rejected()` read FLAG_ERROR on a node that is loading.

## What anod should do

The README's error model: everything thrown or returned as an error is a `Defect`. The REFUSE flag becomes visible only together with the Defect, when the activation settles. Until then the task is just loading, and readers see its previous value as a value.

## Tests (1)

- `test/explore/hardening.test.js` › 31 › a reader in the same flush never sees the previous value as the error

Run with `bun test --conditions=src test/explore/hardening.test.js`.

## Notes for the fix

`refuse()` could skip setting FLAG_ERROR on async nodes and let the settle path detect a returned REFUSE `Defect` (`_settle` already receives the value). Keep the sync behavior unchanged. The test checks invariants rather than a specific timeline, so it also passes if the refusal becomes visible only at settle.

## Fix

- New flag `FLAG_REFUSE`, exported from `anod/internal`. It shares the bit of FLAG_PURGE (`1 << 24`): only an owner is purged, and only a compute refuses. Bit 30, the only free one, is outside V8's 31-bit Smi range under pointer compression, so a task that refused would turn `_flag` into a heap number and deopt every compute. `ComputeProto.refuse` sets it instead of `FLAG_ERROR` on an async node. A sync compute is unchanged.
- `ComputeProto._settle` turns it into `FLAG_ERROR` on entry, so the error flag and the `Defect` become visible together. This covers promises, generators and the callback form.
- The sync tail of an async node (a task whose fn returned a plain value) does the same after `startAsync` returns false.
- `ComputeProto._update` clears `FLAG_REFUSE` in its start mask, so a refusal from an activation that was superseded never shows. Masks fold to one integer, so this adds nothing to the run.
