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

_Not fixed yet. The fix branch fills this in._
