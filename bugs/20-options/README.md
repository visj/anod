# 20: Documented options that misbehave

Branch `fix/20-options`, based on `fix/05-cycle-hang`. Chain D (graph).

## What breaks

- **OPT_DEFER on a bound effect:** `c.effect(dep, fn, OPT_DEFER)` runs immediately. The README's WebSocket example relies on it skipping the initial run.
- **`compute.weak()`:** documented in the README and declared in `types/internal.d.ts`, but not defined; calling it throws.
- **OPT_EAGER:** an eager compute marks its subscribers stale before it recomputes, so downstream effects re-run even when its value did not change (or when an upstream compute absorbed the change).
- **`stable()` mid-run:** called on a later run, it drops the dependencies read after the call, though the README says it "freezes the dependencies in place".
- **OPT_SETUP on a bound compute:** the extra dependencies it tracks are read by `.get()` but never wake subscribers.
- **pause during a flush:** an effect already queued, then paused by an earlier sibling in the same flush, still runs, and `resume()` then has nothing to replay.

## Root cause

- `effect()` calls `startEffect` unconditionally, while `compute()` checks `FLAG_DEFER`.
- `ComputeProto` has `eager` and `stable` but no `weak`.
- The eager path of `_receive` marks subscribers `FLAG_STALE` before the eager node recomputes.
- `FLAG_STABLE` set mid-run makes later reads skip tracking, and patchDeps then unsubscribes them.
- Bound nodes start with `FLAG_SINGLE`, and the setup branch never clears it.
- `flushEffects` does not check `FLAG_PAUSED`.

## What anod should do

- `OPT_DEFER` skips the initial run for bound effects too, as for computes.
- `compute.weak()` exists and marks the compute weak, mirroring `eager()` and `stable()`.
- An eager compute notifies its subscribers only when its value actually changes.
- `stable()` freezes the dependency set as it is at the end of the run in which it was called.
- A bound compute with `OPT_SETUP` reacts to every dependency it tracked.
- A paused effect never runs until it is resumed; a change it missed is replayed by `resume()`.

## Tests (7)

- `test/explore/graph.test.js` › options › bound effect with OPT_DEFER skips its initial run
- `test/explore/graph.test.js` › options › compute.weak() is available as documented
- `test/explore/graph.test.js` › options › OPT_EAGER: recomputing to the same value does not re-run downstream effects
- `test/explore/graph.test.js` › options › OPT_EAGER: upstream compute absorbs the change, downstream effect stays idle
- `test/explore/graph.test.js` › options › stable() called on a later run keeps the deps read after the call
- `test/explore/graph.test.js` › options › bound compute with OPT_SETUP reacts to the extra deps it tracked
- `test/explore/graph.test.js` › options › an effect paused by a sibling during the flush does not run

Run with `bun test --conditions=src test/explore/graph.test.js`.

## Fix

### What changed

- **OPT_DEFER:** `effect()` and `spawn()` call the new `deferEffect(node)` instead of `startEffect` when both `FLAG_DEFER` and `FLAG_BOUND` are set. `deferEffect` does not run the fn:
  - It sets `_time = TIME`, so the effect counts as having run now.
  - If the dep is a stale or pending compute, it refreshes it, wrapped in the same `IDLE`/flush handling as `startEffect`.
- **`weak()`:** new `ComputeProto.weak`, next to `eager()`. It sets `FLAG_WEAK`. Called before the first run (`FLAG_INIT`), it also stores the seed in `SEEDS`, as `OPT_WEAK` does since bug 04.
- **OPT_EAGER:** the eager branch of `ComputeProto._receive` notifies subscribers with `FLAG_PENDING` instead of `FLAG_STALE`. Both branches then notified `PENDING`, so they are merged into one test (`!(EAGER && ASYNC)`). An eager task still notifies only when it settles. Doc item 5 is updated.
- **`stable()`:** new flag `FLAG_FREEZE` (`1 << 27`), exported from `anod/internal` and declared in `types/internal.d.ts` like the other flags.
  - `stable()` on a compute sets `FLAG_STABLE | FLAG_FREEZE`, if not already stable.
  - `EffectProto.stable` is the new `stableEffect`. It adds `FLAG_FREEZE` only while the effect is stale or pending.
  - `val()` and `rejected()` take the untracked shortcut only when `FREEZE` is clear (one bit added to the existing constant mask). A run in which `stable()` is called therefore keeps tracking, and `patchDeps` no longer drops what it read after the call.
  - `Compute._update` clears `FREEZE` in its top-of-run flag write and in its end-of-run write. `Effect._update` clears it in its `finally`, and its stable-branch test also requires `FREEZE` to be clear.
  - The old `stable()` doc said async nodes clear `FLAG_SETUP`. The code never did, so the doc is rewritten.
- **OPT_SETUP on a bound node:** in the setup branch of `Compute._update` and `Effect._update`, storing extra deps (`DCOUNT > DBASE`) now also clears `FLAG_SINGLE`. A bound node starts single, and `_refresh` → `checkSingle` only looked at `dep1`.
- **Pause during a flush:** `flushEffects` runs a node only if it is not `FLAG_PAUSED`. A paused node also keeps its `STALE`/`PENDING` bits, so `resume()` replays it.

### Behavior decisions

