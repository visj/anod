# 25: `c.lock()` is never released when an activation finishes synchronously

Branch `fix/23-hardening` (tests only). The tests were skipped (`describe.skip`) on `fix/24-slim-cold`, and the fix is on `fix/25-shield`. The fix follows [D10](../design/README.md#d10-clock-becomes-cshield-a-guarantee-that-the-activation-runs-to-completion): `c.lock()` becomes `c.shield()`, a guarantee that the activation runs to completion, for effects and spawns only, and `c.unlock()` is removed.

## What breaks

The README says `c.lock()` "prevents the node from re-running until the current activation completes (or `c.unlock()` is called)", and that a locked node whose owner disposes it "is disposed once it completes". An activation that finishes synchronously never releases the lock:

- A sync effect that locks runs once and never again.
- A sync effect that locks is never disposed: its owner's `dispose()` doesn't run its cleanups.
- A spawn whose body returns without awaiting, after `lock()`, never re-runs.
- A task that locks and returns a plain value keeps that value forever.

```js
c.effect((cx) => { cx.val(s); cx.lock(); runs++; });
s.set(1);
s.set(2);
runs; // 1, expected 3
```

A sync effect that locks and then throws is never disposed either. The owner's recover handler takes the error, then the teardown finds the lock and only marks the effect, so its cleanup never runs. Without the lock it runs once.

## Root cause

FLAG_LOCKED is only cleared in `ComputeProto._settle` (`src/internal.js:2514`) and `EffectProto._settle` (`:3087`). A synchronous activation finishes in the sync tail of `_update` and never reaches `_settle`. After that:

- `_update` and `_receive` return early while FLAG_LOCKED is set (`:2642`, `:3195`).
- `_dispose` only sets FLAG_DISPOSED and waits for a settle that never comes (`:2604`, `:3147`).

## What anod should do

The lock lasts for one activation. When the activation ends synchronously, the end of `_update` releases the lock and replays whatever the lock deferred, as `_settle` does for an async activation:

- a deferred dispose runs the teardown;
- a change that arrived during the activation re-runs the node (or queues it).

## Tests (4)

- `test/explore/hardening.test.js` › 25 › a sync effect that locks re-runs on the next change
- `test/explore/hardening.test.js` › 25 › a sync effect that locks is disposed with its owner
- `test/explore/hardening.test.js` › 25 › a spawn whose body returns synchronously after lock() re-runs
- `test/explore/hardening.test.js` › 25 › a task that locks and returns a plain value recomputes

On `fix/25-shield` the tests call `c.shield()`, and the task test is replaced by "a sync effect that locks and throws is disposed", since tasks can't shield.

Run with `bun test --conditions=src test/explore/hardening.test.js`.

## Conflict to review

Bug 19's `unlock` has a branch for "something deferred and the activation already finished (for example a sync node that locked)". That branch assumes the lock outlives a synchronous activation, so that a later `cx.unlock()` from outside the run releases it. That contradicts the README, which ties the lock to the activation.

**Resolved (2026-11-08) by D10:** the lock lasts one activation, and `unlock()` is removed altogether, along with bug 19's branch. Releasing mid-flight had no real use case, and it let code outside the activation end it. Only `dispose(true)` ends a shield early.

**Tests:**
- The four tests here move to `c.shield()`. The task test is replaced by the throw case above, because tasks can't shield.
- Bug 19's "spawn that unlocks mid-flight" test is removed with `unlock()`.

## Additional deadlock investigation (2026-11-07)

The current source was exercised with isolated Node processes, bounded microtask drains,
and a three-second timeout per scenario. These findings concern `src/index.js`, not the
built distribution. No runtime changes were made. Run the attached probes from any
working directory with `python3 bugs/25-sync-lock/probe-deadlocks.py` (path relative to
this repository). The script checks the observed current behavior, not the desired fix;
its expectations should change when the implementation changes.

Here, **deadlock** means an activation cannot settle because the action that would settle
it is deferred until that activation settles. The event loop remains responsive. An
arbitrary external promise that never settles is an indefinite wait, not by itself a
runtime-created deadlock.

### Results

| Scenario | Observed result | Classification |
| --- | --- | --- |
| Locked activation awaits its controller's abort; owner is disposed | Controller never aborts; continuation and cleanup never run | Disposal/settlement circular wait |
| Call `unlock()` after that disposal | Still loading; no abort or cleanup | No manual escape while disposed and loading |
| Call `dispose(true)` after that disposal | Same result | D6's planned force API is not implemented in the tested source |
| Locked parent awaits a promise resolved by an owned child's cleanup | Parent disposal never reaches child cleanup | Ownership/settlement circular wait |
| Two locked scopes each await a promise resolved by the other's cleanup | Both stay pending after disposal | Cross-scope cleanup cycle |
| Dependency changes during a locked wait; call `unlock()` | No rerun and no controller abort | Unlock defers while stale and loading |
| Two tasks await each other after a startup gate | Both loading, neither errored, with or without locks | General async wait cycle, not caused by locking |
| Locked child awaits a promise resolved by its root's cleanup | Completes today | Control case affected by planned owner-lock inheritance |
| Synchronous spawn locks and returns | One run, no cleanup after disposal | Original bug 25 reconfirmed |
| Same spawn body wrapped in `async` | Two runs and cleanup | Promise settlement releases the lock |

External abort/resolution released the circular-wait probes and their cleanups. This
checks that the problem is deferred teardown rather than a broken promise handler.
A bounded observation alone cannot prove eternal waiting: the identified wait cycles
provide the causal explanation. Probes use only public APIs and mock promises.

### 1. Disposal waits for an abort that disposal itself must deliver

```js
import { root } from "anod";

let controller, context;
const app = root(r => {
  r.spawn(async c => {
    context = c;
    c.lock();
    controller = c.controller();
    await c.suspend(new Promise(resolve => {
      controller.signal.addEventListener("abort", resolve, { once: true });
    }));
  });
});

app.dispose();
context.unlock(); // Does not release a disposed, loading activation today.
// controller.signal.aborted === false

// External rescue, verified to allow settlement and cleanup:
controller.abort();
```

A real equivalent is a long-lived subscription that finishes only when aborted.
`_dispose()` returns at `FLAG_LOCKED`, before aborting the controller. `_settle()` would
clear the lock, but settlement requires that abort first. Resolving the wait from the
same activation's cleanup/finalize would have the same causal problem (inferred, not
separately probed).

