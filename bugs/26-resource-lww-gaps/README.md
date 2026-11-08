# 26: Resource last-write-wins gaps

Tests on `fix/23-hardening`. Fixed on `fix/24-slim-cold`, together with bug 23: the callback form by D5, the rest by the split below.

## What breaks

Fix 18 made an idle plain `r.set(v)` supersede an async write in flight. Several other ways of writing a plain value still lose to the stale result:

- `batch(() => r.set(v))` and `r.post(v)`: `loading` stays true, then the server result overwrites `v`.
- An idle `cx.set(r, v)` from a spawn continuation: the same.
- A plain write after an async generator's first `yield`: a later `yield` overwrites it.
- A plain write after the first `resolve` of the callback form `rc.suspend((resolve) => ...)`: a later `resolve` overwrites it.

```js
r.set("b", async (rc) => await rc.suspend(d.promise));
batch(() => r.set("plain"));
r.loading;          // true, expected false
d.resolve("server");
// later: r.get() === "server", expected "plain"
```

## Root cause

Supersession works by bumping the activation token `Cell._time`. An idle plain `set` bumps it only when FLAG_LOADING is set (`src/internal.js:611`):

- **Queued writes:** `assign` (`:724`) neither bumps `_time` nor ends loading. Fix 18 left this under "Not covered" until chains A and B merged, and they have now merged.
- **Idle `contextSet`** (`:2396`): the same, also left under "Not covered" in fix 18.
- **Generator:** after the first yield FLAG_LOADING is cleared, but the iterator keeps running under the same token. The plain write sees no loading flag and doesn't bump `_time`, so the next yield still matches.
- **Callback form:** after the first `resolve` FLAG_LOADING is cleared, but the resolve function stays valid for the same token. Whether a second `resolve` should be accepted at all is design question D5. Either way, a newer write must win.

## What anod should do

Last write wins, on every write path. A plain write to a resource supersedes every activation that could still produce a value: in flight, mid-generator, or holding a callback resolver. It ends loading and discards any later result from those activations.

## Tests (8)

- `test/explore/hardening.test.js` › 26 › a batched plain write during an in-flight async write is not overwritten
- `test/explore/hardening.test.js` › 26 › a posted plain write during an in-flight async write is not overwritten
- `test/explore/hardening.test.js` › 26 › a batched plain write of the optimistic value still ends loading (added with the fix)
- `test/explore/hardening.test.js` › 26 › a task waiting on a resource resumes with a batched plain write (added with the fix)
- `test/explore/hardening.test.js` › 26 › a contextual write from a running effect ends loading without re-running it (added with the fix)
- `test/explore/hardening.test.js` › 26 › an idle c.set(r, v) during an in-flight async write is not overwritten
- `test/explore/hardening.test.js` › 26 › a plain write after a generator's first yield is not overwritten by a later yield
- `test/explore/hardening.test.js` › 26 › a plain write is not overwritten by a late resolve of the callback form

Run with `bun test --conditions=src test/explore/hardening.test.js`.

## Notes for the fix

- The simplest rule is that every plain write to a resource bumps `_time`, not just a write while loading. `_time` has no other meaning on a Cell. The cost is a FLAG_ASYNC test on a path that plain signals can skip. Alternatively, keep a flag for "an activation may still write" (set while a generator is unfinished or a callback resolver is live) and test it next to FLAG_LOADING.
- `assign` must not supersede the optimistic write of `asyncAssign`, which goes through it (fix 18's note).
- Bug 23 touches the same three write paths (`set`, `assign`, `contextSet`), so fix the two together.

## Fix

The resource paths were split out of `set()` and `post()`, which now serve plain signals only. Every plain resource write, idle or queued, goes through `writeResource()`.

- `SignalProto.set` / `SignalProto.post`: no `FLAG_ASYNC` branch and no `asyncFn` parameter. They keep the `_equal` test, since a `signal(v, equal)` Cell delegates to them. `set()` went from 523 to 219 bytes of bytecode in dist, under V8's 460-byte inlining limit (`max-inlined-bytecode-size`).
- `CellProto.set` / `CellProto.post`: a Cell without `FLAG_ASYNC` (a signal with an equality function) calls `set` / `post`. A resource routes by form: `r.set(fn)` to `_runAsync` or `asyncRun`, `r.set(v, fn)` to the idle optimistic write or `asyncAssign`, and a plain value to `writeResource()`. The idle optimistic write is the old code moved, except that it treats an errored resource as changed (bug 23), and a mutable updater that returns void now passes the current value to `fn` as `prev` instead of `undefined`. No new constructor, so sender call sites see the same maps as before.
- `writeResource(node, value)`: resolves an updater (only a contextual write passes one, since `r.set(fn)` is the async form) and compares. Then, when idle, it cancels the posts queued before it, as `set()` does. It bumps `_time`, so every activation started earlier is orphaned: in flight, past a generator's first `yield`, or holding a callback resolver. If the value changed, it writes it, clears `FLAG_LOADING | FLAG_ERROR`, and resumes the waiters or notifies. It does not flush. The idle caller flushes, and in the drain the running flush carries on. Its signature fits the drain, so `schedule(node, value, writeResource)` uses it directly.
- Queued writes: a plain write inside a batch or a flush, and every `r.post(v)`, is queued even when unchanged, because it still supersedes. `post` returns true for it.
- `guardedAssign` (contextual writes in the drain) dispatches a resource's plain write to `writeResource()`. The idle branch of `contextSet` pauses the receiver around `writeResource()`, and unguards before it flushes. Unguarding is the new helper `release()`, which the signal branch now uses too. A throw from the updater or the equality function still unguards.
- `settleNotify` skips `FLAG_PAUSED` receivers, as `notify` does. Before, a settle with waiters queued the receiver a contextual write had paused.

Benchmark (`bench/reactivity/anod.js`, median of 3 interleaved runs against `master`): Kairo "repeated observers" −4.9% and "avoidable propagation" −4.1%, both in every run, which fits `set()` inlining again. Everything else is within ±2%. CellX and $mol_wire came out 1.7% and 2.2% slower. A re-run of just those two, 5 rounds each with the branch running first, gave +0.4% and +0.2% with overlapping ranges, so that was noise.

### Behavior decisions

- **Every plain write supersedes, even an unchanged one.** A plain write equal to the current value, on a resource that isn't loading or errored, returns false and notifies nothing, but it still bumps `_time`, so a generator past its first yield stops writing. The alternative, bumping only on a change, would let an earlier activation overwrite a later write because the two happened to be equal.
- **`c.set(r, fn)` stays an updater**, as typed in `Context.set`, which also types the two-argument updater as `(prev) => T`. `Resource.set` typed it as `(c, current) => T`, while the engine calls it with the current value only; the type now matches. Only `r.set(fn)` / `r.post(fn)` are the async form.
