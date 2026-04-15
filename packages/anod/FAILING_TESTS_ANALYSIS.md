# Failing Tests Analysis (Round 4)

**Unit tests:** 59/59 pass (both src and dist)
**Benchmarks:** All validations pass. All benchmarks run clean except "Dynamic update: very dynamic" which crashes after ~25-70 iterations during the benchmark loop.

---

## Changes made this round

### 1. Sub-slot/dep-slot encoding changed from -1 to 0-based

**Problem:** The old encoding used `-1` for sub1/dep1. Since `-1` has all bits set, `deps[i+1] & FOUND` was true when the sub-slot was `-1`, causing the `_search` FOUND-loop to falsely trigger and corrupt the dep cursor.

**Fix:** Both sub-slots and dep-slots now use `0` for the first position (sub1/dep1) and `n+1` for array index `n`:
- Sub-slots: `0` = sub1, `1` = subs[0], `3` = subs[2], `5` = subs[4]... (always odd for subs)
- Dep-slots: `0` = dep1, `1` = deps[0], `3` = deps[2], `5` = deps[4]... (always odd for deps)

This ensures FOUND (1<<29) and MISSING (1<<30) bits never collide with valid slot values.

**Files changed:** `_connect`, `_disconnect`, `_subscribe`, `_unsubscribe`, `_search`, `_reconcile` (all the dep-slot/sub-slot patching), `derive`/`watch` bound connections.

### 2. oldlen stored in `_ctime` instead of `_dep1slot`

**Problem:** `_update` temporarily stored `oldlen` in `_dep1slot` for `_search` to read. But during fn execution, a nested compute's `_disconnect` could swap entries in a shared sender's subs array, triggering an update to `current._dep1slot` via the swap-with-last logic. This corrupted the temporary oldlen.

**Fix:** Renamed Effect's `_level` to `_ctime` so both Compute and Effect have the field. Store oldlen in `_ctime` during execution. `_search` reads `this._ctime` for oldlen. `_dep1slot` is never repurposed — it just holds the actual sub-slot throughout.

### 3. Reconcile fast-path guards

**Problem:** Fast paths assumed invariants that weren't always met:
- "cursor === oldlen, new appended" path didn't check for reuse back-pointers
- "cursor < oldlen, nothing appended" path didn't check for FOUND flags

**Fix:** Added validation loops to fall through to the complex path when invariants are violated.

### 4. FOUND-loop cursor overflow guard in `_search`

**Problem:** The FOUND-loop could advance cursor to exactly oldlen, then `deps[cursor]` would access the appended region.

**Fix:** Added `cursor < oldlen` guard after the loop before accessing `deps[cursor]`.

### 5. MISSING flag on reuse push in `_search`

**Problem:** When `_search` pushed a new dep with a reuse back-pointer (`deps.push(sender, cursor)`), the old entry at `cursor` wasn't marked MISSING. Reconcile couldn't distinguish "replaced" from "still present".

**Fix:** Set MISSING on `deps[cursor + 1]` before the push.

### 6. `deps.length = write` always runs in reconcile

**Problem:** The truncation `deps.length = write` was conditional on `write !== oldlen`. When `write === oldlen` but appended entries existed (with nulls from `_search`), they persisted into the next execution as part of the "old" region.

**Fix:** Always set `deps.length = write`.

### 7. Mask FOUND/MISSING in reconcile compaction

**Problem:** When reconcile compacts deps entries, the sub-slot copied from `deps[j+1]` could carry residual FOUND/MISSING bits.

**Fix:** Mask with `& ~(FOUND | MISSING)` when reading sub-slots for patching.

---

## Remaining issue: subs corruption in "very dynamic" benchmark

After ~25-70 iterations of `dynUpdateVeryDynamic` (100-wide, 15-layer, 50% dynamic nodes), a sender's `_subs` array develops an `undefined` entry at a receiver position (even index). The next `_notify` reads it and crashes on `undefined._flag`.

**What we know:**
- All validations (single iteration) pass
- All other benchmarks (including heavy ones like dynUpdateLargeWebApp, dynUpdateWideDense) run clean
- The corruption is gradual — it takes many iterations of heavy dep churn
- The OOB check in `_disconnect` doesn't trigger — sub-slots are within bounds
- `_connect` always pushes pairs, `_disconnect` always pops pairs — subs length stays even
- The `undefined` appears at an even index (receiver position), suggesting a dep-slot number was written there

**Likely cause:** A cross-reference between sub-slot and dep-slot gets out of sync after many reconcile cycles. When reconcile patches `dep._subs[subslot] = newDepSlot`, if `subslot` is stale (pointing to a position that was compacted away and reused), the write goes to the wrong position. This is extremely hard to reproduce in isolation because it requires a specific sequence of dep additions/removals across many nodes sharing the same sender.