### 2. Locked parent prevents its child's cleanup from releasing it

```js
let release;
const finished = new Promise(resolve => { release = resolve; });
const app = root(r => {
  r.spawn(async c => {
    c.lock();
    c.effect(child => child.cleanup(() => release()));
    await c.suspend(finished);
  });
});
app.dispose(); // Child cleanup is never reached.
// Calling release() externally breaks the cycle.
```

The lock also prevents traversal of the owned subtree. This matters for components
whose teardown delivers a worker/subscription shutdown acknowledgement.

Two independent scopes can form the same cycle: A awaits promise A and its cleanup
resolves B; B awaits promise B and its cleanup resolves A. Disposing both leaves both
pending. Resolving promise A externally released both in the probe.

### 3. Unlock cannot interrupt a loading activation once stale

```js
import { root, signal } from "anod";

const enabled = signal(true);
let context, release;
const wait = new Promise(resolve => { release = resolve; });
const app = root(r => {
  r.spawn(async c => {
    context = c;
    if (!c.val(enabled)) return;
    c.lock();
    await c.suspend(wait);
  });
});
enabled.set(false);
context.unlock(); // Disabled branch is not entered until wait settles.
```

`unlock()` clears immediately only when no stale/pending/disposed flag is set, or when
loading has ended. With a stale loading activation it does nothing. The probe's
unlocked control reran and aborted its controller; the locked variant stayed on run 1.

This is not alone proof of a circular wait: the promise may settle independently.
It becomes a deadlock if the old wait depends on the deferred rerun/cleanup. It also
means `unlock()` is not a reliable external escape. Its implementation comment describes
this deferral, while the README promises release on `unlock()`; resolve that contract.

### 4. Async task wait cycles are not detected here

```js
let start, a, b;
const ready = new Promise(resolve => { start = resolve; });
const app = root(r => {
  a = r.task(async c => {
    await c.suspend(ready);
    return await c.suspend(b);
  });
  b = r.task(async c => {
    await c.suspend(ready);
    return await c.suspend(a);
  });
});
start();
```

Both tasks stayed loading without errors after microtask draining. Adding `lock()`
produced the same wait. The startup gate prevents an initialization/undefined-variable
error. Treat async wait-cycle diagnostics as separate from bug 25; releasing locks alone
cannot solve a logical A-awaits-B-awaits-A dependency.

### Implications for the agreed D6 design

