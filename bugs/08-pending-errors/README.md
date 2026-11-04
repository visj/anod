# 08: `c.pending()` throws on an errored sender

Branch `fix/08-pending-errors`, based on `fix/07-error-wrapping`. Chain C (errors).
Next in the chain: `fix/09-errored-reread`.

## What breaks

The README's async pattern crashes as soon as the task fails:

```js
c.effect((c) => {
    if (c.pending(data)) return console.log("Loading...");   // throws here
    const err = c.rejected(data);
    if (err) return console.log("Error:", err.error);
    console.log("Data:", c.val(data));
});
```

## Root cause

- `pending()` reads its senders through `this.val()`, which rethrows `FLAG_ERROR` values.

## What anod should do

- `c.pending(sender)` subscribes and returns whether the sender (or any sender in the array) is loading. It never throws for an errored sender; checking errors is `c.rejected()`'s job.

## Tests (1)

- `test/explore/async.test.js` › c.pending / c.rejected › c.pending() on a rejected task returns false instead of throwing

Run with `bun test --conditions=src test/explore/async.test.js`.

## Fix

_Not fixed yet. The fix branch fills this in._
