# Performance Analysis: anod vs anod-ref (dynamic compute path)

## Executive Summary

The `anod-ref` benchmark uses only `compute()` and `effect()` — the "dumb" API matching
what other frameworks expose. The `anod` benchmark uses `derive()`, `watch()`, and
`transmit()` which create **stable/bound** nodes that skip dependency reconciliation
on every update.

The instruction count gap between them is massive on update-heavy benchmarks:

| Benchmark | anod | anod-ref | Δ instr | Δ% |
|---|---:|---:|---:|---:|
| Update: wide dense | 954k | 2.37M | +1.42M | **+149%** |
| Update: deep | 2.25M | 4.16M | +1.91M | **+85%** |
| Update: dynamic component | 127k | 211k | +84k | **+66%** |
| Update: large web app | 354k | 550k | +196k | **+56%** |
| Update: simple component | 4.82k | 7.98k | +3.16k | **+66%** |

The core issue is **not** a bug in the algorithm — it's that the dynamic dependency
reconciliation machinery (prescan + version-tagging + pruneDeps check) runs on
**every single update** for `compute()` nodes, even when their dependencies never
change between executions. For graphs where 95-100% of nodes have fixed deps, this
overhead dominates.

---

## 1. What the stable path avoids

When a `derive()`-created node re-executes, its `_update` takes this path:

```
_update(time):
  set FLAG_RUNNING
  try { value = fn(this, prev, args) }    ← fn calls read() per dep
  catch → store error
  clear flags, compare value, set ctime
```

And each `read()` call inside the fn exits immediately:

```
read(sender):
  value = sender.val()
  if (FLAG_STABLE && !FLAG_SETUP) → return value     ← 3 instructions, done
```

When a `compute()`-created node re-executes, `_update` takes the dynamic path:

```
_update(time):
  set FLAG_RUNNING
  prevVersion = this._version
  version = CLOCK._version += 2                       ← global object access
  this._version = version
  saveStart = VCOUNT                                   ← global access
  prevReused = REUSED                                  ← global access
  REUSED = 0

  // PRESCAN: iterate ALL existing deps
  for each dep in [dep1, deps[]]:
    v = dep._version
    if (v > VER_HEAD) → vstackSave(dep, v)             ← global access × 2
    dep._version = version - 1                         ← WRITE to dep's field

  try { value = fn(this, prev, args) }    ← fn calls read() per dep
  catch → store error

  // POST: check if deps changed
  if (REUSED !== depCount || dep1 changed || deps.length changed):
    pruneDeps(this, version, depCount)
  REUSED = prevReused                                  ← global store
  // VSTACK restore
  if (VCOUNT > saveStart):
    for i in VSTACK[saveStart..VCOUNT]: dep._version = saved
  VCOUNT = saveStart                                   ← global store
  this._version = prevVersion

  clear flags, compare value, set ctime
```

And each `read()` call does full version tracking:

```
read(sender):
  value = sender.val()
  flag = this._flag
  check stable → false (2 instructions wasted)
  version = this._version                              ← property load
  v = sender._version                                  ← property load
  check v === version → false
  check v === version - 1 → true (reuse case)
  sender._version = version                            ← WRITE to sender's field
  REUSED++                                             ← global read + write
  return value
```

---

## 2. Per-dep overhead quantification

Each dependency read in the dynamic path costs approximately **~240 extra machine
instructions** compared to the stable path. This number comes from working backwards
from observed benchmark data:

**Wide dense** (1000×5, 25 deps/node, staticFraction=1.0):
- ~244 nodes re-executed per update cycle
- 244 nodes × 25 deps = 6,100 dep-reads
- Observed instruction diff: 1.42M
- Per dep-read overhead: 1.42M / 6100 ≈ **233 extra instructions**

**Deep** (5×500, 3 deps/node, staticFraction=1.0):
- ~2,495 nodes re-executed (nearly all, because width=5 saturates immediately)
- 2,495 nodes × 3 deps = 7,485 dep-reads
- Observed instruction diff: 1.91M
- Per dep-read overhead: 1.91M / 7485 ≈ **255 extra instructions**

