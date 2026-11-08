# Simplifying `src/internal.js`

A scan of the whole engine for duplicated code, functions that could merge, dead code and redundant checks. It was done before the round 2 bug fixes, so each fix lands in one place instead of several copies.

**Baseline (master, 2026-11-07):**

- `src/internal.js` is 5,494 lines: about 3,480 code, 1,740 comment and 280 blank.
- `dist/internal.js` is 29.8 KB raw and 9.7 KB gzipped.

Comments don't reach dist, so the bundle only shrinks with code.

**Estimate:** about 700–800 code lines can go (20–23% of the code):

- about 430 on cold paths (async runtime, errors, pause/resume, teardown), with no performance risk;
- about 300 more on hot paths, each gated by a benchmark (`bench/reactivity/anod.js`, plus mount/unmount);
- about 45 more if `checkSingle`/FLAG_SINGLE goes, which is not recommended without a neutral benchmark.

The estimates count code lines, without comments, after removing the overlap between the four reviewed sections. Line numbers refer to master.

## Progress on `fix/24-slim-cold`

Done, cold paths only: group 4, 5, 6 and 8, and most of 1 and 14. Also the cold parts of 2 (one guarded drain handler), the `equal()` one-liner from 13, and the stale comments. The bug fixes landed in the merged code.

- `src/internal.js`: 3,477 → 3,221 code lines (−256) after this cold round, 1,738 → 1,716 comment lines. The hot-path fixes that followed (the resource write split, D9's held stack, the bound checks of D4, the weak release, D2, the flush's `try`) brought it back to 3,479 code lines and 1,869 comment lines.
- `dist/internal.js`: 29.8 → 27.4 KB raw, 9.7 → 9.4 KB gzipped after the cold round; 29.4 KB raw and 10.0 KB gzipped with every fix in.
- `bench/reactivity/anod.js`, medians of 3 interleaved runs against master: within noise everywhere (mean +0.7% on `min`).
- **Group 1, partly:** `checkStale`, `isCurrent` and the one-shot `resolvePromise` replaced the three guard copies. The promise guards of `suspend()` and `CellProto.suspend` stay inline: routing them through `guardAwait` made two GC tests in `suspend.test.js` flaky under Bun. Bun runs on JSC, whose conservative stack scan appears to keep a dead promise alive depending on code layout. Merging the resource one alone broke a test that never touches resources.
- **Group 6:** `_error` is shared by Cell and Compute only. The effect's version throws while the fn runs (D7).
- **Group 14:** `SignalProto._drop/_refresh/_update` are unreachable on a signal, but they **stay**: removing them slowed Kairo diamond and triangle by about 10% (bisected, and confirmed by restoring them). The patchDeps `|= FLAG_SINGLE` branch and the unused `time` parameters are hot-path code, so they stay for now.

Still open: 2 (hot half), 3, 7, 9–12, 15, the rest of 13, and the flush leads below.

## Summary

| # | Group | Lines | Perf risk | Planned fixes it absorbs |
| --- | --- | --- | --- | --- |
| 1 | One staleness guard for every async settle | ~100 | none | D5 one-shot, bug 34, lock owner inheritance |
| 2 | One write path family | ~90 | `set`/`assign`: benchmark | bugs 23, 26 |
| 3 | One tracking decision for reads | ~40 | `val`: benchmark | bugs 24, 36 |
| 4 | One async dispatch | ~25 | none | bug 27 |
| 5 | Plain arrays for the cold Channel fields | ~75 | none | bug 32 |
| 6 | Waiter wake-up and settle tails | ~50 | none | bug 30 |
| 7 | One teardown helper | ~35 | mount/unmount: benchmark | D1, D2, bug 35 |
| 8 | Recursive pause/resume | ~40 | none | D3 |
| 9 | One idle-transaction wrapper | ~25 | `get`: benchmark | bug 34 |
| 10 | Two factories instead of four | ~50 | creation: benchmark | D3 |
| 11 | Shared parts of the two `_update` bodies | ~45 | benchmark | bug 38 |
| 12 | Pull walkers (`checkRun`, `needsUpdate`) | ~37 | benchmark (removes work) | — |
| 13 | Small merges | ~40 | none | — |
| 14 | Removals (decided, or dead) | ~50 | none | D8 |
| 15 | Trim the `anod/internal` exports | ~30 | none (API decision) | — |

