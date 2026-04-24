# `finalize()` Implementation Guide

## Semantics

`finalize()` registers a callback that runs **immediately on activation completion**, regardless of whether the activation succeeded, threw, or was an async node that settled. It is the effect-level equivalent of `try/finally`.

Comparison to existing hooks:
- `cleanup(fn)` — runs at the **start of the next activation** (before re-run), or on dispose
- `recover(fn)` — runs on **error**, returns `true` to suppress dispose
- `finalize(fn)` — runs at **end of current activation**, always, error or not

The primary use case is async effects that acquire resources mid-activation and need guaranteed release:

```js
c.effect(async c => {
  const conn = await openConnection();
  c.finalize(() => conn.close()); // always closes, even if next lines throw
  const data = await c.suspend(fetchData(conn));
  render(data);
});
```

Without `finalize()`, the user must duplicate cleanup in both the normal path and `recover()`.

---

## Bubbling

`finalize()` does **not** bubble. It is scoped to the activation it was registered in, just like `finally` is lexically scoped. `recover()` bubbles because error propagation is inherently hierarchical. Finalization is local cleanup — the parent effect has no business running when a child activation completes.

---

## Struct Change

add `_finalize` to the Effect constructor.

```js
/** @type {(function(): void) | Array<(function(): void)> | null} */
this._finalize = null;
```

Same compact single-fn-or-array storage pattern as `_cleanup` and `_recover`.

---

## Registration — `finalize()` method

Same pattern as `cleanup()`:

```js
/**
 * Registers a finalize fn on this effect. Runs immediately on
 * activation completion, regardless of error. Multiple calls
 * are stored compactly: single fn inline, array on overflow.
 * @this {!Effect}
 * @param {function(): void} fn
 * @returns {void}
 */
function finalize(fn) {
  let finalize = this._finalize;
  if (finalize === null) {
    this._finalize = fn;
  } else if (typeof f === 'function') {
    this._finalize = [finalize, fn];
  } else {
    finalize.push(fn);
  }
}

EffectProto.finalize = finalize;
```

---

## Execution — `clearFinalize()`

Mirror of `clearCleanup()`. Runs all registered finalizers and nulls the field:

```js
/**
 * Runs all finalize callbacks registered on this effect and
 * clears the field. Errors inside finalizers are swallowed to
 * preserve finally semantics (mirroring JS try/finally).
 * @param {!Effect} node
 * @returns {void}
 */
function clearFinalize(node) {
  let f = node._finalize;
  node._finalize = null;
  if (typeof f === 'function') {
    try { f(); } catch (e) { /* swallow — finally semantics */ }
  } else {
    let count = f.length;
    while (count-- > 0) {
      try { f.pop()(); } catch (e) { /* swallow */ }
    }
  }
}
```

Note on error swallowing: JS `finally` blocks suppress errors in the finally body when the try block itself threw. We mirror that here — a crashing finalizer should not mask the original error. If you want to be strict and surface finalizer errors, that's a design choice, but it complicates the error path significantly for little benefit.

---

## Call Sites

Finalize must run at every activation completion point. There are exactly four:

### 1. Sync `_update()` — normal completion

At the very end of `_update`, after `FLAG_INIT` is cleared, before returning:

```js
// existing last line:
this._flag &= ~FLAG_INIT;

// ADD:
if (this._finalize !== null) {
  clearFinalize(this);
}
```

### 2. Sync `_update()` — error path (flush catch block)

The sync error path is in `flush()`, not in `_update()` itself — the throw propagates out of `node._update(time)` and is caught by the surrounding try/catch. Finalize must run there, before `tryRecover` and `_dispose`:

```js
// In flush(), both SCOPES and RECEIVERS catch blocks:
} catch (err) {
  // ADD — finalize before anything else:
  if (node._finalize !== null) {
    clearFinalize(node);
  }
  let e = node._flag & FLAG_PANIC ? err : { error: err, type: FATAL };
  node._flag &= ~FLAG_PANIC;
  let result = tryRecover(node, e);
  if (result !== RECOVER_SELF) {
    node._dispose();
  }
  if (!thrown && result === RECOVER_NONE) {
    error = e;
    thrown = true;
  }
}
```

