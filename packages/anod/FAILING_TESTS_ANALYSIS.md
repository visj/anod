# Failing Tests Analysis

Test results: **22 pass, 53 fail, 26 skip, 2 errors**

---

## Bug 1: Slot collision prevents all subscriptions (CRITICAL)

**File:** `src/core/signal.js` — `read()` function (~line 994) and constructors

**Root cause:** Both `Signal._slot` and `Compute._slot` (and `Effect._slot`) initialize to `0`. The `read()` function has a fast-path check:

```js
sender._slot === this._slot
```

On the very first execution (FLAG_SETUP), the receiver's `_slot` is `0` (constructor default) and the sender's `_slot` is also `0`. This condition is `true`, so `read()` returns early **without ever calling `_subscribe()`**. No dependency link is established — the entire reactive graph is inert.

The `sender._slot === this._slot` check is designed to prevent double-tracking within a single execution (a node reads the same signal twice). But the initial `0 === 0` collision defeats it on the first read of every setup phase.

**Why it's critical:** Without subscriptions, `_notify()` never reaches downstream nodes. Signals fire into the void. This single bug causes ~80% of all test failures.

**Tests affected (directly):**
- `signal > propagates if set to unequal value`
- `signal > val > does not track a dependency`
- ALL `effect` tests (effects never re-run after signal changes)
- ALL `update` tests
- `root > allows subcomputations to escape their parents`
- `root > does not batch updates within scope`
- `dispose > effect scope > disables updates and clears computation's value`
- ALL `notify/equal()` tests (computes never re-run)
- ALL `weak` tests
- Most `recover` tests (effects don't re-trigger on signal changes)

**Likely fix:** During the SETUP path in `_update()`, set `this._slot = VERSION--` before executing the fn, just like the dynamic path does. This ensures the receiver's slot is a unique negative number that can never collide with a sender's default `0`.

---

## Bug 2: `_owner` is never set on Effect nodes

**File:** `src/core/signal.js` — Effect constructor (line 295), `_tryRecover()` (line 676)

**Root cause:** The Effect constructor sets `this._owner = null`, and nothing ever assigns it. `_tryRecover()` walks the `_owner` chain to find recover handlers:

```js
function _tryRecover(error) {
    let owner = this._owner;  // Always null
    while (owner !== null) { ... }
    return false;  // Always returns false
}
```

Since `_owner` is never set, error recovery never reaches any handler registered on a Root or parent Effect.

**Tests affected:**
- `recover > root recovery > swallows error when recover returns true`
- `recover > root recovery > propagates error when recover returns false`
- `recover > multiple handlers > stops bubbling when first handler returns true`
- `recover > multiple handlers > tries second handler when first returns false`
- `recover > compute mine to effect > recovers when effect reads errored compute`
- `recover > effect disposal > errored effect is disposed even when recovered`
- `recover > batch recovery > recovers error during batch and completes normally`
- `recover > recovery on triggered update > recovers error triggered by signal change`
- All `edge > effect error` tests that depend on `r.recover()`

**Likely fix:** The `ownEffect()` / `ownCompute()` / `ownWatch()` functions (and their equivalents) need to set `node._owner = this` before the node is started. This also means restructuring the creation flow — see Bug 3.

---

## Bug 3: Owner is set AFTER startEffect/startCompute

**File:** `src/core/signal.js` — `ownEffect()` (line 514), `ownCompute()` (line 434), etc.

**Root cause:** The `own*` functions call the top-level factory first, then `_own()`:

```js
function ownEffect(fn, opts, args) {
    let node = effect(fn, opts, args);  // Creates AND starts the effect
    this._own(node);                    // Sets ownership AFTER execution
    return node;
}
```

`effect()` calls `startEffect(node)` which runs the effect immediately. If the effect throws during this initial execution, `_tryRecover()` can't find the owner because `_own()` hasn't been called yet. The error is unrecoverable even if a recover handler exists on the parent.

**Tests affected:** Same as Bug 2 — any test where an effect throws during initial creation inside a root with `.recover()`.

**Likely fix:** Split effect/compute creation into two steps: (1) construct the node and set `_owner`, (2) then start it. The `own*` functions should create the raw node, assign ownership, then call `startEffect`/`startCompute`.

---

## Bug 4: `startEffect` catch block references undefined `err`

**File:** `src/core/signal.js` — `startEffect()` (line 1916)

**Root cause:** The non-idle catch block uses bare `catch` without binding the error:

```js
} catch {                                    // No (err) binding!
    let recovered = node._tryRecover(err);   // err is undefined
    node._dispose();
    if (!recovered) {
        throw err;                           // throws undefined
    }
}
```

Compare with the idle branch (line 1904) which correctly uses `catch (err)`.

**Tests affected:** Any effect that throws while already inside a transaction (i.e., during `start()`).

**Likely fix:** Change `catch {` to `catch (err) {`.

---

## Bug 5: `scope()` method missing on Root

**File:** `src/core/signal.js` — Root prototype

**Root cause:** Several recover tests call `r.scope(fn)` but no `scope` method is defined on `Root.prototype`. The concept may have been removed or renamed during the refactor.

```js
r.scope((s) => {
    s.recover(() => { ... });
    s.effect(() => { throw ... });
});
```

**Tests affected:**
- `recover > nested scope recovery > inner scope handles error without reaching outer` — TypeError: `r.scope is not a function`
- `recover > nested scope recovery > bubbles to outer when inner returns false` — same
- `recover > recover re-registration > old recover handler is cleared on effect re-run` — same
- `recover > dispose clears recover > dispose nullifies recover handlers` — same (indirectly)

**Likely fix:** Either re-implement `Root.prototype.scope` (and `Effect.prototype.scope`), or update the tests to use the new API (e.g., nested `root()` or a different scoping mechanism).

---

## Bug 6: Missing exports break edge.test.js entirely

**File:** `src/index.js`

**Root cause:** `edge.test.js` imports several symbols that don't exist:

```js
import { transmit, OPT_NOTIFY, OPT_DYNAMIC, FLAG_STREAM } from "../";
```

- `transmit` — concept was dropped (computes are now raw pull, never push)
- `OPT_NOTIFY` — not defined or exported
- `OPT_DYNAMIC` — not defined or exported
- `FLAG_STREAM` — not defined or exported

This causes a SyntaxError that prevents the entire file from loading. **All 30+ tests in edge.test.js are blocked.**

**Tests affected:** Every test in `edge.test.js` (module fails to load).

**Likely fix:** Either re-export the missing symbols (if the functionality exists under different names) or update the test imports. Tests that use `transmit`, `OPT_DYNAMIC`, `FLAG_STREAM`, and `OPT_NOTIFY` need to be removed or rewritten.

---

## Bug 7: Effect stable/setup path has no try/catch

**File:** `src/core/signal.js` — `EffectProto._update()` (line 1464)

**Root cause:** The stable/setup execution path doesn't wrap the fn call in try/catch:

```js
if (flag & (FLAG_STABLE | FLAG_SETUP)) {
    cleanup = (flag & FLAG_BOUND)
        ? this._fn(this._dep1.val(), this._args)
        : this._fn(this, this._args);           // No try/catch!
} else {
    // ... dynamic path has try/finally
}
```

If the fn throws on the stable path:
1. `FLAG_RUNNING` is never cleared
2. `_time` is never updated
3. The error propagates raw, bypassing any cleanup or state recovery

Compare with the dynamic path (line 1480) which wraps in `try { ... } finally { ... }`.

**Tests affected:** Effects using `watch()` or bound effects that throw.

**Likely fix:** Wrap the stable/setup path in try/catch, similar to how `ComputeProto._update` handles errors in its stable path.

---

## Bug 8: dep1 not nulled during single-dep re-execution

**File:** `src/core/signal.js` — `ComputeProto._update()` (line 1378–1389) and `EffectProto._update()` (line 1468–1489)

**Root cause:** When a compute/effect has only `_dep1` (no `_deps` array) and re-executes:

```js
if (deps !== null) {
    this._time = 0;
    this._dep1slot = deps.length;
} else {
    this._flag |= FLAG_SETUP;
    this._dep1._disconnect(dep1slot);  // Disconnects from sender
    // But does NOT set this._dep1 = null!
}
```

After disconnecting, `_dep1` still references the old sender. When `_subscribe()` is called during re-execution:

```js
function _subscribe(sender) {
    if (this._dep1 === null) {
        this._dep1 = sender;    // Would go here if _dep1 was null
    } else if (this._deps === null) {
        slot = 0;               // Goes here instead — creates deps array
    }
}
```

The re-subscription creates a `_deps` entry instead of reusing `_dep1`. This leads to:
- `_dep1` = old sender reference (stale, disconnected)
- New connection stored in wrong slot
- Sender's `_sub1slot` points to a deps index that doesn't exist yet

Additionally, `_dep1slot` is saved and restored after execution (line 1406–1407), overwriting whatever `_subscribe` set during re-execution.

**Tests affected:** Any compute/effect with a single dep that re-executes (i.e., almost all dynamic tracking after the first run). This bug is currently masked by Bug 1 (no subscriptions at all), but will surface once Bug 1 is fixed.

**Likely fix:** Set `this._dep1 = null` before disconnecting in the `deps === null` branch. Also, don't restore `dep1slot` when coming from the setup re-entry path, or restructure the save/restore to only apply to the `deps !== null` case.

---

## Summary: Test failures by root cause

| Bug | Tests directly affected | Severity |
|-----|------------------------|----------|
| Bug 1 (slot collision) | ~40 tests | **Critical** — breaks all reactivity |
| Bug 2 (_owner never set) | ~10 recover tests | High |
| Bug 3 (owner set after start) | Same as Bug 2 | High |
| Bug 4 (catch missing err) | Effects throwing in transaction | Medium |
| Bug 5 (scope missing) | 4 recover tests | Medium |
| Bug 6 (missing exports) | All edge.test.js (~30 tests) | High (blocks entire file) |
| Bug 7 (no try/catch stable) | Bound effects that throw | Medium |
| Bug 8 (dep1 re-exec) | All single-dep re-executions | High (masked by Bug 1) |

### Recommended fix order

1. **Bug 1** — fixes the majority of failures in one shot
2. **Bug 8** — will surface immediately after Bug 1 is fixed
3. **Bug 2 + Bug 3** — together fix error recovery
4. **Bug 4** — trivial one-character fix
5. **Bug 6** — decide which exports to add vs. which tests to update
6. **Bug 5** — decide if `scope()` returns or tests change
7. **Bug 7** — wrap stable path in try/catch

### Tests expected to pass after Bug 1 + Bug 8 are fixed

- `signal > propagates if set to unequal value`
- `signal > val > does not track a dependency`
- `effect > modifies signals > batches data while executing`
- `effect > modifies signals > throws when continually setting a direct dependency`
- `effect > modifies signals > throws when continually setting an indirect dependency`
- `effect > modifies signals > throws on error inside batch`
- `effect > propagates changes topologically`
- `effect > cleanup > is called when effect is updated`
- `effect > cleanup > can be called from within a subcomputation`
- `effect > cleanup > is run only once when a effect scope is disposed`
- `update > does not register a dependency on the subcomputation`
- `update > may update > does not trigger downstream computations unless changed`
- `update > may update > updates downstream pending nodes`
- `root > allows subcomputations to escape their parents via nested scope`
- `root > does not batch updates within scope`
- `dispose > effect scope > disables updates and clears computation's value`
- All `notify/equal()` tests
- All `weak` tests

### Tests that need Bug 2 + Bug 3 (in addition to Bug 1)

- All `recover` tests (error recovery chain)
- `edge > effect error` tests

### Tests that need Bug 5 or test updates

- `recover > nested scope recovery` tests (`r.scope` missing)
- `recover > recover re-registration` test (`r.scope` missing)

### Tests that need Bug 6 or test updates

- All `edge.test.js` tests (import error)
