# 09: Reading the same errored compute twice in one run

Branch `fix/09-errored-reread`, based on `fix/08-pending-errors`. Chain C (errors).

## What breaks

The first `cx.val(bad)` in a run throws, as it should. A second `cx.val(bad)` in the same run returns the `{ error, type }` object as if it were a normal value.

```js
c.effect((cx) => {
    try { cx.val(bad); } catch {}     // throws
    const v = cx.val(bad);             // returns the error object
});
```

## Root cause

- The stamp fast path at the top of `val()` (`sender._stamp === version`) returns `sender._value` before the `FLAG_ERROR` check.

## What anod should do

- `val()` throws for an errored sender on every read, including repeated reads in one run.

## Tests (1)

- `test/explore/graph.test.js` › nested creation and disposed deps › reading the same errored compute twice in one run throws both times

Run with `bun test --conditions=src test/explore/graph.test.js`.

## Fix

_Not fixed yet. The fix branch fills this in._
