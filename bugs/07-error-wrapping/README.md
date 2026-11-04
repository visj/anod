# 07: The REFUSE / PANIC / FATAL model doesn't hold

Branch `fix/07-error-wrapping`, based on `fix/01-global-recover`. Chain C (errors).
Next in the chain: `fix/08-pending-errors`.

## What breaks

The README promises that every error is a `{ error, type }` object, so handlers can "cleanly separate expected errors from unexpected crashes". In practice errors are re-wrapped as they travel:

- An unbound compute that reads an errored dependency stores `{ error: { error, type: REFUSE }, type: FATAL }`, one more layer per hop. A bound compute passes the dependency's error through unchanged.
- An effect reading a refused compute hands its recover handler FATAL wrapping REFUSE.
- `c.panic()` after an `await` (in a task or spawn) arrives as FATAL wrapping PANIC.
- A spawn awaiting a failed task gets the task's FATAL error wrapped in another FATAL.
- An unhandled error in a child effect is wrapped twice, and every recover handler on the owner chain is called twice.
- `FLAG_PANIC` set by a caught `c.panic()` leaks into the effect's next run, so a real crash in that run reaches recover unwrapped.
- An effect whose creation writes a signal is blamed (and disposed) for an error thrown by an unrelated effect that the write triggered.

```js
const src = c.compute((cx) => cx.refuse("neg"));
c.compute(src, (v) => v).get();        // { error: "neg", type: REFUSE }
c.compute((cx) => cx.val(src)).get();  // { error: { error: "neg", type: 1 }, type: FATAL }
```

## Root cause

- `val()` rethrows the dependency's error object, and the `catch` in `ComputeProto._update` / `EffectProto._update` wraps whatever it catches as FATAL.
- `ComputeProto._error` and `EffectProto._error` always wrap as FATAL, ignoring `FLAG_PANIC` and already-wrapped errors.
- The non-idle branch of `startEffect` rethrows an already-wrapped error; the parent's `catch` wraps it again and runs `tryRecover` over the same owners a second time.
- `EffectProto._update` never clears `FLAG_PANIC` (`ComputeProto._update` does).
- In the idle branch of `startEffect`, the trailing `flush()` sits inside the same `try` as the node's own first run.

## What anod should do

- An error object that already has the `{ error, type }` shape travels unchanged: through `val()` reads, bound and unbound computes, effects, awaits and owner chains. FATAL wraps only raw thrown values, exactly once.
- `c.panic()` produces PANIC wherever it is called, including after an await.
- Each recover handler on the owner chain sees a given error once.
- Panic state is per run.
- An effect is only blamed for errors thrown by its own run. Errors from other effects during the flush its creation triggered go to those effects' owners.

## Tests (9)

- `test/explore/ownership.test.js` › error propagation › an unhandled child-effect throw is wrapped once and each handler sees it once
- `test/explore/ownership.test.js` › error propagation › an unhandled child-effect panic keeps its PANIC type
- `test/explore/ownership.test.js` › error propagation › an unbound compute propagates a dep's error like a bound compute does
- `test/explore/ownership.test.js` › error propagation › an effect reading a refused compute hands recover the REFUSE error
- `test/explore/ownership.test.js` › error propagation › a spawn awaiting a failed task hands recover the task's error unwrapped
- `test/explore/ownership.test.js` › error propagation › a panic caught in one run does not leak FLAG_PANIC into the next run
- `test/explore/ownership.test.js` › error propagation › an effect is not disposed for an error thrown by an effect it triggered
- `test/explore/async.test.js` › errors across await › task: c.panic() after an await keeps the PANIC type
- `test/explore/async.test.js` › errors across await › spawn: c.panic() after an await reaches recover as PANIC

Run with `bun test --conditions=src test/explore/async.test.js test/explore/ownership.test.js`.

## Fix

_Not fixed yet. The fix branch fills this in._
