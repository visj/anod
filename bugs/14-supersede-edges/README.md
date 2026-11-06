# 14: Edge cases in the new set/post supersession

Branch `fix/14-supersede-edges`, based on `fix/11-drain-writes`. Chain A (flush).

## What breaks

Two small bugs in the recent `set()`/`post()` change (commit dc060fe):

- If a custom equality function throws during an idle `set`, the earlier posts have already been cancelled, so the throwing write still discards them. The documented contract is that a throwing updater leaves queued writes in place.
- After a flush aborts with an error, `FLAG_SCHEDULED` stays set on senders whose writes were dropped, so `post(sameValue)` returns `true` and queues a no-op.

```js
const s = signal(0, () => { throw new Error("eq"); });
s.post(1);
s.set(99); // throws; the post(1) is gone, s ends at 0
```

## Root cause

- `set()` calls `supersede(this)` before the equality comparison.
- The second clearing pass in `flush()` is skipped when the drain throws.

## What anod should do

- An idle `set` that throws, for any reason, changes nothing: queued writes stay queued.
- After any flush, `FLAG_SCHEDULED` is set exactly on the senders that still have queued writes.

## Tests (2)

- `test/explore/scheduling.test.js` › supersede edge cases › a set() whose equality function throws leaves earlier posts queued
- `test/explore/scheduling.test.js` › throw mid-drain: engine state afterwards › aborted drains leave no phantom queued-write marker on senders

Run with `bun test --conditions=src test/explore/scheduling.test.js`.

## Fix

An idle `set()` compares the new value before it cancels the posts, so a throwing equality function cancels nothing. `flush()` drops any writes left in the queue on exit and clears their marker, so `FLAG_SCHEDULED` never outlives an aborted drain.

### Changes

- `set()`, idle path: the equality comparison is stored in a local (`changed`) before `supersede(this)` runs, and the write branches on it afterwards. If the equality function throws, nothing has been cancelled. An unchanged write still cancels the posts and returns `false`, which `test/assign.test.js` › "set to the current value cancels a pending post" requires. The JSDoc now names the equality function next to the updater.
- `contextSet()` (the `cx.set(sender, value)` of a context), idle path: same change, so a contextual write after an `await` behaves like `set()`. I checked this with a scratch script; no listed test covers it.
- `flush()`, `finally`: before the counts are zeroed, every sender still in the queue loses `FLAG_SCHEDULED` and its slots are nulled. On a normal exit the queue is already empty and the loop doesn't run. It only does work after a runaway abort, which breaks out once the effects phase has queued new writes, or after any other throw that leaves the loop. Bug 06 already made the throwing updater case (the test's first half) clear its marker, and bug 11 covers a runaway stop inside the sender drain.

### Behavior decisions

- "An idle `set` that throws changes nothing" applies to throws that happen before the write is committed: the updater and the equality function. A throw from the flush that follows (an effect error, a runaway) comes after the write is committed and the posts are cancelled, which matches bug 06's decision that committed writes stay.
- After an aborted flush, the queue is empty, so no sender keeps `FLAG_SCHEDULED`. The dropped writes are lost, as before; only the marker is fixed.

### Tests

2 of 2 pass. No test expectations changed. No other group's tests changed state.

### Not covered

- A resource `set(fn)` with a single function still supersedes before it runs `fn`. `_runAsync` compares a synchronous result and may flush right away, and the posts must be cancelled before that flush, or they would apply on top of the result. If the equality function throws there, `fn` has already run and the node's async state has been reset, so the write has started anyway. Moving the cancel into `_runAsync` would also affect its drain-time callers, where the marker has other meanings.
- A runaway abort still drops the disposes and the requeued effects (bug 02's `requeue`) left in the other queues: the `finally` zeroes `DISPOSER_COUNT`, `SCOPE_COUNT` and `RECEIVER_COUNT` as before. Only the senders' marker is in this bug's scope.
- `README.md` says "If the updater throws, the posts stay queued." It could also mention the equality function. I didn't change it.

### Hot paths touched

- `set()` and `contextSet()` idle paths: the comparison moves into a local ahead of the `FLAG_SCHEDULED` check. Same work, in a different order.
- `flush()` `finally`: one loop-condition check (`0 < SENDER_COUNT`) per flush. The loop body runs only after an abort.
- No node fields added.
