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

_Not fixed yet. The fix branch fills this in._