The ~240 instructions per dep include:
- **Prescan stamp** (~40 instr): load dep, load version, VER_HEAD compare, store stamp,
  loop overhead, hidden class checks
- **read() version tracking** (~100 instr): val() call overhead, flag load + stable check
  (fails), version loads, comparison chain, stamp write, REUSED global increment,
  function call prologue/epilogue
- **Per-node amortized overhead** (~100 instr/dep): CLOCK._version bump, VCOUNT/REUSED
  save+restore, pruneDeps condition check, version save+restore — spread across deps

---

## 3. V8 optimization barriers

### 3.1 Global state access through module context

The dynamic path accesses **6 module-level variables** on every node update:

| Variable | Access pattern | Hot path impact |
|---|---|---|
| `CLOCK` | Read ._version (RMW), ._state | Every _update, every startCompute |
| `REUSED` | Read, write, restore | Every _update (dynamic), every read() |
| `VCOUNT` | Read, write, restore | Every _update (dynamic) |
| `VER_HEAD` | Read in read() and prescan | Every read() for dynamic nodes |
| `VSTACK` | Indexed write on conflict | Occasional, but prevents optimization |

In V8, module-level `var` declarations live on the module's **context object**. Each
access requires loading the context pointer and then dereferencing the variable slot.
V8 cannot hoist these into registers across function calls because any callee (like
`read()`, `vstackSave()`, `pruneDeps()`) could modify them. This means every `REUSED++`
in `read()` is a full memory load → increment → store through the context chain.

**Impact**: For wide dense with 6,100 dep-reads, just the `REUSED++` round-trip is
~6,100 × 6 instructions = ~37k instructions. Combined with VER_HEAD reads in the
same function, that's ~60-80k instructions on global state alone.

### 3.2 _update method body size

V8's TurboFan inliner has a bytecode size budget (~460 bytes by default). The
`ComputeProto._update` method contains:

- Async dispatch branch
- Stable/bound branch (try/catch)
- Dynamic branch (version management, prescan loop, try/catch, pruneDeps check,
  VSTACK restore loop, version restore)
- Post-execution value comparison with 3-way branching

This is well over the inlining threshold. Consequences:
- `_update` is **never inlined** at call sites (`checkRun`, `start`, `val`)
- Every `_update` call has full function call overhead (~20-30 instructions for
  argument marshaling, stack frame, prologue/epilogue)
- V8's escape analysis and register allocation are scoped to `_update` alone —
  it cannot optimize across the `checkRun → _update` boundary

### 3.3 try/catch within _update

The dynamic path has a try/catch:
```javascript
try {
    value = this._fn(this, this._value, this._args);
    this._flag &= ~FLAG_ERROR;
} catch (err) {
    value = err;
    this._flag |= FLAG_ERROR;
}
```

Modern V8 (Node 20+) handles try/catch much better than older versions, but it still:
- Requires a **handler table entry** in generated code
- Forces the compiler to save/restore live variables around the try boundary
- May prevent certain **register allocator** optimizations (variables live across
  the try scope must be spill-able)

In the stable path, the same try/catch exists but the function body is much smaller,
giving the optimizer more room.

### 3.4 Polymorphic sender.val() in read()

Inside `read()`, the call `sender.val()` dispatches to either `Signal.prototype.val`
(trivial: `return this._value`) or `Compute.prototype.val` (has flag checks, may
trigger checkRun). V8 handles bimorphic inline caches well, but:

- `Compute.val()` itself is non-trivial: it checks flags, may enter idle-state
  handling, may call `checkRun` or `_update`, has a try/finally
- When `read()` calls `val()` on a PENDING compute, it triggers a recursive pull
  through `checkRun`, which may call `_update` on the dep, which calls `read()` on
  the dep's deps... This recursive chain prevents V8 from optimizing the overall
  update as a flat loop

### 3.5 Version field write contention

The prescan writes `dep._version = stamp` for every existing dep. This **writes to
the sender's own hidden-class field**, which means:
- The cache line containing the sender is dirtied
- If multiple compute nodes share the same dep (common in diamond/broad graphs),
  they write to the same memory location at different points in the execution