This applies to **both** catch blocks in flush — the SCOPES loop and the RECEIVERS loop.

### 3. Async `_settle()` — normal completion

`_settle()` is the convergence point for async completion. Run finalize after the deferred dispose check and error path, at the point where normal completion is confirmed:

```js
EffectProto._settle = function(err) {
  let flag = this._flag;
  this._flag &= ~(FLAG_LOADING | FLAG_LOCK);

  if (flag & FLAG_DISPOSED) {
    this._dispose();
    return;
  }

  if (flag & FLAG_ERROR) {
    this._flag &= ~FLAG_ERROR;
    // ADD:
    if (this._finalize !== null) {
      clearFinalize(this);
    }
    let result = tryRecover(this, err);
    if (result !== RECOVER_SELF) {
      this._dispose();
    }
    return;
  }

  // ADD — normal async completion:
  if (this._finalize !== null) {
    clearFinalize(this);
  }

  let stale = false;
  // ... rest unchanged
};
```

### 4. Async `_update()` — callback suspend path

When `FLAG_SUSPEND | FLAG_LOADING` is set (callback-based suspend), `_update` returns early without going through `_settle`. In this case finalize must **not** run yet — the activation is still in progress, waiting for the callback to fire. Finalize runs when the callback calls `_settle`. No change needed here.

When `_update` dispatches to `resolvePromise` or `resolveIterator` and returns early, same — `_settle` handles it. No change needed.

---

## `_dispose()` — finalize on forced disposal

When an effect is disposed mid-activation (e.g. parent scope tears down), any registered finalizer should still run. Add to `_dispose()` after the `FLAG_LOCK` deferred-dispose check:

```js
EffectProto._dispose = function() {
  if (this._flag & FLAG_LOCK) {
    this._flag |= FLAG_DISPOSED;
    return;
  }
  let flag = this._flag;
  this._flag = FLAG_DISPOSED;

  // ADD — run finalizer before teardown:
  if (this._finalize !== null) {
    clearFinalize(this);
  }

  clearDeps(this);
  if (this._cleanup !== null) {
    clearCleanup(this);
  }
  // ... rest unchanged
};
```

---

## `_update()` — clear previous finalize on re-run

At the start of `_update`, existing activations' `_cleanup` and `_owned` are cleared before re-running. `_finalize` should also be cleared — but only if it wasn't already run at end of previous activation (which it was, for completed activations). For async nodes that are re-triggered while loading, the previous finalize may not have fired yet (the callback path). Clear it defensively:

```js
if (!(flag & FLAG_INIT)) {
  if (this._cleanup !== null) {
    clearCleanup(this);
  }
  if (this._owned !== null) {
    clearOwned(this);
  }
  this._recover = null;
  // ADD:
  if (this._finalize !== null) {
    clearFinalize(this); // defensive: should be null for completed activations
  }
}
```

---

## TypeScript Declaration

Add to the `Effect` interface:

```typescript
interface EffectContext<U = unknown, W = unknown> {
  // ... existing methods ...

  /**
   * Registers a callback that runs immediately when this activation
   * completes, regardless of whether it succeeded or threw.
   * Equivalent to a `finally` block scoped to the current activation.
   * Multiple calls accumulate; all registered fns run in registration order.
   * Does not bubble to parent effects.
   *
   * @param fn - Callback to run on completion. Errors inside fn are swallowed.
   */
  finalize(fn: () => void): void;
}
```

---

## Tests

