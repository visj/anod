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

- **`pending()` subscribes through `this.rejected(task)` instead of `this.val(task)`**, for both the single-task and the array form.
  - `rejected()` already tracks a sender exactly as `val()` does: it refreshes it if stale or pending, uses stamp/`_read` in the sync scope and `_readAsync(sender, true)` after an await, and skips tracking for a stable node. Its only difference is that it never throws for `FLAG_ERROR`.
  - So `pending()` keeps the same subscription and simply stops throwing. The loading check that follows is unchanged.
  - Reusing `rejected()` avoids a third copy of the tracking logic, and makes the division of labour explicit: `pending()` answers "loading?", and `rejected()` answers "errored?".

Behavior decisions:

- A disposed sender (or the node itself) still throws ILLEGAL_READ from `pending()`, as it did through `val()` and as `rejected()` does. Only the error state stops throwing; reading a dead node is still a usage error.
- In the array form, an errored member counts as not loading. `pending()` is still true if any other member is loading.

Test expectations changed: none.

Other bugs' tests turned green: none.

### Hot paths touched

None. `pending()` is not on the propagation path, and it now makes one method call per sender, as before (`rejected` instead of `val`).
