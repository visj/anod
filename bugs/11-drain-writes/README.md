# 11: Writes made while the write queue drains are lost

Branch `fix/11-drain-writes`, based on `fix/02-nested-flush`. Chain A (flush).
Next in the chain: `fix/14-supersede-edges`.

## What breaks

The sender drain loop takes a snapshot of the queue length, runs that many entries, then resets the queue to empty. Anything appended while the loop runs is dropped:

- `set()`, `post()` or `notify()` called from an updater function at drain time.
- A write from a custom equality function at drain time.
- A posted resource callback that writes a signal synchronously (the natural case: `saving.set(true)` before the first await).

```js
const r = resource("a"), saving = signal(false);
r.post("b", async (rc) => { saving.set(true); return await rc.suspend(save()); });
await tick();
saving.get(); // false
```

## Root cause

- `flush()`: `let count = SENDER_COUNT; for (i < count) …; SENDER_COUNT = 0;` discards entries appended during the loop.

## What anod should do

- Every write accepted by `set`/`post`/`notify` is applied, wherever it was made. Writes queued during the drain are drained in the same flush (FIFO), and the flush's runaway-cycle guard still bounds pathological cases.
- Writing from an updater or equality function is discouraged, but it must not be silently lost.

## Tests (4)

- `test/explore/scheduling.test.js` › writes scheduled while the sender queue drains › set() and post() from an updater running at drain time are applied
- `test/explore/scheduling.test.js` › writes scheduled while the sender queue drains › a write made synchronously by a posted resource callback is applied
- `test/explore/scheduling.test.js` › writes scheduled while the sender queue drains › notify() from an updater running at drain time reaches subscribers
- `test/explore/scheduling.test.js` › writes scheduled while the sender queue drains › set() from a custom equality function at drain time is applied

Run with `bun test --conditions=src test/explore/scheduling.test.js`.

## Fix

_Not fixed yet. The fix branch fills this in._
