# 37: A cleanup error that is already a `Defect` is wrapped again

Tests on `fix/23-hardening`. Fixed on `fix/24-slim-cold`. Found during the simplification scan.

## What breaks

When a cleanup throws a `Defect` (for example `cx.panic()` inside a cleanup), anod wraps it in a second, FATAL `Defect`. A recover handler or reader then sees type FATAL instead of PANIC, and the real error is hidden in `.error.error`.

```js
const comp = c.compute((cx) => {
  const v = cx.val(s);
  cx.cleanup(() => { if (v === 0) cx.panic("bye"); });
  return v;
});
comp.get();
s.set(1);
comp.get().type;  // FATAL (3), expected PANIC (2)
```

## Root cause

Four catch sites build `new Defect(err, FATAL)` instead of calling `defect(err)`, which passes a `Defect` on unchanged (`src/internal.js:3702`):

- `ComputeProto._update`, for a throwing cleanup (`:2668`)
- `flushEffects`, for a cleanup error while disposing a failed effect (`:5171`)
- the DISPOSES phase of `flush`, for a cleanup error during disposal (`:5223`)
- the REJECTS phase of `flush`, for an error from `deliverRejects` (`:5242`)

## What anod should do

Fix 07's model: a `Defect` travels on unchanged, and only raw throws are wrapped as FATAL. All four sites use `defect(err)`.

## Tests (1)

- `test/explore/hardening.test.js` › 37 › a compute whose cleanup panics holds the PANIC Defect, not a FATAL wrapper

Run with `bun test --conditions=src test/explore/hardening.test.js`.

## Fix

All four sites call `defect(err)`.
