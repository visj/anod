# 34: Node functions that run while the engine is idle

Tests on `fix/23-hardening`. Fixed on `fix/24-slim-cold`.

## What breaks

The engine assumes IDLE is false whenever a node's fn runs. Several paths run a fn with IDLE still true. Inside such a run:

- **A write** (`busy.set(x)`, or `cx.set(busy, x)`) flushes immediately, in the middle of the run.
- **An untracked `.get()`** of a stale compute takes the idle branch of `get()`, which resets FENCE.

Either way, other nodes restamp senders that the running node already read in this run. The running node's `patchDeps` then thinks those deps were not read and drops them. The node stops reacting to a dep it reads on every run.

```js
const t = c.task(async (cx) => {
  const v = cx.val(s);
  cx.lock();
  cx.set(busy, runs);      // flushes at once when replayed at idle
  if (cx.val(mode)) cx.val(extra);
  await cx.suspend(work());
  return v;
});
c.effect((cx) => { cx.val(busy); cx.val(s); });
// after a locked replay, t no longer depends on s
```

## Root cause

These entry points call `_update` (or `needsUpdate`, which pulls computes) without entering a flush:

- `ComputeProto._settle` replays a change that arrived during a lock, or a changed deferred dep, by calling `this._update(TIME)` (`src/internal.js:2578`).
- `resumeEffect` and `resumeOwned` call `needsUpdate(this, TIME)` at idle (`:1290`, `:1352`). A compute that `needsUpdate` pulls then runs at idle.
- By code reading, the same holds for the `needsUpdate` call in the promise guards of `c.suspend` (`:1424` and siblings), and for `unguard` (`:2314`), called from an idle `contextSet`, which refreshes deps.

## What anod should do

A node fn always runs as part of a flush (IDLE false). Writes made inside it are queued, and untracked reads go through the non-idle path. Paths that start work at idle should enter a flush first, as `set` does, and run the work inside it.

## Tests (3)

- `test/explore/hardening.test.js` › 34 › a locked task replayed at settle keeps its deps when its body writes a signal
- `test/explore/hardening.test.js` › 34 › a task re-run for a changed deferred dep keeps its deps when its body writes a signal
- `test/explore/hardening.test.js` › 34 › resume() keeps the deps of a compute whose fn makes an untracked .get()

Run with `bun test --conditions=src test/explore/hardening.test.js`.

## Notes for the fix

- For `_settle`, queue the node and flush, instead of calling `_update` directly. `EffectProto._settle` already does this (`_receive(); flush();`).
- For `resume`, wrap the `needsUpdate` check in the flush that follows it, or set IDLE to false around the check.
- The untracked `.get()` case is not a user error: the README allows reading a compute with `.get()` inside a fn to avoid subscribing.

## Fix

Every path that can run a node fn while idle now does it inside a transaction:

- `ComputeProto._settle`: the replay (a changed deferred dep, or a change that arrived while locked) queues the node onto COMPUTES and flushes, instead of calling `_update` directly.
- `resume()`: one recursive `resumeNode` for roots and effects (group 8 of the simplification report). At idle it runs with IDLE false and flushes at the end. A node that missed a change is queued through its own `_receive()`, which also skips a locked node, as every other notification does.
- `contextSet` at idle: `unguard`, which refreshes the writer's deps, runs with IDLE false. New test below.
- The promise and callback guards check pending deps through `checkStale`, which opens a transaction at idle (step 1 of the simplification).

### Tests added

- 34 › an idle c.set from a node does not run a dep compute while idle