- The VSTACK save/restore mechanism exists specifically to handle this contention,
  adding further overhead

---

## 4. Algorithmic improvement proposals

### 4.1 Cursor-based dep tracking (eliminates prescan entirely)

**Impact: HIGH — removes O(deps) prescan + reduces per-read cost**

Replace the version-stamp prescan with a **read cursor**. Instead of pre-stamping all
deps before execution, track a cursor into the existing dep list during execution:

```javascript
ComputeProto._update = function (time) {
    let flag = this._flag;
    this._flag = (flag & ~(FLAG_STALE | FLAG_INIT | FLAG_EQUAL | FLAG_NOTEQUAL)) | FLAG_RUNNING;

    if (flag & (FLAG_ASYNC | FLAG_STREAM)) {
        return this._updateAsync(time);
    }

    let value;
    if ((flag & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE) {
        // ... unchanged stable path ...
    } else {
        // NEW: cursor-based dynamic path
        let prevVersion = this._version;
        let version = CLOCK._version += 2;
        this._version = version;
        let saveStart = VCOUNT;

        // Instead of prescanning, set cursor to 0
        // read() will advance the cursor as deps match in order
        let prevReused = REUSED;
        REUSED = 0;
        this._cursor = 0;  // new field: read index (0 = dep1, 1+ = deps[(n-1)*2])

        try {
            value = this._fn(this, this._value, this._args);
            this._flag &= ~FLAG_ERROR;
        } catch (err) {
            value = err;
            this._flag |= FLAG_ERROR;
        }

        // After fn: cursor == depCount means all deps matched in order
        let depCount = countDeps(this);
        if (this._cursor !== depCount || this._cursor !== REUSED) {
            // Deps changed — do full reconciliation
            // (only needed when cursor broke or new deps were added)
            pruneDeps(this, version, depCount);
        }
        REUSED = prevReused;
        // VSTACK restore...
        this._version = prevVersion;
    }
    // ... post-execution unchanged ...
};
```

And the modified `read()`:

```javascript
function read(sender) {
    let value = sender.val();
    let flag = this._flag;
    if ((flag & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE) {
        return value;
    }

    let version = this._version;
    let v = sender._version;
    if (v === version) {
        return value;  // re-read dedup
    }

    // NEW: cursor fast path — check if sender matches expected dep
    let cursor = this._cursor;
    if (cursor >= 0) {
        if (cursor === 0 && this._dep1 === sender) {
            // Matches dep1 — advance cursor, confirm reuse
            this._cursor = 1;
            REUSED++;
            if (v > VER_HEAD) { vstackSave(sender, v); }
            sender._version = version;
            return value;
        }
        if (cursor > 0) {
            let idx = (cursor - 1) * 2;
            let deps = this._deps;
            if (deps !== null && idx < deps.length && deps[idx] === sender) {
                this._cursor = cursor + 1;
                REUSED++;
                if (v > VER_HEAD) { vstackSave(sender, v); }
                sender._version = version;
                return value;
            }
        }
        // Cursor mismatch — deps changed order/content
        // Fall back: prescan remaining deps from cursor position onward
        this._cursor = -1;
        prescnRemaining(this, version, cursor);
    }

    // ... existing version-based new-dep handling ...
}
```

**Key insight**: For the 95%+ of nodes where deps are read in the same order every
time, the cursor check is a single **pointer comparison** (`this._dep1 === sender` or
`deps[idx] === sender`). No prescan loop. No version stamping of deps that don't
need it. No REUSED global increment for matching deps (they're confirmed by cursor
position).

**Estimated savings**: Eliminates ~40% of the per-dep overhead (the prescan) plus
reduces read() work by ~30% (cursor check replaces version chain). For wide dense:
~0.6-0.8M fewer instructions.

**Risk**: Adds a `_cursor` property to Compute/Effect, changing hidden class layout.
Needs careful handling when cursor breaks (fallback to full version-based tracking).
Adds code complexity.

### 4.2 Auto-stable detection with opt-out

**Impact: HIGHEST — makes compute() as fast as derive() for stable-dep nodes**

