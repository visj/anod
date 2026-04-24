# Slot Removal & Deferred Purge Refactor

## What This Changes

Removes slot integers from both `_subs` and `_deps` arrays, replacing eager O(1) pop/replace removal with deferred compaction driven by a disposal pressure counter. The result is flat `[Receiver, Receiver, ...]` and `[Sender, Sender, ...]` arrays with no interleaved integers, and a three-tier purge heuristic on `Sender`.

---

## Struct Changes

### Signal (currently 6 fields)

Remove `_sub1slot`. Remove slot integers from `_subs`.

```js
function Signal(value) {
  this._flag = 0;
  this._value = value;
  this._version = -1;
  this._sub1 = null;
  this._subs = null;
  this._disposedCount = 0;   // NEW: accumulated dispose pressure
}
```

6 fields → 6 fields (swap `_sub1slot` for `_disposedCount`). Cache layout unchanged at 64 bytes.

### Compute (currently 14 fields)

Remove `_sub1slot` and `_dep1slot`. Remove slot integers from `_subs` and `_deps`. Add `_disposedCount`.

```js
function Compute(opts, fn, dep1, seed, args) {
  this._flag = FLAG_INIT | FLAG_STALE | opts;
  this._value = seed;
  this._version = -1;
  this._sub1 = null;
  this._subs = null;
  this._disposedCount = 0;   // NEW
  this._fn = fn;
  this._dep1 = dep1;
  this._deps = null;
  this._time = 0;
  this._ctime = 0;
  this._cleanup = null;
  this._args = args;
}
```

14 fields → 13 fields (remove `_sub1slot`, `_dep1slot`, add `_disposedCount` = net -1). Still fits in 2 cache lines.

### Effect (currently 14 fields)

Same removals as Compute. No `_value`/`_ctime` so the field count lands differently — verify the 14-field target is still met.

Remove `_sub1slot`, `_dep1slot`, add `_disposedCount`.

---

## New Global State

```js
/** @const @type {Array<Sender>} */
var PURGES = [];
var PURGE_COUNT = 0;

/** Fraction threshold: enqueue for purge when disposedCount >= subs.length * PURGE_RATIO */
var PURGE_RATIO = 0.25; // tune via benchmark
```

---

## clearReceiver Replacement

The old `clearReceiver(send, slot)` using the slot for pop/replace is entirely replaced. The new version takes the receiver itself and uses a pointer comparison for the `_sub1` fast path.

```js
/**
 * @param {Sender} send
 * @param {Receiver} receiver
 * @returns {void}
 */
function clearReceiver(send, receiver) {
  if (send._sub1 === receiver) {
    send._sub1 = null;
  } else {
    let disposed = ++send._disposedCount;
    let subs = send._subs;
    // Enqueue for purge only when density threshold is met
    if (subs !== null && !(send._flags & FLAG_PURGE)) {
      if (disposed === subs.length || disposed >= (subs.length >> 2)) {
        send._flag |= FLAG_PURGE;
        PURGES[PURGE_COUNT++] = send;
      }
    }
  }
  // FLAG_WEAK drop check unchanged
  if (
    send._flag & FLAG_WEAK &&
    send._sub1 === null &&
    (send._subs === null || send._subs.length === 0)
  ) {
    send._drop();
  }
}
```

Note: `FLAG_PURGE` needs a new bit. Use an unused sender bit — check the current flag layout. Bits 7+ are listed as "Receiver flags" but they live on nodes that are also Senders (Compute), so pick a bit that doesn't collide. If Signal needs it too, use a bit in 0–6.

---

## _purge Method

Add to `SignalProto`, `ComputeProto`. (Effect is a Receiver only, not a Sender, so it does not need `_purge`.)