[D6](../design/README.md#d6-a-locked-spawn-whose-owner-disposed-it-cant-create-children-in-its-continuation)
already decides owner-lock inheritance and explicit `dispose(true)`. These findings
identify cases that implementation must cover, rather than overturning the decision.

- Root cleanup resolves a locked child's wait today. Once owners inherit locks, that
  control becomes circular: the root waits for the child, which waits for root cleanup.
- Inherited locks can also defer an ancestor rerun that would resolve a child's wait.
  This is a design risk, not a reproduced current-source bug.
- Force disposal must work **after graceful disposal has already been requested**;
  an early "already disposed" return must not suppress escalation.
- Force must reach controllers, children and cleanup without requiring a promise to
  acknowledge cancellation or settle. Some work ignores abort signals.
- A watchdog calling today's `unlock()` cannot reliably break these waits.

### Regression coverage for the fix

1. Retain the original four synchronous-completion tests.
2. Check controller, child-cleanup and cross-scope cycles: graceful disposal defers;
   force disposal tears down once and prevents obsolete guarded continuations.
3. Check force escalation after graceful disposal, including a never-settling promise;
   unrelated reactive work must continue.
4. Pin intended unlock behavior for loading+stale and loading+disposed activations.
5. Cover inherited-owner cleanup/rerun cycles when D6 is implemented.
6. Track mutual task awaits separately with bounded tests and disposal checks.

Do not reject every long-running lock as a deadlock: a legitimate save can take an
arbitrarily long time. Diagnostics, optional deadlines and force disposal serve different
purposes.

## Fix

On `fix/25-shield`, following [D10](../design/README.md#d10-clock-becomes-cshield-a-guarantee-that-the-activation-runs-to-completion).

**API:**
- `c.lock()` is now `EffectProto.shield`, and `c.unlock()` is gone. Computes lose their lock code: the check at the top of `ComputeProto._update`, the replay in `_settle` and the deferral in `_dispose`.
- `dispose(force)` takes a boolean. `dispose(true)` of a locked node calls `forceDispose`, which works after a plain `dispose()` too.

**Holds:**
- The module-level `HOLDS` map counts, per node: four for each shielded effect below it, two if its disposal waits (`deferDispose`), and one if it is shielded itself.
- `shield()` walks `_owner` and locks every owner on the path. `_update`, `_receive`, `notify` and `_dispose` already defer for a locked node.
- A waiting disposal is recorded in `HOLDS`, not in FLAG_DISPOSED. The node isn't disposed yet, so reads and child creation work (D6 a), and the dispose drain's purge keeps it in its owner's children. `deferDispose` freezes the subtree with `pauseNode`, which moved to module level, and `resume()` does nothing in a frozen subtree.

**Release:** `unshield` runs where the activation ends:
- the sync tail of `EffectProto._update` (FLAG_LOCKED joins the mask it tests: this is bug 25);
- `EffectProto._settle`;
- the throw paths in `flushEffects` and `failStart`, after the error handling (the throw case above).

It works in two steps:
- `countOff` takes the shield off the node and its owners. A node with no holds left is unlocked, and one whose disposal waited gets FLAG_DISPOSED.
- `replay` then tears down the topmost of those, with `disposeHeld`, which also takes it out of a live owner's `_owned`. It queues the topmost deferred re-run above that, unless an owner further up still waits to be disposed: then it pauses the freed nodes instead.

**Cycles:** `awaits(task, node)` walks the responders of a loading task before `_suspendTask` or `_stepArray` binds a wait. If the walk reaches the awaiter, the await fails with `"Cycle detected"`, the same message as a compute cycle.

**Probes:** `probe-deadlocks.py` now checks the D10 behavior:
- Each circular wait (own abort, child cleanup, root cleanup, cross-scope) stays pending on a graceful dispose, and `dispose(true)` tears it down once. Forcing one of the cross-scope pair lets the other finish.
- A sync spawn that shields re-runs and is cleaned up.
- Mutual task awaits fail with "Cycle detected".

**Known gap:** a child created by a shielded continuation after the disposal froze its subtree starts unpaused, so it reacts until the continuation's shield releases, and then it is paused too. Closing that gap is D3 (children of a paused owner start paused), which isn't implemented.

**Tests:**
- `test/shield.test.js` replaces `test/lock.test.js`. The 11 task tests are gone. It has 28 tests:
  - spawn, sync effect, owner and dispose cases;
  - `dispose(true)`;
  - the two stale-guard tests, kept.
- In `hardening.test.js`:
  - 25 (4);
  - D10 wait cycles (4) and bookkeeping (1);
  - 34's lock test now uses a shielded spawn.
- In `dispose-waiters.test.js`, the locked-waiter test is split in two:
  - a waiter whose task is in another root is still rejected;
  - one whose task is in its own root holds the disposal until `dispose(true)`.
- A mutation run removed each piece of the mechanism in turn, and every removal fails at least one test.
- `garbage.test.js` › "should be collected when disposed" now polls with `expectCollected`, like the other GC tests.
  - With one GC pass, it failed in 5 of 6 full Bun runs against `src` once `shield.test.js` was added.
  - Master's engine with the new test file fails it too, and the branch's engine with master's tests doesn't.
  - It passes in isolation and under Node's precise GC.

