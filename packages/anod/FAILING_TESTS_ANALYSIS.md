# Failing Tests Analysis (Round 3)

**Unit tests:** 59/59 pass (both src and dist)
**Benchmarks:** `dynUpdateVeryDynamic` crashes in `_reconcile` — the only remaining failure blocking both `anod.js` and `anod-ref.js`.

All other benchmarks (deep, broad, diamond, triangle, mux, unstable, avoidable, repeatedObservers, cellx10, molWire, createComputations1k, dynBuildSimple, dynBuildLargeWebApp, dynUpdateSimple, dynUpdateDynamic, dynUpdateLargeWebApp, dynUpdateWideDense, dynUpdateDeep) pass validation.

---

## The Crash

```
TypeError: Cannot read properties of null (reading '_slot')
    at Compute._reconcile (signal.js:1536)
```

Line 1536 in `_reconcile`:
```js
if (deps[index]._slot === append || !(deps[index + 1] & MISSING))
```

`deps[index]` is `null`. The `index` was stored by `_search` and points into the appended region of `deps` where a previous `_search` call had pushed a `[null, cursor]` placeholder.

---

## Root Cause: `_search` FOUND-loop advances cursor past `oldlen`

**File:** `src/core/signal.js` — `_search()` (lines 1128–1175)

### The bug in detail

`_search` has a FOUND-loop (lines 1133–1141) that skips over entries already matched by previous out-of-order reads:

```js
function _search(sender) {
    let deps = this._deps;
    let cursor = this._time;
    let oldlen = this._dep1slot;
    let reuse = cursor < oldlen;          // ← computed BEFORE the FOUND loop
    if (reuse && deps[cursor + 1] & FOUND) {
        do {
            deps[cursor + 1] &= ~FOUND;
            cursor += 2;                  // ← can advance past oldlen!
        } while (cursor < oldlen && deps[cursor + 1] & FOUND);
        if (deps[cursor] === sender) {    // ← may read from appended region
            this._time = cursor + 2;
            return;
        }
    }
    // ... skip-one-ahead check, slot lookup ...
    if (reuse) {                          // ← still true (pre-loop value!)
        this._time = cursor + 2;          // ← sets _time past oldlen
        deps.push(sender, cursor);        // ← stores cursor pointing to appended null
    }
}
```

**The sequence:**

1. The FOUND-loop advances `cursor` from within the old region to exactly `oldlen` (or beyond, if all remaining old entries were FOUND-flagged).

2. `reuse` was computed as `true` before the loop ran (original cursor was < oldlen). It's never re-checked.

3. The sender isn't found via skip-one-ahead (bounds check fails since cursor is at/past oldlen) or via slot lookup.

4. Since `reuse` is `true`, `_search` executes:
   ```js
   this._time = cursor + 2;       // _time = oldlen + 2 (past old region)
   deps.push(sender, cursor);     // index = oldlen (into appended region)
   ```

5. `deps[oldlen]` is a `null` that was pushed by a prior `_search` call's skip-one-ahead (`deps.push(null, ...)` at line 1146).

6. When `_reconcile` later processes the appended entry and dereferences `deps[index]` at line 1536, it hits `null._slot` → crash.

### Concrete trace

Old deps (oldlen=8): `[A, slotA, B, slotB, C, slotC, D, slotD]`

Re-execution reads: A, C, D (then later E and F out of order)

1. `read(A)` → match at 0. `_time=2`.
2. `read(C)` → miss, `_search(C)`. Skip-one-ahead at (2,4). Push `[null, 2]`. `_time=6`.
3. `read(D)` → match at 6. `_time=8` (= oldlen).
4. Deps now: `[A,sa, B,sb|M, C,sc, D,sd, null, 2]`
5. Some out-of-order read marks D (slot 6) with FOUND.
6. `read(F)` → miss, `_search(F)`. cursor=8. cursor ≥ oldlen → `reuse=false`. Falls to `deps.push(F, -1)`. Fine.

But with a more complex interleaving where FOUND entries accumulate:

1. Several deps are matched via the slot-lookup path in `_search`, flagging them FOUND.
2. A later `_search` enters the FOUND-loop with `cursor < oldlen`, loops through all FOUND entries, and exits with `cursor = oldlen`.
3. The sender isn't in old deps → falls to the `reuse` branch → stores `cursor = oldlen` as index, which points to the appended null.

### Minimal reproduction

```
makeDynGraph(20, 10, 0.5, 6)
```
Width=20, 10 layers, 50% dynamic nodes with 6 sources each. The dynamic `compute()` nodes conditionally skip deps based on value parity, creating heavy dep churn. After the first `batch()` + leaf reads, `_reconcile` crashes.

---

## Fix options

### Option A: Re-check `reuse` after the FOUND loop

After the FOUND loop exits, re-evaluate whether we're still in the reusable region:

```js
if (reuse && deps[cursor + 1] & FOUND) {
    do {
        deps[cursor + 1] &= ~FOUND;
        cursor += 2;
    } while (cursor < oldlen && deps[cursor + 1] & FOUND);
    reuse = cursor < oldlen;   // ← ADD THIS
    if (reuse && deps[cursor] === sender) {
        this._time = cursor + 2;
        return;
    }
}
```

And correspondingly, the skip-one-ahead check also needs to respect the updated cursor:

```js
if (reuse && cursor + 2 < oldlen && deps[cursor + 2] === sender) {
```

### Option B: Clamp cursor before the final push

```js
if (reuse && cursor < oldlen) {
    this._time = cursor + 2;
    deps.push(sender, cursor);
} else {
    deps.push(sender, -1);
}
```

### Option C: Guard in `_reconcile`

Add a null check: `if (index !== -1 && index < oldlen)` before dereferencing `deps[index]`. This is a band-aid — the root issue is that `_search` shouldn't produce indexes pointing to the appended region.

**Recommendation:** Option A is the cleanest — it fixes the invariant at the source. The FOUND loop should update `reuse` since it may exhaust the old region.

---

## Summary

| Issue | Status | Impact |
|-------|--------|--------|
| dep1slot restore (Bug B from round 2) | **Fixed** | Was causing 18 unit test failures |
| _subscribe dispatch (Bug A from round 2) | **Fixed** | Was causing subs.pop crash |
| dep1 null (Bug C from round 2) | **Fixed** | Was causing wrong slot on re-exec |
| `_search` FOUND-loop cursor overflow | **Active** | Crashes `dynUpdateVeryDynamic` benchmark |

The FOUND-loop cursor overflow is the **sole remaining bug**. Fixing it should make both `anod.js` and `anod-ref.js` benchmarks pass all validations and run to completion.