## Groups

### 1. One staleness guard for every async settle

**Copies:**

- the callback suspend's resolve/reject (1411–1450);
- the Cell callback (2023–2038);
- `resolvePromise` (4342–4381);
- `resolveIterator` (4398–4459, four copies);
- the promise paths of `suspend` (1459–1480) and `CellProto.suspend` (2045–2058), which repeat `guardAwait` (1554–1578).

That is six copies of the same 14-line guard: wrong `_time`, disposed-unless-locked, STALE, then PENDING with `needsUpdate`.

**Proposal:**

- `current(node, time)` returns whether the activation may still settle, and marks the node STALE when `needsUpdate` says so.
- `resolvePromise(node, source, time)` builds the ok/fail pair once, for both promises and callback sources.
- Both promise suspends become `guardAwait(node, Promise.resolve(p))`.

A Cell is never LOCKED, STALE or PENDING, so the shared guard is exact for it too.

**What it absorbs:** the one-shot callbacks of D5 become a single `done` flag, the guard's idle `needsUpdate` (bug 34) is fixed in one place, and the lock owner inheritance touches only `current`.

### 2. One write path family

**Copies:**

- the updater resolution (value, `write`, and a mutable updater returning void) in `set` (600), `assign` (727) and `contextSet` (2403);
- the `MUTABLE || equal` comparison, six times (619, 652, 700, 736, 2188, 2413);
- `set`'s queued tail, repeated by `post` (2167–2203) plus a microtask kick that is itself written three times;
- `guardedAssign` and `guardedAsyncAssign` (2348–2381), which differ only in the inner call.

**Proposal:**

- `resolveValue(node, value)`, `differs(node, value)`, `enqueue(node, value, asyncFn)`, `requestFlush()`;
- one guarded handler with one payload shape `{_recv, _value, _fn}`;
- one immediate resource writer, shared by `set`'s resource branch and the idle branch of `contextSet`;
- `_runAsync` always takes `node._value` as `prev`, so `asyncRun` goes.

`set` keeps only the plain-signal path inline, so its bytecode shrinks well under the 460-byte inlining budget. It still needs a benchmark.

**What it absorbs:** bugs 23 and 26 ("clear the error and bump `_time` on every write path") become one change, not three. It also removes an inconsistency: the idle `contextSet` passes the resolved value as `prev`, while the drain passes `node._value`.

### 3. One tracking decision for reads

**The problem:** four places decide on their own whether a read tracks (stamps) or subscribes, each with a different mask:

- `val`/`_readAsync` (516, 878);
- `rejected` (1945);
- `track` (3386), used by `_suspendTask`'s fast path;
- `subscribeArray`.

`track` and `_readAsync` ignore FLAG_FREEZE, which is bug 36.

**Proposal:**

- `val` calls `track` after its refresh, so one copy of the tail is left.
- `rejected` becomes "refresh, then track, then return the error or null".
- `pending` folds its single and array branches.

**What it absorbs:** bug 24 (route to `_readAsync` only when `LOADING && !CALLBACK`) then lands in one place. `val` is hot, so benchmark it; the operations are the same, and the bytecode gets smaller.

### 4. One async dispatch

**Copies:** `asyncKind` (4322) plus three dispatch blocks, in `_runAsync` (691), `ComputeProto._update` (2823) and `EffectProto._update` (3050).

**Proposal:** `startAsync(node, value, time)` returns a boolean. It sets LOADING and starts `resolvePromise` or `resolveIterator`. On a sync result it calls `settleDefers`. This removes:

- the `ASYNC_*` constants and their exports;
- the raw-iterator fallback in `resolveIterator` (4392–4395), which is unreachable.

**What it absorbs:** the Compute's FLAG_CALLBACK finish block (2806–2822) moves into it, so bug 27 can give effects the same deferral without copying it.

### 5. Plain arrays for the cold Channel fields

The "one inline value, array from the second" pattern earns its keep on `_sub1/_subs` and `_dep1/_deps`. On the Channel it only adds branches:

- **Defers:** merge `_defer1/_defer1val/_defers` into one `_defers` array. That shrinks `defer`, `settleDefers` and `resetChannel`. `settleDeps` (4612–4720) loses its duplicated defer1 branch, and the five "has defers" tests become one-liners.
- **Responds:** merge `_res1/_responds`, used by `send`, `clearChannel` and `clearRespond`.
- **Cell channel:** drop `CellProto._channel` (1994) and use `new Channel()`, which also makes `_waiters` access monomorphic.
- **`_changed`:** inline it as `sender._value !== snapshot`. Signal and Compute share one implementation, and its JSDoc is written twice.
- **Helper parameters:** inline `addWaiter` (one caller), and drop parameters that are always `node._chan`.

**What it absorbs:** bug 32 ("`settleDeps` must not subscribe disposed senders") lands in the single loop.

### 6. Waiter wake-up and settle tails

- **`settleNotify(node, quiet)`.** Its `waiterCount`, `value` and `isError` arguments can always be derived from the node. All three callers (2075, 2553, 2813) detach the waiters in the same way, which can move inside it. FLAG_WAITER is set exactly when `_waiters !== null`, so it can be the only test.
- **`rejectWaiters` always queues.** The deliver-now branch (4910–4917) is unreachable: every dispose runs under FLUSHING or TEARING. Coverage confirms it.
- **One `_error`.** It is identical on Compute, Effect and Cell (2094, 2597, 3137).
- **Settle tails.** In `ComputeProto._settle`, merge the two `changed` writes. Share the locked-replay test between the two `_settle`s, once bug 34 makes both queue and flush.

**What it absorbs:** bug 30 (`c.equal()` honored in `_settle`) touches the merged `changed` logic.

### 7. One teardown helper

**The problem:** `EffectProto._update` (2935), `EffectProto._dispose` (3157) and `RootProto._dispose` (2104) each tear down owned children and cleanups, and only the two `_dispose`s protect against a throw.

**Proposal:**

- `clearRun(node)` does it once, children first: `try { clearOwned } finally { _recover = null; clearCleanup }`.
- The channel blocks of both `_dispose`s become `resetChannel`.
- `tryRecover`/`_checkRecover` become one loop, with the `clearFinalize` that every caller runs first folded in.

**What it absorbs:** D2 (children first) and bug 35 are this change. D1 (abort controllers on every effect re-run) collapses the effect head to the compute's form. Benchmark mount/unmount.

### 8. Recursive pause/resume

**The problem:** `pause`/`pauseOwned`/`resumeEffect`/`resumeRoot`/`resumeOwned` (1247–1367, about 90 lines) repeat the same body three times.

**Proposal:** recursive `pauseNode` and `resumeNode`, one `resume()` on both protos, and queueing through `node._receive()`. `enqueueScope` is then left with one caller.

**What it absorbs:** D3 (children created under a paused owner start paused) and the resume half of bug 34.

### 9. One idle-transaction wrapper

**The problem:** `startCompute` (5007), `deferEffect` (5115) and `ComputeProto.get` (2264) each do IDLE=false, `FENCE = SEED`, pull, then flush if anything is queued.

**Proposal:** one `refresh(node)`.

**What it absorbs:** it is also the tool bug 34 needs: anything that runs a node fn while idle goes through it.

### 10. Two factories instead of four

**The problem:** `compute` is the same as `task`, and `effect` the same as `spawn`, except for FLAG_ASYNC (3218–3369, 112 lines).

**Proposal:** `makeCompute(owner, async, ...)` and `makeEffect(owner, async, ...)` with two-line wrappers. Don't merge compute with effect: they have different constructors, levels and start paths.

**What it absorbs:** "children start paused" then goes in two places, not four. Benchmark creation.

### 11. Shared parts of the two `_update` bodies

**The duplication:**

- the tracking prologue (Compute 2706–2724, Effect 2972–2991);
- the epilogue, which is 33 identical lines each (2751–2785 and 3007–3040): setup DSTACK slice, FLAG_SINGLE, `patchDeps`, VSTACK and STAMP restore;
- the bound/unbound call, written four times (a stable and a dynamic copy in each body).

