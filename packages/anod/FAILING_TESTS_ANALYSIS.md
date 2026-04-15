# Failing Tests Analysis (Round 2)

Test results: **27 pass, 36 fail, 38 skip, 2 errors**

The previous round's fixes (owner passthrough, FLAG_SETUP routing to dynamic path, catch(err), dep1 null guard) resolved several issues. The remaining 36 failures are dominated by a single crash that cascades through nearly every test.

---

## The Crash: `null is not an object (evaluating 'subs.pop')`

**30 of 36 failures** throw this error inside `_disconnect()`. It happens when `_disconnect(slot)` is called with `slot >= 0`, causing it to access `this._subs` which is `null` (because the subscription is actually in `_sub1`, not `_subs`).

This is caused by **two cooperating bugs** in the subscription machinery.

---

## Bug A: `_subscribe` uses the sub-slot for dispatch instead of the dep-slot

**File:** `src/core/signal.js` — `_subscribe()` (~line 1190)

```js
function _subscribe(sender) {
    let slot = -1;                          // ← dep-slot: where in THIS node
    if (this._dep1 === null) {
        this._dep1 = sender;
    } else if (this._deps === null) {
        slot = 0;                           // dep-slot = 0 (deps[0])
    } else {
        slot = this._deps.length;
    }
    slot = sender._connect(this, slot);     // ← OVERWRITES dep-slot with sub-slot!
    if (slot === -1) {                      // ← dispatches on SUB-slot, not dep-slot
        this._dep1slot = slot;
    } else if (slot === 0) {
        this._deps = [sender, slot];
    } else {
        this._deps.push(sender, slot);
    }
}
```