After the first dynamic re-execution (post-setup), if deps are unchanged, the node
is **provably stable for this particular execution**. We can optimistically set
FLAG_STABLE and only clear it if deps actually change on a future run.

```javascript
// In _update, after the dynamic path's pruneDeps check:
let depsChanged = (REUSED !== depCount || this._dep1 !== dep1 ||
    (this._deps !== null ? this._deps.length : 0) !== depsLen);

if (depsChanged) {
    pruneDeps(this, version, depCount);
} else if (!(flag & FLAG_INIT)) {
    // Second+ run with unchanged deps: promote to stable
    this._flag |= FLAG_STABLE;
}
```

And in `read()`, if the node is now stable but a dep mismatch occurs:

```javascript
// In read(), if FLAG_STABLE is set but sender doesn't match expected:
// Clear FLAG_STABLE, fall back to dynamic tracking
```

**However**, this is fundamentally unsafe for conditionally-reading nodes:

```javascript
compute(c => c.read(flag) ? c.read(a) : c.read(b))
```

If the first re-execution reads `a` (because flag is true) and we mark it stable,
then when flag becomes false, the node won't track `b` as a new dep.

**Safe variant**: Only auto-promote if the node was created **without** `Opt.DYNAMIC`
(default for `compute()`), AND the user hasn't called `c.read()` conditionally.
We could detect this via a heuristic: if `REUSED === depCount` for N consecutive
runs, promote. But N=1 is already risky.

**Recommended approach**: Add a new option `Opt.STABLE_DETECT` or make it the default
for `compute()` nodes. After the setup pass, if deps match on the next execution,
auto-set FLAG_STABLE. If a `read()` call ever encounters a dep mismatch on a
stable node, it clears FLAG_STABLE and falls back to full dynamic tracking. This gives:
- Zero overhead for the common case (static deps)
- Automatic fallback for the uncommon case (dynamic deps)
- Users who know they have dynamic deps can opt out

### 4.3 Hoist CLOCK fields to module-level variables

**Impact: MEDIUM — reduces per-access cost for the hottest fields**

```javascript
// Current:
var CLOCK = clock();
// Access: CLOCK._version (2 dereferences: context → CLOCK → _version)

// Proposed:
var CLOCK_VERSION = 1;
var CLOCK_TIME = 1;
var CLOCK_STATE = STATE_IDLE;
// Access: CLOCK_VERSION (1 dereference: context → slot)
```

This eliminates one level of indirection for the 3 most-accessed CLOCK fields.
Every `_update` call accesses `CLOCK._version` at least twice (read + write).
With ~244 nodes in wide dense, that's ~488 removed dereferences = ~2-3k fewer
instructions. Small in isolation, but it also improves **register pressure** — V8
doesn't need to keep the CLOCK pointer alive across the _update body.

**Trade-off**: Loses the ability to pass CLOCK as a parameter (used in `start(clock)`).
This can be refactored since `start()` always uses the module CLOCK anyway.

### 4.4 Split _update into fast (stable) and slow (dynamic) methods

**Impact: MEDIUM — improves V8 optimization of both paths**

```javascript
ComputeProto._update = function (time) {
    let flag = this._flag;
    this._flag = (flag & ~(FLAG_STALE | FLAG_INIT | FLAG_EQUAL | FLAG_NOTEQUAL)) | FLAG_RUNNING;
    if (flag & (FLAG_ASYNC | FLAG_STREAM)) {
        return this._updateAsync(time);
    }
    if ((flag & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE) {
        return this._updateStable(time, flag);
    }
    return this._updateDynamic(time, flag);
};

ComputeProto._updateStable = function (time, flag) {
    // Small method — V8 can inline this at checkRun call sites
    let value;
    try {
        value = (flag & FLAG_BOUND)
            ? this._fn(this._dep1.val(), this._value, this._args)
            : this._fn(this, this._value, this._args);
        this._flag &= ~FLAG_ERROR;
    } catch (err) {
        value = err;
        this._flag |= FLAG_ERROR;
    }
    // post-execution...
};

ComputeProto._updateDynamic = function (time, flag) {
    // Large method — isolated from stable path
    // ...
};
```