```js
// --- Sync effect, normal completion ---
test('finalize runs after sync effect completes', () => {
  const log = [];
  const s = signal(0);
  effect(c => {
    c.val(s);
    c.finalize(() => log.push('finalize'));
    log.push('run');
  });
  assert.deepEqual(log, ['run', 'finalize']);
  s.set(1);
  assert.deepEqual(log, ['run', 'finalize', 'run', 'finalize']);
});

// --- Sync effect, thrown error ---
test('finalize runs when sync effect throws', () => {
  const log = [];
  let recovered = false;
  effect(c => {
    c.finalize(() => log.push('finalize'));
    c.recover(() => { recovered = true; return true; });
    throw new Error('boom');
  });
  assert.deepEqual(log, ['finalize']);
  assert.equal(recovered, true);
});

// --- finalize runs before recover ---
test('finalize runs before recover on error', () => {
  const log = [];
  effect(c => {
    c.finalize(() => log.push('finalize'));
    c.recover(() => { log.push('recover'); return true; });
    throw new Error('boom');
  });
  assert.deepEqual(log, ['finalize', 'recover']);
});

// --- multiple finalizers run in order ---
test('multiple finalize calls run in registration order', () => {
  const log = [];
  effect(c => {
    c.finalize(() => log.push('a'));
    c.finalize(() => log.push('b'));
    c.finalize(() => log.push('c'));
  });
  assert.deepEqual(log, ['a', 'b', 'c']);
});

// --- finalize does not run on re-run until current activation completes ---
test('finalize registered in one run does not carry to next run', () => {
  const log = [];
  const s = signal(0);
  let run = 0;
  effect(c => {
    c.val(s);
    run++;
    if (run === 1) {
      c.finalize(() => log.push('finalize-1'));
    }
  });
  assert.deepEqual(log, ['finalize-1']);
  s.set(1); // second run — no finalize registered
  assert.deepEqual(log, ['finalize-1']); // no second finalize
});

// --- async effect, normal settlement ---
test('finalize runs when async effect settles normally', async () => {
  const log = [];
  const p = Promise.resolve(42);
  effect(async c => {
    c.finalize(() => log.push('finalize'));
    const v = await c.suspend(p);
    log.push('settled:' + v);
  });
  await microtask();
  assert.deepEqual(log, ['settled:42', 'finalize']);
});

// --- async effect, error settlement ---
test('finalize runs when async effect settles with error', async () => {
  const log = [];
  const p = Promise.reject(new Error('async-boom'));
  effect(async c => {
    c.finalize(() => log.push('finalize'));
    c.recover(() => { log.push('recover'); return true; });
    await c.suspend(p);
  });
  await microtask();
  assert.deepEqual(log, ['finalize', 'recover']);
});

// --- finalize on dispose ---
test('finalize runs when effect is disposed mid-activation', () => {
  const log = [];
  let eff;
  root(r => {
    eff = effect(c => {
      c.finalize(() => log.push('finalize'));
    });
  });
  assert.deepEqual(log, ['finalize']); // ran on completion
  log.length = 0;
  eff.dispose();
  // no second finalize — already ran, field is null
  assert.deepEqual(log, []);
});

// --- finalize error does not mask effect error ---
test('crashing finalizer does not mask original error', () => {
  const log = [];
  let recovered = false;
  effect(c => {
    c.finalize(() => { throw new Error('finalizer-boom'); });
    c.recover(e => { log.push(e.error.message); recovered = true; return true; });
    throw new Error('original');
  });
  assert.equal(log[0], 'original'); // original error, not finalizer error
  assert.equal(recovered, true);
});

// --- does not bubble to parent ---
test('finalize does not bubble to parent effect', () => {
  const log = [];
  effect(c => {
    c.finalize(() => log.push('parent-finalize'));
    c.effect(c2 => {
      c2.finalize(() => log.push('child-finalize'));
    });
  });
  assert.deepEqual(log, ['child-finalize', 'parent-finalize']); // each runs for own activation only
});

// helper
function microtask() {
  return new Promise(resolve => queueMicrotask(resolve));
}
```

---

## Checklist

- [ ] Add `_finalize = null` to Effect constructor (already done per struct)
- [ ] Add `clearFinalize(node)` function mirroring `clearCleanup`
- [ ] Add `EffectProto.finalize = finalize` method
- [ ] Call `clearFinalize` at end of sync `_update()` normal path
- [ ] Call `clearFinalize` in both flush catch blocks (SCOPES + RECEIVERS), before `tryRecover`
- [ ] Call `clearFinalize` in `_settle()` on both error and normal paths
- [ ] Call `clearFinalize` in `_dispose()` before `clearDeps`
- [ ] Clear defensively in `_update()` pre-run block alongside `_cleanup`
- [ ] Add TypeScript declaration to `IEffect`
- [ ] Run tests