`_connect(receiver, depslot)` returns a **sub-slot** (where in the *sender's* subscriber list the subscription lives: `-1` = `_sub1`, `0` = `_subs[0]`, etc.).

The bug: `slot` is overwritten with the sub-slot, then the `if/else` chain uses this sub-slot to decide *where to store the dep*. This is wrong — it should use the original dep-slot for dispatch.

**Concrete example — second dep whose sender has no existing subscribers:**

1. dep-slot = `0` (should create `deps = [sender, subslot]`)
2. `sender._connect(this, 0)` → sender's `_sub1` was empty → stores `sub1 = this, sub1slot = 0` → returns `-1`
3. `slot = -1` (sub-slot)
4. `slot === -1` → `this._dep1slot = -1` — **WRONG!** Should have created `this._deps`

This corrupts `dep1slot` and fails to create the `_deps` array.

**Fix:** Use the dep-slot for dispatch, store the sub-slot at that location:

```js
function _subscribe(sender) {
    if (this._dep1 === null) {
        this._dep1 = sender;
        this._dep1slot = sender._connect(this, -1);
    } else if (this._deps === null) {
        this._deps = [sender, sender._connect(this, 0)];
    } else {
        let slot = this._deps.length;
        this._deps.push(sender, sender._connect(this, slot));
    }
}
```

---

## Bug B: `dep1slot` restore overwrites what `_subscribe` set

**File:** `src/core/signal.js` — `ComputeProto._update()` (~line 1407) and `EffectProto._update()` (~line 1487)

The dynamic path saves and restores `dep1slot`:

```js
let dep1slot = this._dep1slot;    // save (line 1381)
this._slot = VERSION--;
// ... disconnect, run fn (which calls _subscribe), reconcile ...
this._slot = slot;
this._dep1slot = dep1slot;        // restore (line 1408) ← OVERWRITES _subscribe's value
```

On **first execution** (setup path through dynamic):
- `dep1slot` is saved as `0` (constructor default)
- `_subscribe` sets `dep1slot = -1` (correct sub-slot for `_sub1`)
- Restore overwrites it back to `0`

On next signal change → re-execution → `dep1._disconnect(dep1slot)` → `dep1._disconnect(0)` → tries `this._subs.pop()` → **CRASH** because the subscription is in `_sub1` (slot `-1`), not `_subs`.

**Fix:** Only restore `dep1slot` when going through the reconcile path (`deps !== null`):

```js
this._slot = slot;
if (deps !== null) {
    this._dep1slot = dep1slot;
}
```

Apply in both `ComputeProto._update` and `EffectProto._update`.

---

## Bug C: `dep1` not nulled during single-dep re-execution

**File:** `src/core/signal.js` — `ComputeProto._update()` (~line 1387) and `EffectProto._update()` (~line 1477)

```js
} else if (this._dep1 !== null) {
    this._flag |= FLAG_SETUP;
    this._dep1._disconnect(dep1slot);
    // Missing: this._dep1 = null;
}
```

After disconnecting `dep1` from the sender, `dep1` still references the old sender. When `_subscribe` runs during re-execution, it sees `dep1 !== null` and routes to `deps[0]` instead of reusing `dep1`. This creates a cross-wired state where:
- `dep1` points to the old sender (stale, disconnected)
- The new subscription is stored in `deps` at the wrong position

**Fix:** Add `this._dep1 = null;` after the disconnect:

```js
} else if (this._dep1 !== null) {
    this._flag |= FLAG_SETUP;
    this._dep1._disconnect(dep1slot);
    this._dep1 = null;
}
```

---

## The 2 "Circular dependency" errors

**Tests:** `compute > with changing dependencies > does not update on inactive dependencies` and `activates new dependencies`

These are **not real circular dependency bugs**. They're cascading from the `subs.pop` crash in the preceding test (`updates on active dependencies`). The `compute.test.js` file uses describe-level shared state:

```js
describe("with changing dependencies", () => {
    const c1 = compute((c) => { ... });  // shared across all tests
    
    test("updates on active dependencies", () => { ... });  // CRASHES → c1 left with FLAG_RUNNING
    test("does not update on inactive dependencies", () => {
        c1.val();  // FLAG_RUNNING still set → throws "Circular dependency"
    });
});
```

After the crash, `FLAG_RUNNING` is never cleared on the compute. Subsequent `val()` calls hit the circular dependency guard. **These will pass once Bugs A+B+C are fixed.**

---

## The `_deps.push` error

**Test:** `effect > propagates changes topologically`

```
TypeError: null is not an object (evaluating 'this._deps.push')
```

This is the same root cause as Bugs A+B. The effect subscribes to multiple senders during setup. Bug A causes the second subscription to misroute (writes to `dep1slot` instead of creating `deps`). Then a later `_subscribe` call tries `this._deps.push(...)` on a null `_deps`. **Will pass once Bug A is fixed.**

---

## The 2 `SyntaxError` (edge.test.js)

```
SyntaxError: Export named 'transmit' not found
SyntaxError: Export named 'FLAG_STREAM' not found
```

`edge.test.js` imports `transmit`, `OPT_NOTIFY`, `OPT_DYNAMIC`, `FLAG_STREAM` — none of which exist. This blocks all ~30 tests in the file from loading. The 2 errors count toward the "2 errors" in the test summary.

**Fix:** Update the test imports. Remove tests for `transmit`/`OPT_DYNAMIC`/`FLAG_STREAM`. Either re-export `OPT_NOTIFY` or remove those tests.

---

## The `r.scope()` failure

**Test:** `recover > recover re-registration > old recover handler is cleared on effect re-run`

```
TypeError: r.scope is not a function
```

`Root.prototype.scope` doesn't exist. This test needs either a `scope()` implementation or a rewrite using existing API.

---

## Summary by root cause

| Root Cause | # Tests | Error |
|-----------|---------|-------|
| Bug A + B (subscribe dispatch + dep1slot restore) | 30 | `subs.pop()` on null |
| Cascading from Bug A+B (stale FLAG_RUNNING) | 2 | "Circular dependency" |
| Bug A variant (multi-dep) | 1 | `_deps.push()` on null |
| Missing exports (edge.test.js) | 2 errors | SyntaxError |
| Missing `scope()` method | 1 | TypeError |

### Fix priority

1. **Bug A** (`_subscribe` dispatch) — fixes the routing
2. **Bug B** (`dep1slot` restore) — fixes the overwrite
3. **Bug C** (`dep1 = null`) — fixes single-dep re-execution

All three are in `_subscribe`, `ComputeProto._update`, and `EffectProto._update`. Fixing them should resolve **33 of 36 test failures** (the 30 `subs.pop` + 2 circular + 1 `deps.push`).

The remaining 3 are the `edge.test.js` import errors (2) and the missing `scope()` method (1).