```js
/**
 * Compact _subs by removing FLAG_DISPOSED entries.
 * Uses pop-from-back variant for low disposal count (hot path),
 * forward scan for high disposal count.
 * @this {Signal | Compute}
 */
function _purge() {
  let subs = this._subs;
  let disposed = this._disposedCount;
  // Do NOT reset _disposedCount here — let it accumulate across
  // purge cycles so the heuristic in clearReceiver stays accurate.
  // Reset only when we actually compact.
  this._flag &= ~FLAG_PURGE;

  if (subs === null) return;

  // All gone: nuke array entirely
  if (disposed >= subs.length) {
    this._subs = null;
    this._disposedCount = 0;
    return;
  }

  this._disposedCount = 0;

  if (disposed > (subs.length >> 2)) {
    // High churn: forward compaction scan
    let write = 0;
    for (let read = 0; read < subs.length; read++) {
      let node = subs[read];
      if (!(node._flag & FLAG_DISPOSED)) {
        subs[write++] = node;
      }
    }
    subs.length = write;
    return;
  }

  // Low churn: pop from back to fill disposed holes
  let i = 0;
  while (i < subs.length) {
    if (subs[i]._flag & FLAG_DISPOSED) {
      let tail;
      do {
        tail = subs.pop();
        if (i >= subs.length) return;
      } while (tail._flag & FLAG_DISPOSED);
      subs[i] = tail;
    }
    i++;
  }
}

SignalProto._purge = ComputeProto._purge = _purge;
```

---

## flush() Integration

Add a purge drain phase at the end of the `do { ... } while` loop in `flush()`, after effects and receivers:

```js
// After RECEIVER_COUNT drain:
if (PURGE_COUNT > 0) {
  let count = PURGE_COUNT;
  for (let i = 0; i < count; i++) {
    PURGES[i]._purge();
    PURGES[i] = null;
  }
  PURGE_COUNT = 0;
}
```

Place this after `RECEIVER_COUNT` drain and before the `cycle++` runaway check. Purge does not produce new senders/receivers so it does not need to re-enter the loop.

Also add `PURGE_COUNT = 0` to the `finally` block alongside `DISPOSER_COUNT = SENDER_COUNT = SCOPE_COUNT = RECEIVER_COUNT = 0`.

---

## connect() Changes

`connect()` no longer writes slots into `_subs`. The `depslot` parameter is removed entirely — callers no longer pass it.

```js
/**
 * @param {Sender} send
 * @param {Receiver} receiver
 * @returns {void}
 */
function connect(send, receiver) {
  if (send._sub1 === null) {
    send._sub1 = receiver;
    // No _sub1slot write
  } else if (send._subs === null) {
    send._subs = [receiver];
  } else {
    send._subs.push(receiver);
  }
  // Return value removed — callers no longer store subslot
}
```

`connect()` now returns `void`. All call sites that previously stored the return value as `subslot` or `_dep1slot` must be updated.

---

## subscribe() Changes

`subscribe()` no longer stores slot return values. `_dep1slot` and the slot column in `_deps` are gone. `_deps` becomes a flat `[Sender, Sender, ...]` array.

```js
function subscribe(receiver, sender) {
  if (receiver._dep1 === null) {
    receiver._dep1 = sender;
    connect(sender, receiver);
  } else {
    let deps = receiver._deps;
    if (deps === null) {
      receiver._deps = [sender];
    } else {
      deps.push(sender);
    }
    connect(sender, receiver);
  }
}
```

---

## _read() Changes

`_read` builds `_deps` as a flat sender array. The DSTACK setup path also becomes flat.

```js
function _read(sender, stamp) {
  if (stamp > TRANSACTION) {
    VSTACK[VCOUNT++] = sender;
    VSTACK[VCOUNT++] = stamp;
  }

  if (this._flag & FLAG_SETUP) {
    if (this._dep1 === null) {
      connect(sender, this);
      this._dep1 = sender;
    } else {
      connect(sender, this);
      DSTACK[DCOUNT++] = sender;  // flat, no subslot
    }
  } else if (this._deps === null) {
    this._deps = [sender];
    this._flag &= ~FLAG_SINGLE;
  } else {
    this._deps.push(sender);
  }
}
```

DSTACK becomes a flat sender array (stride 1, not 2). Update `DBASE`/`DCOUNT` arithmetic accordingly: increment by 1 instead of 2.

After setup, the slice and cleanup loop change:
```js
if (flag & FLAG_SETUP) {
  if (DCOUNT > DBASE) {
    this._deps = DSTACK.slice(DBASE, DCOUNT);
    for (let i = DBASE; i < DCOUNT; i++) {
      DSTACK[i] = null;
    }
    DCOUNT = DBASE;
  } else if (this._dep1 !== null) {
    this._flag |= FLAG_SINGLE;
  }
  DBASE = prevDBase;
}
```