**Rationale**: V8 optimizes smaller functions better. The current `_update` is ~80
lines with multiple branches, try/catch, and loops. By splitting:
- `_updateStable` is small enough (~20 lines) that V8 may inline it
- `_updateDynamic` gets its own optimized compilation without polluting the
  stable path's register allocation
- The dispatcher `_update` is tiny (flag check + tail call) and definitely inlinable

**Downside**: Adds function call overhead for the dispatch. If V8 inlines the
dispatcher, this is net-positive. If not, it adds ~20 instructions per call.

**Alternative**: Instead of splitting into methods, use the cursor-based approach
(4.1) which makes the dynamic path lighter and reduces the benefit of splitting.

### 4.5 Avoid writes to sender._version in the common path

**Impact: MEDIUM — reduces cache line dirtying and instruction count**

Currently, the reuse path in `read()` writes `sender._version = version` even
when the dep is confirmed as reused. This write:
1. Dirties the sender's cache line
2. Costs ~3 instructions (hidden class check + store)
3. Is only needed so that `pruneDeps` can distinguish reused vs stale deps

With the cursor-based approach (4.1), reused-in-order deps don't need version
stamping at all — the cursor position confirms their reuse.

For deps that are confirmed by cursor, we skip:
- `sender._version = version` write (save ~3 instr per dep)
- The VER_HEAD check + vstackSave (save ~5 instr per dep)
- `REUSED++` global increment (save ~6 instr per dep)

That's ~14 instructions per dep for the cursor fast path. For wide dense with
6,100 dep-reads: ~85k fewer instructions.

### 4.6 Local caching of globals in _update

**Impact: LOW-MEDIUM — reduces global access cost**

In the dynamic _update path, cache frequently-used globals in locals before
the hot section:

```javascript
// Current: REUSED accessed through module context in read()
// The issue: REUSED is read/written in read(), which is a separate function

// For the prescan loop, we can cache:
let localVcount = VCOUNT;
// ... do prescan using localVcount ...
VCOUNT = localVcount;
```

**Problem**: This only helps for the prescan loop within `_update` itself. The
`read()` function is called separately and must access the real `REUSED` and
`VCOUNT` globals. We can't pass locals across the `_update → fn → read()` boundary
without changing `read()`'s interface.

**Possible mitigation**: Store the reuse counter on the node itself during execution:

```javascript
// In _update before fn call:
this._reused = 0;
// In read(): this._reused++ instead of REUSED++
// After fn call: check this._reused
```

This replaces a module-context access (2 dereferences) with a property access on
`this` (1 dereference, and `this` is likely already in a register). But it adds a
property to the hidden class.

**Alternatively**, since `read()` already loads `this._flag` and `this._version`, the
node is in L1 cache. Adding `_reused` as a node field accessed in `read()` would be
fast.

---

## 5. Why anod-ref is slower than alien-signals too

A striking observation from the benchmarks:

| Benchmark | alien-signals | anod-ref | anod-ref vs alien |
|---|---:|---:|---:|
| Update: wide dense | 1.62M | 2.37M | **+46%** |
| Update: deep | 2.94M | 4.16M | **+42%** |
| Update: large web app | 416k | 550k | **+32%** |

Anod-ref is **not just slower than anod** — it's significantly slower than
alien-signals too. Both use dynamic dependency tracking, but anod's implementation
has higher per-dep overhead.

The key differences in anod's approach:

1. **Version-stamp prescan**: anod writes `dep._version = stamp` for ALL existing
   deps before execution. alien-signals likely doesn't do this.

2. **VSTACK conflict resolution**: The version-stamping system requires a conflict
   stack for concurrent node execution. This adds overhead even when no conflicts
   occur (VER_HEAD check on every read).

3. **Global state coupling**: REUSED, VCOUNT, VER_HEAD, VSTACK are module globals
   that create cross-function data dependencies. Other frameworks may use node-local
   tracking.

4. **Dual-pass dep processing**: prescan (stamp all deps) → execute (read all deps
   again) → post-check. That's effectively two iterations over the dep list, where
   frameworks with simpler tracking may need only one.

