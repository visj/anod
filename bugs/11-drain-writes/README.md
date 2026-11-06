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

The sender drain in `flush()` keeps going until the queue stops growing, so writes queued while it runs are applied in the same pass. The dispose drain had the same snapshot problem and gets the same treatment.

### Changes

- `flush()`, sender drain: the loop over `SENDERS` is wrapped in a `do/while` that takes the count again after each round and resumes at the first entry it hasn't run. A `set()`, `post()` or `notify()` made by an updater, an equality function or a resource callback that runs synchronously (`asyncAssign → _runAsync`) is appended to the queue (the engine isn't idle), and now runs in the same pass, after the writes queued before it. `FLAG_SCHEDULED` is still cleared only after every write in the pass has run, and the clear loop now uses the final count, so it covers the appended entries too.
- `flush()`, dispose drain: same shape. A cleanup that disposes another node during the dispose drain (a root's cleanup calling `other.dispose()`) queued that node past the count and was dropped. The other root stayed alive and its effects kept running. Now it is disposed in the same pass. No listed test covers this; I checked it with a scratch script.
- Both inner loops count each extra round toward the flush's runaway guard (`cycle`), so an updater that keeps queuing a new write ends with `Runaway cycle` instead of hanging. The guard check is now `cycle++ >= 1e5` instead of `=== 1e5`, because the inner rounds can step `cycle` past the exact value.

### Behavior decisions

- Writes queued during the drain run in the same pass, in FIFO order, with the cycle's `time`. They don't wait for the next cycle, so computes and effects see the final values once, not each intermediate value. The spec asks for this ("drained in the same flush (FIFO)").
- When the runaway guard stops the sender drain partway, the writes it hasn't run are dropped and their senders lose `FLAG_SCHEDULED`, like the rest of the work a runaway abort drops. The error thrown is `Runaway cycle`.

### Tests

4 of 4 pass. No test expectations changed. No other group's tests changed state.

### Hot paths touched

- `flush()` sender and dispose drains: one extra compare per drain pass (does the queue still have entries past the count?), plus one more round only when it grew. Per-entry work is unchanged.
- The runaway check compares with `>=` instead of `===`, at the same cost.
- No node fields added.