---

## clearDeps() Changes

`clearDeps` no longer reads slot indices. It passes `this` (the receiver) to `clearReceiver`:

```js
function clearDeps(receive) {
  if (receive._dep1 !== null) {
    clearReceiver(receive._dep1, receive);
    receive._dep1 = null;
  }
  let deps = receive._deps;
  if (deps !== null) {
    let count = deps.length;
    for (let i = 0; i < count; i++) {
      clearReceiver(deps[i], receive);
    }
    receive._deps = null;
  }
}
```

Stride changes from `i += 2` to `i++`.

---

## clearSubs() Changes

`clearSubs` is called on Sender disposal. It no longer calls `clearSender` (which updated dep-side slot backpointers) — that mechanism is gone. It just nulls out the receiver's dep pointer directly.

This is the trickiest part. Previously `clearSubs` called `clearSender(receiver, senderSlotInReceiver)` which used the slot stored in `_subs[i+1]` to find and remove the dep from the receiver's `_deps`. Now there are no slots, so we need a linear scan of the receiver's deps.

```js
function clearSubs(send) {
  if (send._sub1 !== null) {
    removeDep(send._sub1, send);
    send._sub1 = null;
  }
  let subs = send._subs;
  if (subs !== null) {
    let count = subs.length;
    for (let i = 0; i < count; i++) {
      let sub = subs[i];
      if (!(sub._flag & FLAG_DISPOSED)) {
        removeDep(sub, send);
      }
    }
    send._subs = null;
  }
}

/**
 * Removes `sender` from `receiver`'s dep list. Linear scan — only
 * called from clearSubs (cold path: sender disposal).
 * @param {Receiver} receiver
 * @param {Sender} sender
 */
function removeDep(receiver, sender) {
  if (receiver._dep1 === sender) {
    receiver._dep1 = null;
    return;
  }
  let deps = receiver._deps;
  if (deps === null) return;
  let count = deps.length;
  for (let i = 0; i < count; i++) {
    if (deps[i] === sender) {
      // Swap-remove: pop last into this slot
      let last = deps.pop();
      if (i < deps.length) {
        deps[i] = last;
      }
      return;
    }
  }
}
```

`clearSender` is now dead code — remove it.

---

## patchDeps() Changes

`patchDeps` reconciles deps after dynamic re-execution. With flat `_deps`, the stride changes from 2 to 1 throughout, and slot reads/writes are gone.

Key changes:
- `existingLen = (depCount - 1)` instead of `(depCount - 1) * 2`
- `i += 1` instead of `i += 2` throughout
- `newidx += 1` instead of `newidx += 2`
- `clearReceiver(dep, deps[i + 1])` → `clearReceiver(dep, node)` (pass receiver, not slot)
- `connect(newDep, node, i)` → `connect(newDep, node)` (no depslot arg)
- Slot backpatch block removed entirely:
  ```js
  // OLD — delete this block:
  if (tSlot === -1) {
    tDep._sub1slot = i;
  } else {
    tDep._subs[tSlot + 1] = i;
  }
  ```
- The dep1 promotion block at the bottom also changes: no slot to read from `deps[tail + 1]`, no `_sub1slot`/`_subs[slot+1]` backpatch needed.

The structural logic (three-pointer scan: forward `i`, new-dep `ni`, backward `tail`) stays identical. Only the index arithmetic and slot operations change.

---

## sweepDeps() Changes

`sweepDeps` stamps dep versions before re-execution. With flat deps, stride changes from 2 to 1:

```js
function sweepDeps(stamp, dep1, deps) {
  let depCount = 0;
  // ... dep1 handling unchanged ...
  if (deps !== null) {
    let count = deps.length;
    for (let i = 0; i < count; i++) {   // was i += 2
      let dep = deps[i];
      let depver = dep._version;
      if (depver > transaction) {
        vstack[vcount++] = dep;
        vstack[vcount++] = depver;
      }
      dep._version = stamp;
    }
    depCount += count;                   // was count >> 1
  }
  VCOUNT = vcount;
  return depCount;
}
```

---

## notify() Changes

`notify` loops over `_subs` now stride-1:

```js
function notify(node, flag) {
  let sub = node._sub1;
  if (sub !== null) {
    let flags = sub._flag;
    sub._flag |= flag;
    if (!(flags & (FLAG_PENDING | FLAG_STALE))) {
      sub._receive();
    }
  }
  let subs = node._subs;
  if (subs !== null) {
    let count = subs.length;
    for (let i = 0; i < count; i++) {   // was i += 2
      sub = subs[i];
      let flags = sub._flag;
      sub._flag |= flag;
      if (!(flags & (FLAG_PENDING | FLAG_STALE))) {
        sub._receive();
      }
    }
  }
}
```

Disposed nodes in `_subs` (pending purge) are inert: `FLAG_DISPOSED` is already set so `_receive()` is a no-op. No guard needed.

---

## Bound node connect() call sites

Anywhere a bound node calls `connect()` during construction and stores the return as `_dep1slot`:

```js
// OLD:
node._dep1slot = connect(depOrFn, node, -1);

// NEW:
connect(depOrFn, node);
// _dep1slot field is gone, no assignment
```

Occurs in: `compute()`, `task()`, `effect()`, `spawn()`, `_compute()`, `_task()`, `_effect()`, `_spawn()`.

---

## needsUpdate() / checkRun() / checkSingle()

These walk `_deps` to check `_ctime`. Stride changes from 2 to 1. No slot reads. Straightforward `i++` instead of `i += 2`.

---

## settleDeps() (async defer path)

`settleDeps` reads deferred dep values from `Channel._defers` and calls `subscribe()`. The `subscribe()` signature is unchanged from the caller's perspective. Review that `settleDeps` doesn't read any slot values from `_deps` directly — if it does, update those accesses.

---

## FLAG_PURGE Bit Allocation

Pick an unused bit on Sender nodes. Signal and Compute are both Senders. The current sender bits are 0–6. Bit 7 (`FLAG_INIT`, 1 << 7) is listed as a Receiver flag but Signal doesn't have it. Options:

- Use bit 7 on Signal only (Signal has no Receiver flags). But Compute shares sender+receiver, so we need a bit that's free on Compute too.
- The cleanest option: use an upper bit that isn't listed anywhere, e.g. `1 << 24`. Confirm it doesn't collide with any flag in the current list (highest listed is `FLAG_EAGER = 1 << 23`).

```js
const FLAG_PURGE = 1 << 24;
```

---

## Checklist

- [ ] Add `_disposedCount = 0` to Signal, Compute, Effect constructors
- [ ] Remove `_sub1slot` from Signal, Compute, Effect constructors
- [ ] Remove `_dep1slot` from Compute, Effect constructors
- [ ] Add `FLAG_PURGE` constant
- [ ] Add `PURGES[]` and `PURGE_COUNT` globals
- [ ] Rewrite `clearReceiver(send, slot)` → `clearReceiver(send, receiver)`
- [ ] Add `_purge()` to SignalProto and ComputeProto
- [ ] Add purge drain phase to `flush()`
- [ ] Add `PURGE_COUNT = 0` to `flush()` finally block
- [ ] Rewrite `connect(send, receiver, depslot)` → `connect(send, receiver)` returning void
- [ ] Rewrite `subscribe()` to use flat `_deps`
- [ ] Rewrite `_read()` to use flat DSTACK and flat `_deps`
- [ ] Update DSTACK setup slice/cleanup loop (stride 1)
- [ ] Rewrite `clearDeps()` stride 1, pass receiver to clearReceiver
- [ ] Rewrite `clearSubs()` + add `removeDep()`, delete `clearSender()`
- [ ] Rewrite `patchDeps()` stride 1, remove all slot backpatch code
- [ ] Rewrite `sweepDeps()` stride 1
- [ ] Rewrite `notify()` stride 1
- [ ] Update all bound-node `connect()` call sites (remove `_dep1slot =`)
- [ ] Update `needsUpdate()` / `checkRun()` / `checkSingle()` stride 1
- [ ] Update `_settle()` weak-node check (no slot math, already uses `_sub1 === null`)
- [ ] Remove `clearSender()` entirely
- [ ] Remove `_sub1slot` and `_dep1slot` from all prototype assignments and JSDoc
- [ ] Benchmark notify loop, patchDeps, and flush purge against baseline