This suggests that **the version-tagging algorithm itself is the bottleneck**, not
just the presence of dynamic tracking. The cursor-based approach (4.1) would address
this by reducing to a single pass with O(1) per-dep overhead.

---

## 6. Recommendations ranked by impact

| # | Change | Instruction savings (wide dense est.) | Complexity | Risk |
|---|---|---:|---|---|
| 1 | Cursor-based dep tracking (4.1) | ~600-800k | High | Medium |
| 2 | Auto-stable with fallback (4.2) | ~1.42M (eliminates gap) | Medium | Medium |
| 3 | Split _update methods (4.4) | ~50-100k | Low | Low |
| 4 | Hoist CLOCK fields (4.3) | ~20-50k | Low | Low |
| 5 | Skip version writes for cursor-confirmed deps (4.5) | ~85k | Medium (requires 4.1) | Low |
| 6 | Node-local reuse counter (4.6) | ~40-60k | Low | Low |

**Recommendation**: Start with **(4.2) auto-stable detection** as it provides the
largest single improvement and is relatively simple. Combine with **(4.4) split
_update** for better V8 optimization of both paths. These two changes together should
close most of the gap.

If closing the gap with alien-signals is also a goal, **(4.1) cursor-based tracking**
is the architectural change needed — it attacks the root cause (the prescan) rather
than working around it.

---

## 7. Profile of "Update: wide dense" execution

```
setupDynUpdate(1000, 5, 1, 25, 1)
  width=1000, layers=5, staticFraction=1.0, nSources=25, readAll

Per iteration:
  1. batch → source[i % 1000].set(newValue)
  2. notify cascade: marks ~25 layer-1 nodes STALE,
     PENDING propagates through layers 2-4
     Affected cone: ~25 → ~49 → ~73 → ~97 nodes
  3. start() loop: processes signal queue (1 signal), no effects queued
  4. First val() loop: reads all 1000 leaves
     - 903 clean leaves: val() → immediate return (~20 instr each)
     - 97 PENDING leaves: val() → checkRun → recursive pull through layers
       → triggers _update on ~244 nodes total
  5. Second val() loop: all clean now, just reads values

Cost breakdown (dynamic path):                      estimated instructions
  notify cascade                                          ~3k
  start() loop overhead                                   ~1k
  903 clean leaf val() calls                             ~18k
  checkRun recursion (dep walking, flag checks)         ~100k
  244 × _update (prescan + fn + version mgmt)           ~530k    ← BOTTLENECK
  244 × 25 × read() calls in user fns                  ~430k    ← BOTTLENECK
  Second val() loop                                      ~20k
  batch/signal/misc overhead                              ~10k
                                                 ─────────────
  Total estimate                                       ~1.11M
  Observed                                              2.37M
  (gap due to underestimated per-instr costs in V8 codegen)

Cost breakdown (stable path):
  notify + start + clean vals                            ~22k
  checkRun recursion                                    ~100k
  244 × _update (simple try/catch)                      ~130k
  244 × 25 × read() calls (early exit)                 ~220k
  Second loop + misc                                     ~30k
                                                 ─────────────
  Total estimate                                       ~502k
  Observed                                              954k
```

The _update + read() combination accounts for **~80% of the instruction gap**.
The prescan alone accounts for ~25% of the dynamic _update cost.

---

## 8. Appendix: Benchmark parameter reference

| Benchmark | Width | Layers | Static% | Deps/node | Read% |
|---|---:|---:|---:|---:|---:|
| simple component | 10 | 5 | 100% | 2 | 20% |
| dynamic component | 10 | 10 | 75% | 6 | 20% |
| large web app | 1000 | 12 | 95% | 4 | 100% |
| wide dense | 1000 | 5 | 100% | 25 | 100% |
| deep | 5 | 500 | 100% | 3 | 100% |
| very dynamic | 100 | 15 | 50% | 6 | 100% |

The "wide dense" benchmark is the worst case because it combines:
- High dep count (25) → maximizes prescan and per-read overhead
- 100% static → all overhead is wasted (deps never change)
- 100% read → every leaf is pulled, maximizing total work