- **OPT_DEFER is for bound effects only.** Unbound effects still ignore it: `test/defer.test.js` pins "unbound effect ignores OPT_DEFER -- always runs initially", and an unbound effect has no deps until it runs. Bound `spawn()` defers too.
- **A deferred effect brings a stale or pending compute dep up to date at creation**, which runs that compute's fn if needed. A stale or pending compute does not pass notifications on, so without this the effect could miss changes indefinitely. The effect then first runs on the first change after creation, and a recompute to the same value does not run it.
- **`weak()` after the first run:** the seed has been overwritten by then, so the recompute after a release gets `null` as prev. This matches a seedless `OPT_WEAK` compute (bug 04). Like `OPT_WEAK`, `weak()` releases nothing until the compute loses a subscriber.
- **`stable()` semantics:**
  - **On the first run:** unchanged. Setup tracks every read, including those after `stable()`. `test/edge.test.js` › stable compute › "tracks deps on first run only" pins this.
  - **On a later run:** the run tracks to its end. Every dep it read, before or after the call, existing or new, is kept, and deps it did not read are dropped. The set is then frozen, as the spec says.
  - **Between runs** (`node.stable()` from outside): the deps are frozen as they are, which the README's `wrong.stable()` example and `test/async.test.js` › "c.stable() on spawn()" rely on.
  - **Async nodes:** reads after an `await` (through `_readAsync`) are untracked after `stable()`, as before. `FREEZE` is cleared when the synchronous part of the run ends.
  - **Test-name note, not a conflict:** `test/async.test.js` › "c.stable(): post-stable reads do not register new deps" is first-run only. There, the read after `stable()` was already tracked before this fix: a probe shows `s2.set(99)` followed by `c1.get()` re-runs the task on `fix/05-cycle-hang` too. The test's assertions pass either way, because nothing pulls the task.
- **For maintainer review, the effect exception:** an effect has no top-of-run flag write that could clear `FREEZE`, and adding one would cost a store on every effect run. So `stableEffect` sets `FREEZE` only while the effect is stale or pending:
  - **Running:** exact semantics.
  - **Queued or paused with a run to come,** when `stable()` is called from outside: that coming run still tracks, and the effect freezes when it ends. The branch-select mask includes `FREEZE`, so that run takes the dynamic path and never tracks inside a stable run.
  - **Idle:** the effect freezes at once.
- **OPT_EAGER:** the eager compute still re-runs in the `COMPUTES` phase, before any effect. Downstream effects and computes now re-check through `needsUpdate`/`checkRun` (ctime), like for a lazy compute. An eager compute with `equal(false)` still re-runs them every time.
- **For maintainer review, `resume()` inside a flush (pre-existing):** `resume()` called from an effect during the `RECEIVERS` phase enqueues past the `count` that `flushEffects` iterates, and `flush()` then resets `RECEIVER_COUNT`. The replay is lost, and the effect stays `STALE`, so `notify` never wakes it again. This reproduces on `fix/05-cycle-hang` with a paused, stale effect resumed from another effect.
  - With this fix, an effect paused by an earlier sibling and resumed by a later sibling in the same flush also takes that path. Before, it simply ran while paused.
  - The fix belongs in `flush()` picking up receivers enqueued during its own `RECEIVERS` phase. That is chain A's area (flush), so it is left alone here.

### Test expectations changed

None.

### Other groups

No other group's tests changed state. `test/explore` goes from 82 to 75 failures, exactly the seven tests above. Dist and source give the same failure list. Extra probes (not committed):
- `stable()`: on a later run it keeps a new dep read after the call and drops an old dep the run skipped. Between runs it freezes at once, for a compute and for an idle effect. Called by a sibling on a queued effect, or on a paused stale effect, it causes no corruption (`VCOUNT` back to 0). On a task, sync reads after the call are kept and post-`await` reads stay untracked.
- OPT_DEFER: works on a deferred (stale) compute dep, on a compute that recomputes to the same value (no run), inside `batch()`, nested in an effect, and on a bound `spawn`.
- OPT_EAGER: an eager → eager → effect chain runs only on a real change, and an eager compute read through a lazy one updates.
- A bound effect with OPT_SETUP reacts to its extra deps, and a bound OPT_SETUP compute with no extra deps stays `FLAG_SINGLE`.
- `weak()` keeps the seed when called before the first run, and gives `null` after it.

### Hot paths touched

- **`val()`, `rejected()`:** the stable-shortcut mask gains one bit. It is a constant, so the instructions are the same.
- **`Compute._update`:** the top-of-run and end-of-run masks gain `FLAG_FREEZE`, also constants with no extra work. The setup branch does one `&= ~FLAG_SINGLE` when it stores 2+ deps, which happens on the first run only.
- **`Effect._update`:** the stable-branch mask and the `finally` mask gain one bit, with no extra work. The setup branch gets the same `FLAG_SINGLE` clear.
- **`Compute._receive`:** only the eager/waiter branch changed, and it lost one branch. The non-eager path is untouched.
- **`flushEffects`:** the `STALE` and `PENDING` bit tests became mask compares (`(flag & (X | PAUSED)) === X`), at the same cost. The no-update `else` branch gains one bit test.
- **`effect()` / `spawn()`:** one flag compare at creation.
- `notify`, `_read`, `_readAsync`, `checkRun`/`checkSingle`/`needsUpdate`, `patchDeps` and `flush` are untouched.
- **Memory:** no node fields added. The new flag bit is `FLAG_FREEZE = 1 << 27`. Bits 27-29 were free, and flags stay in Smi range. If another chain also claims bit 27, the merge needs to renumber one of them.
