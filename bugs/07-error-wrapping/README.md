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

### Telling anod's errors from user values

anod now records every `{ error, type }` object it creates in a module-level `WeakSet` (`FAULTS`). Two helpers sit next to `tryRecover`:

- `fault(error, type)` creates the object and adds it to `FAULTS`. `refuse()`, `panic()`, the ILLEGAL_READ value in `ComputeProto.get()` and every FATAL wrap go through it.
- `fatal(error)` classifies a caught value. If anod created it, it is returned unchanged; otherwise it is wrapped once as `fault(error, FATAL)`. Every catch that used to wrap now calls it: both catch blocks in `ComputeProto._update`, `CellProto._error`, `ComputeProto._error`, `EffectProto._error`, `startEffect` and `flushEffects`.

Because the check is on identity, an anod error keeps its type however it travels:

- through a `val()` rethrow, a bound dependency, `_readAsync`, `defer()`, or a task await (fast path, waiter rejection, array await);
- out of a child effect;
- through a promise rejection after an `await`;
- through a user `try/catch` that rethrows it, or a user `throw c.rejected(x)`.

A user value is wrapped exactly once, because the wrapper is itself recorded. That includes a hand-made object shaped like `{ error, type: PANIC }`: the README says FATAL is "any error not explicitly created through the panic or refuse methods".

Why not the other options:

- **A flag at the throw site** (`FLAG_PANIC`, or a flag set when `val()` rethrows). This is how panics were classified, and it is what broke. The flag describes the run, not the value. Once a user catches an engine error and carries on, the next raw throw in that run is misread as anod's. This is common in async code: `try { await c.suspend(task) } catch {}`, then a failed `fetch` reaches recover unwrapped. A flag also cannot mark the right node when a child effect's error is rethrown into a parent created with another context, or when a value comes back through `c.rejected()` or a promise. Making it work would also add code to `val()`'s rethrow branches.
- **Matching the dependency's `FLAG_ERROR` value at catch time.** This only covers dependency reads. It misses panics, child effects, array awaits (not subscribed when they reject) and rethrows, and it would need to scan `DSTACK` during setup.
- **A private class as the marker.** This doesn't work: the node test runner's `toEqual` is `assert.deepStrictEqual`, which compares prototypes. The README also documents plain `{ error, type }` objects.
- **Shape sniffing** misreads user objects such as `{ error: "not found", type: 2 }` from an API.

### FLAG_PANIC is retired

With provenance carried by the object, the engine needs no per-node panic state. `panic()` just throws `fault(val, PANIC)`. Nothing sets or reads `FLAG_PANIC` any more, and it is gone from `ComputeProto._update`'s reset mask. So "panic state is per run" holds trivially: a panic caught in one run cannot change how a later run's throw is classified. The constant stays exported so `anod/internal` importers don't break, but the bit is now free.

### The double `tryRecover` and double wrap in `startEffect`

- The catch body shared by both branches moved to `failStart(node, error)`. When the new effect's owner chain declines the error (`RECOVER_NONE`), `failStart` disposes the effect, records the error and the effect in `UNHANDLED` / `UNHANDLED_NODE`, and rethrows the same object to the creator.
- `tryRecover(node, error)` first checks for that case: if `error === UNHANDLED` and `node` owns `UNHANDLED_NODE`, the error comes from one of `node`'s own children. Its handlers and its owners' handlers have already declined it. It returns `RECOVER_NONE` without asking them again and clears the record.
- The parent is then disposed, because the unhandled error aborted its run (as before). It rethrows to its own creator, re-arming the record for the next level.
- Ownership is the test because `_owned` is reset when the owner re-runs. So a record left behind when user code swallowed the error can never skip the handlers of a later run. The check lives in `tryRecover`, so the re-run path (`flushEffects`) and async parents (`EffectProto._settle`, for a spawn whose synchronous part creates the child) get it without further changes.

### Blame in the idle branch of `startEffect`

The node's own run now has its own `try` (calling `failStart`). The trailing `flush()` sits after it, inside only the `try/finally` that restores `IDLE`. An error from an effect that the creation's writes triggered is handled by that effect's owners in `flushEffects`. If it is unhandled, it passes to the caller unchanged; the new effect is neither blamed nor disposed, and its owner's handlers are not asked.

### Behavior decisions

- **An unhandled error from the flush that a creation triggers is thrown out of the `effect()` / `spawn()` call.** That call is "whoever triggered the run" (bug 01's wording), consistent with `set()` throwing an unhandled effect error to the writer, and with bug 06's "an error thrown during a flush is reported to the caller".
- **A new effect whose own run throws but is recovered now still flushes the writes it queued before throwing.** Before, the throw skipped the flush, and the writes waited for some unrelated later flush. This matches what `flushEffects` does for a recovered re-run.
- **Known limitation: cross-context children.** A child created inside an effect through another owner's context (`r.effect(...)` with a root captured from the closure, or the global `c`) is not owned by the running effect. Its rethrown error is offered to the running effect's chain, which is correct because those handlers have not seen it. But an owner common to both chains (the shared root) sees it a second time. Avoiding that needs the failed child's owner chain at the parent's catch, plus expiry when that owner re-runs. That costs a third module variable and a nested chain walk, for a pattern the README calls a footgun, so I left it out.
- **Known limitation: async writers.** An error that escapes a flush into an async continuation (for example `s.set()` after an `await` triggers another effect that fails unhandled) rejects the spawn, which offers it to its own chain again. Recording it would mean touching `flush()`, which chain A owns.

### Test expectation changed

`ownership.test.js` › "an effect is not disposed for an error thrown by an effect it triggered". The test assigned `creator = r2.effect(...)`. That only works if the creation call returns normally, which means swallowing the downstream effect's unhandled error. That contradicts the flush contract above (and the test's own `try/catch` around `root()`). With the fix the error escapes `r2.effect()`, so `creator` stayed `undefined` and the test died with a TypeError before its assertions. The test now captures the node from its context (`creator = cx`; the context is the effect). Every assertion is unchanged, and on the parent branch the test still fails on `creator.disposed`.

### Other bugs' tests turned green

None.

### Hot paths touched

- `val()`, `_read`, `set`, `notify`, `checkRun`/`needsUpdate`, `EffectProto._update` and the flush loops are unchanged.
- `startEffect` (effect creation): the idle branch nests a `try/catch` around `node._update(TIME)` inside its `try/finally`. Both catch bodies moved out to `failStart`, so `startEffect` itself is smaller.
- `ComputeProto._update`: only the catch bodies changed, now a `fatal(error)` call. `FLAG_PANIC` left the reset mask, which is a compile-time constant with no runtime cost.
- `flushEffects`: one line in its catch.
- `tryRecover`: one identity check up front. Error path only.
- **Memory:** no new fields on any node constructor. The module gains one `WeakSet` and two slots.
  - Creating an anod error costs one `WeakSet.add`, and classifying a caught value costs one `WeakSet.has`. Both are on error paths. The one that runs most often is `refuse()`, which is "expected" and may run on every validation.
  - The `UNHANDLED` slot holds the last unhandled creation error, and its disposed effect, until it is consumed or overwritten.
- `FAULTS`, `UNHANDLED`, `fault` and `fatal` are not exported from `internal.js`. If extensions need to create anod errors, exporting `fault` is the natural follow-up.