**Proposal:**

- One call site per body, guarded by a `track` boolean (about 24 lines).
- One `endTrack(...)` epilogue helper (about 31 lines). The lower-risk alternative is to extract only `linkSetup(node)` and `restoreStamps(base)` (about 17 lines).

**Avoid** a full `runFn` helper. The error handling (catch vs propagate) and the fn arity differ, and at about 60 lines it wouldn't inline, which would put a call on every run of every node.

**What it absorbs:** the shared call site fixes bug 38. Needs a benchmark.

### 12. Pull walkers

- **`checkRun`:** the ascend loop's resume re-checks (4177–4188) are always false, because the ascend just tested the same condition. Storing the next scan index instead of `resumeFrom` merges both resume branches. It also leaves two push sites instead of three. About 25 lines, and it removes work. Benchmark it.
- **`needsUpdate`:** the dep1 body and the `_deps` loop body are duplicates (4044–4081). A `pullDep` helper saves about 12 lines but adds a call frame. Benchmark it.
- **Not recommended:** removing `checkSingle` and FLAG_SINGLE (about 45 lines: `checkRun`'s fast descent already handles single-dep chains). Only do it if a benchmark shows it is neutral.

### 13. Small merges

- `append(list, fn)` for `cleanup`, `recover` and `finalize` (1079, 1096, 1164).
- `flagGetter(bit)` for the getter descriptors (1030–1057).
- A constant for the "Cannot call suspend() with callbacks" message, which appears three times.
- `equal()` as a one-liner.
- Chain-assign the `val`/`set`/`post` protos.
- `dropSenders()` in `flush`: the sender-drop loop appears twice.
- Move the PURGES drain into the DISPOSES block, its only producer. This also fixes the stranded-owner lead below.

### 14. Removals (decided, or dead)

- **D8:**
  - delete `SignalProto.dispose`/`_dispose` and `CellProto.dispose`/`_dispose` (2231–2254);
  - delete the DISPOSED checks in `set`, `post`, `contextSet`, `contextPost` and `CellProto._settle`/`suspend`;
  - delete the Signal `disposed` getter and `SignalProto._owner`.
- **Dead code:**
  - the Signal NOOPs `_drop`/`_refresh`/`_update` (972–974);
  - `resolve = resolve; reject = reject;` in `send` (4788);
  - the `ch !== null` check (2556);
  - the patchDeps `|= FLAG_SINGLE` branch (3864);
  - the unused `time` parameter of `assign`, `asyncAssign`, `asyncRun`, `poke` and the guarded handlers.
- **`EffectProto.equal` (1175):** a dead API. It isn't declared in `EffectContext`, and nothing reads EQUAL or NOTEQUAL on effects. Delete it, or declare it and give it meaning.

### 15. Trim the `anod/internal` exports

Several exports are unused anywhere in src or tests:

- FLAG_VISIT, FLAG_PURGE, CINDEX and `ASYNC_*`;
- every exported `var` scalar (VCOUNT, REUSED, CTOP, DCOUNT, DBASE, TIME, IDLE, FLUSHING, POSTING, SEED, STAMP, FENCE and the `*_COUNT` values).

ES imports are read-only live bindings, so outside code can read these scalars but never advance a queue. The list is also inconsistent: CMARK, REJECTS, REJECT_COUNT and TEARING are not exported. Trimming saves about 30 lines plus the d.ts entries, but it changes a public subpath, so it is an API decision.

## Features by code cost

These are not recommendations, only what each feature costs, in code lines of its main functions. It's useful if you want to decide whether a feature pays for itself.

| Feature | Code lines | Notes |
| --- | --- | --- |
| Channel waiters (await a task or resource) | ~200 | Core of `c.suspend(task)`. Shrinks with groups 5 and 6. |
| Callback and task suspend | ~175 | Shrinks with group 1. |
| `c.defer()` | ~115 | `defer`, `settleDeps`, `settleDefers` and the Channel fields. |
| Array suspend | ~100 | `_suspendArray`, `_stepArray`, `subscribeArray`. One shared scan saves about 30. |
| `contextSet` guard | ~95 | The FLAG_PAUSED dance on the writer, plus `unguard`. Shrinks with group 2. |
| pause/resume | ~90 | Group 8 roughly halves it. |
| Async generators | ~75 | `resolveIterator` and `asyncKind`. |
| `post` / `c.post` | ~65 | Group 2 removes most of it. |
| lock/unlock | ~20 | Will grow with owner inheritance and `dispose(true)`. |

## Stale comments to fix along the way

| Line | Says | Actually |
| --- | --- | --- |
| 16–18 | flag bits 7 and up are free on a plain Signal | `set`/`post` read FLAG_ASYNC/LOADING |
| 90–96 | the ILLEGAL_READ doc describes a different error | — |
| 229 | SENDERS holds a "writable Compute" | — |
| 556 | `set` handles "Signal, Resource, and Compute" | — |
| 713–718 | `assign` handles "_ctime, FLAG_INIT for Compute" | — |
| 797 | `schedule` is "Used by extension packages" | it isn't exported |
| 837, 841 | `_read` mentions RVER and `_version` | — |
| 1184 | `refuse` is "Named `fail`" | — |
| 1497 | IAwaiter/IResponder | Resolver/IChannel |
| 1583, 1587 | `addWaiter`, `resolveWaiters` | `send`, `settleNotify` |
| 2896–2902 | a JSDoc for `val` | misplaced |
| 3069–3070 | FLAG_CALLBACK is unused on effects | `suspend` sets it |
| 3586–3589 | `refreshDep1` | doesn't exist |
| 3655–3658 | `addOwned` runs after the factory returns | it runs before start |
| 3822–3831 | `patchDeps` mentions `_depCount`, `execVersion`, `_vstack`, "no separate restore loop" | all out of date |
| 5135 | `flushEffects` returns an "error POJO" | it returns a Defect |
| `ComputeProto._settle` doc | an `err \|\| { error: err }` guard | doesn't exist |
| `version()` doc | "increments on each re-run" | returns the activation's global TIME |
| README "Limitations" | tombstones | design doc note: two-way slots |

## Bugs found during the scan

Filed with tests:

- **36:** `c.suspend(task)` after `c.stable()` drops the task.
- **37:** a cleanup error that is already a Defect is wrapped again.
- **38:** a bound effect with `OPT_SETUP` that reads its own dep is linked twice.

These leads come from code reading and are not verified yet. They are all in the "error escapes a flush" family, so check them while fixing bug 33:

- `flush`'s `finally` (5338–5355) zeroes the queues inconsistently. It resets DISPOSER, SENDER, SCOPE, RECEIVER and PURGE counts, but not COMPUTE_COUNT, `LEVELS[i]` or REJECT_COUNT. It never clears FLAG_PURGE or the PURGES slots, so owners queued for compaction in an aborted flush are never compacted again.
- The COMPUTES phase runs `_update` without `FENCE = SEED`, unlike `flushEffects`.
- `settleNotify` and `settleDeps` write SEED stamps even when they run nested inside a running compute (2818 → deliver → relay → `_settle`). That can overwrite the outer run's stamps, the same hazard `settleDefers`' comment avoids.
- `EffectProto._settle` dedups deps only when defers exist; `ComputeProto._settle` dedups whenever `_deps` is non-null.

## Suggested order

1. **Pure deletions:** group 14 and the dead branches. No behavior change, so the current tests are the safety net.
2. **Cold-path refactors where planned fixes land:** groups 1, 4, 5, 6, 8 and the cold half of 2 (`contextSet`, `post`, guarded handlers). Then fix bugs 23, 26, 27, 30, 32 and 34 in the merged code. Each round 2 test turns green in one place instead of several copies.
3. **Teardown:** group 7, together with D1, D2 and bug 35, and the lock owner inheritance after it.
4. **Hot-path items**, one at a time, each behind a benchmark: group 3 with bugs 24 and 36, then group 9, the hot half of 2, and groups 10, 11 and 12. Use 3 interleaved runs of `bench/reactivity/anod.js` plus mount/unmount, and check `SignalProto.set`'s bytecode size.
5. **Group 15** whenever you decide on the `anod/internal` API.
