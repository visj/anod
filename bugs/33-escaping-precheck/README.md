# 33: An error escaping a flush's pre-run check deafens queued effects

Tests on `fix/23-hardening`. Fixed on `fix/24-slim-cold`.

## What breaks

When the `needsUpdate` pre-run check of a queued effect throws, the error escapes the flush. Every effect queued after it is left STALE or PENDING but no longer queued, and stays deaf for good. That includes effects that have nothing to do with the error.

Two ways to make the check throw:

- "Cycle detected" from a cycle between computes (bug 05 made it throw instead of hanging).
- An error escaping a compute's `_update`, for example bug 28's cleanup error.

```js
// a and b form a cycle once mode = 1 (setup as in graph.test.js)
c.effect((cx) => { try { cx.val(a); } catch {} });
c.effect((cx) => { cx.val(s2); cx.val(other); log.push("E2"); });
s2.set(1);    // the cycle throws from E1's pre-run check
other.set(1); // E2 never runs again
```

## Root cause

`flushEffects` (`src/internal.js:5141`) calls `needsUpdate(node, time)` in the `if` condition (`:5150`), outside its `try`. The COMPUTES phase does the same (`:5286`). When it throws, the flush loop's `finally` zeroes the queue counts. The skipped effects keep FLAG_STALE or FLAG_PENDING, and `notify` skips nodes that already have those flags, so nothing queues them again.

Bug 05's README flagged the escaping cycle error for maintainer review.

## What anod should do

Fix 06's contract: an error that escapes a flush never leaves the engine inconsistent. A throw from the pre-run check is handled like a throw from the run itself. It counts as an error of that node (its flags are cleared, and it goes through recover or disposal), and the flush continues with the rest of the queue. Cycles stay unsupported, but they must not deafen unrelated effects.

## Tests (1)

- `test/explore/hardening.test.js` › 33 › a cycle error from an effect's pre-run check does not deafen an unrelated effect

Run with `bun test --conditions=src test/explore/hardening.test.js`.

## Notes for the fix

Moving `needsUpdate` inside the existing `try` costs nothing on the success path. The catch must then clear STALE and PENDING for a node whose `_update` never started. It already does that for a cleanup that throws ("A cleanup that throws aborts the run before it clears these").

## Fix

- `flushEffects`: the `try` now wraps the pre-run check together with the run. A throw from `needsUpdate` goes through the existing catch, which clears STALE and PENDING and hands the error to recover or disposal. The queue then drains on. When nothing throws, the success path runs the same tests.
- The COMPUTES phase (eager computes and tasks with waiters) gets the same `try`. A compute catches its fn's errors, so what reaches this catch comes from the pre-run check. The compute's STALE and PENDING are cleared, so the next change queues it again. The error is rethrown when the drain ends, as `get()` rethrows a cycle error to its caller.

**Cost:** "Kairo: avoidable propagation" is 2.8% slower: 67.3 → 69.2 ns, medians of 8 alternating rounds against a build with only the `flushEffects` change reverted. That bench runs a pending effect whose check returns false on every write, the path now inside the `try`. Every other bench is unchanged.

Four other shapes were measured against the reverted build, 9 rotating rounds each. None did better:

| Variant | avoidable | broad | CellX |
| --- | --- | --- | --- |
| this fix: one `try` per node around check and run | +2.2–2.8% | ±1% | ±1.5% |
| vB: one `try` around the whole loop, the catch resumes after the node | +2.6% | +0.5% | +1.8% |
| vD: the loop in a function without a `try`, a wrapper catches and resumes | +5.3% | +5.0% | +4.7% |
| vJ: `flush`'s own `try` gets the catch; nodes leave the queue after their check | +2.0–2.5% | +1.4–1.6% | +2.7–3.3% |
| vN: vJ without any catch, only the store moved and the queue recorded (measurement only) | +2.1% | +2.8% | +2.9% |

vN shows the bench reacts to almost any change in the drain loop: moving one store and adding two locals cost as much as the `try`. TurboFan's inlining is the same in every build (`needsUpdate` and `checkSingle` inline into `flushEffects`, which inlines into `flush`). So the simplest shape, the one-per-node `try`, stays.

Found while testing the fix: the flush's `finally` never resets `COMPUTE_COUNT` or `LEVELS`. Before the fix, a throw escaping the COMPUTES phase left nulled entries counted, and every later flush crashed on them. Nothing can escape either phase now. The only early exit left is the runaway-cycle `break`, which leaves valid, requeued entries for the next flush.

Tests added: `hardening.test.js` › 33 › "a cycle error from an eager compute's pre-run check does not deafen an unrelated effect" (fails on master).
