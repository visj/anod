# Anod Reactive Library: Evaluation & Comparative Analysis

*Written after extensive work on the codebase: async primitives, memory safety, GC behavior, error recovery, and performance profiling.*

---

## 1. What is Good

### Performance Architecture
The dual-pointer dep storage (`_dep1`/`_dep2` inline, overflow to packed arrays) avoids allocation in the ~80% common case. Combined with bit-packed state flags, version-tag reconciliation, and swap-with-last removal, the hot paths are genuinely zero-allocation. The bound-dep fast path (`compute(dep, fn)`) skips all setup/reconciliation and benchmarks 30-50% faster than unbound for single-dep cases. This is a real engineering advantage over libraries that treat every node uniformly.

### The Push-Pull Split
Computes are pure pull (never re-run unread), effects are push (eagerly queued), tasks push on settle. This is the correct split — it minimizes wasted work without sacrificing responsiveness. Most libraries either go full push (wasteful for unread computes) or full pull (effects miss updates). Anod's `FLAG_EAGER` further lets users opt individual computes into push behavior when needed.

### Async Primitives
The async story is genuinely novel. Two consumption patterns for the same task:

- **`c.pending(task)`** — Sync, zero-allocation check. `if (c.pending(task)) return;` then `c.val(task)` after settle. No promises, no async frames, no WeakRefs. Benchmarks at ~180ms for 1M iterations.
- **`await c.suspend(task)`** — Full async/await with two-way channel binding. More ergonomic but heavier (~1000ms for 1M iterations).

No other reactive library offers both patterns. Solid has `createResource` and `Suspense`, but those are framework-level, not primitive-level.

### The REGRET Mechanism
The `REGRET` thenable (`{ then() {} }`) for abandoning async continuations is clever and efficient. When a node re-runs or disposes while a promise is pending, the `.then()` handler checks staleness via WeakRef + activation time, and returns REGRET instead of the value. Since REGRET's `.then` is a no-op, the async frame silently dies and becomes eligible for GC. This solves the "dangling async continuation" problem that plagues most async reactive systems, without requiring explicit cancellation tokens.

### Ownership & Disposal
The Root/Effect ownership model with hierarchical disposal prevents leaks structurally. Parent-before-child execution order via level-indexed scope queues is correct without requiring a full topological sort. The `ASSERT_IDLE` guard on Clock factory methods prevents the common footgun of creating unowned nodes inside running transactions.

### Error Recovery
The three-tier `tryRecover` system (RECOVER_SELF / RECOVER_OWNER / RECOVER_NONE) is well-designed. Self-recovery keeps the node alive (like Go's `recover()`), owner-recovery swallows the error but still disposes the child, and unrecovered errors propagate. The `panicWaiters` mechanism for disposed tasks correctly rejects all awaiting nodes.

### `c.defer(sender)`
Reads a value without subscribing immediately — subscription is deferred until the async node settles. This is essential for avoiding unnecessary re-runs while loading. No equivalent exists in other libraries.

---

## 2. What is Bad or Concerning

### API Complexity
The API surface is growing. A user must understand: `signal`, `compute`, `task`, `effect`, `spawn`, `root`, `gate`, `batch`, plus context methods: `val`, `stable`, `equal`, `cleanup`, `recover`, `suspend`, `controller`, `pending`, `defer`, `eager`. Compare with Preact Signals: `signal`, `computed`, `effect`, `batch`. The power is real, but the learning curve is steep.

### The Callback-Receives-Context Pattern
```js
c.compute((cx) => cx.val(s1) + cx.val(s2))
```
vs. what most libraries do:
```js
computed(() => s1.value + s2.value)
```
The context object (`cx`) is necessary for the library's architecture (it enables bound deps, stable mode, dep tracking without global state). But it's unfamiliar and verbose. Every read requires `cx.val()` instead of property access.

### No Untracked Reads Inside Callbacks
After calling `cx.stable()`, ALL subsequent reads are untracked. But there's no way to do a one-off untracked read while still tracking others. MobX has `untracked()`, Solid has `untrack()`, Vue has implicit untracking via `toRaw()`. A `cx.peek(sender)` that returns the value without subscribing would fill this gap — it's the internal-facing equivalent of the external `sender.peek()`.

### Gate Feels Bolted On
Gate extends Signal with validation/equality, but it's the only "extended signal" type. The pattern of `.check()` and `.guard()` chains feels like it belongs in userland, not the core. Consider whether Gate should be a separate package or if signals should have a more general extension mechanism.

### The `_version = -1` Fix
The initial version had `_version = 0` which collided with the restored global `VERSION = 0` for stable computes reading untracked nodes. The fix (`_version = -1`) works but is fragile — it relies on SEED starting at 1 and never producing -1. A more robust approach might be to use a sentinel value or restructure the version check.

---

## 3. What is Novel (Unique to Anod)

1. **Dual async consumption** — `c.pending()` (sync pull) vs `await c.suspend()` (async push). No other library offers both.

2. **REGRET thenable** — Silent continuation abandonment via a no-op `.then()`. More elegant than AbortController-based cancellation.

3. **Bound-dep fast path** — `compute(dep, fn)` with a fixed single dep that skips all tracking machinery. Other libraries apply the same code path to all nodes regardless of dep count.

4. **`c.defer()`** — Deferred subscription for async nodes. Read now, subscribe at settle time.

5. **`c.eager()`** — Opt-in push behavior for individual computes. Other libraries are either all-push or all-pull.

6. **Self-recovery** — `recover()` on the node itself (not just ancestors) keeps the node alive. Inspired by Go's `recover()`.

7. **FLAG_WEAK** — Computes that release their cached value when the last subscriber disconnects. Automatic memory management for idle caches.

8. **panicWaiters** — When a task disposes while being awaited, all awaiters are rejected and properly error-handled. Most libraries would just silently hang.

---

## 4. What is Missing

### From Other Libraries

| Feature | Who Has It | What It Does | Relevance to Anod |
|---------|-----------|-------------|-------------------|
| **`untrack()` / `peek()` in callbacks** | Solid, MobX, Vue | Read without subscribing (one-off) | High — `stable()` is all-or-nothing |
| **`when(predicate)`** | MobX | Promise that resolves when condition is true | Medium — natural fit with tasks |
| **Deep reactivity / Stores** | MobX, Vue, Solid | Nested objects automatically reactive | Medium — common need, but out of scope for core? |
| **`on(deps, fn)`** | Solid | Explicit dep list (only tracks listed) | Low — bound computes partially cover this |
| **Selector / `createSelector`** | Solid | O(1) notification for selection patterns | Medium — useful for lists |
| **Scheduler control** | Various | Choose when effects run (sync/microtask/raf) | Medium — currently all sync |
| **Readonly views** | Vue (`readonly`) | Read-only wrapper around a signal | Low — easy to implement in userland |
| **Context / DI** | Solid, Vue | Dependency injection through reactive tree | Low — more of a framework concern |
| **Transitions / Concurrent** | Solid, React | Non-urgent update scheduling | Low — complex, framework-level |

### Feature Ideas

**`cx.peek(sender)`** — Read a sender's value inside a callback without subscribing. Unlike `stable()`, this is per-read, not per-node. Implementation: just refresh + return value, skip the subscribe path. Trivially simple.

**`c.when(fn)`** — Returns a promise that resolves when `fn` (a reactive computation) returns a truthy value. Internally creates a compute + effect that disposes itself on first truthy result. Natural companion to the existing async primitives:
```js
await c.when(() => task.loading === false);
```

**`c.select(source, keyFn)`** — Given an array signal and a key function, creates a reactive selection where downstream nodes only re-run when the selected item changes. O(1) notification instead of O(n) array diffing.

**`c.readonly(signal)`** — Returns a Compute-like view that tracks the signal but has no `set()`. Useful for exposing reactive state from a module without allowing mutations.

**`c.once(fn)`** — Effect that runs once and auto-disposes. Sugar for a common pattern:
```js
// Currently:
const r = c.root((r) => { r.effect((cx) => { /* ... */; r.dispose(); }); });
// With c.once:
c.once((cx) => { /* ... */ });
```

**Sync `c.suspend()` for compute** — Currently `c.suspend()` only works in async contexts (task/spawn). A sync version for compute could enable lazy evaluation patterns: "don't compute until all deps are ready."

---

## 5. Comparative Analysis

### vs. Solid Signals (`@solidjs/signals`)
Solid is the closest philosophical match. Both use fine-grained reactivity with owner-based disposal. Key differences:
- **Solid** uses global tracking state (the "listener" variable). Anod uses per-node version stamping.
- **Solid** has `createResource` for async data. Anod has `task()` which is lower-level but more flexible.
- **Solid** effects run synchronously in creation order. Anod effects run in topological (level) order.
- **Solid** has `untrack()`, `on()`, `Suspense`. Anod has `stable()`, `defer()`, `pending()`.
- **Anod's bound-dep path** has no equivalent in Solid.

Anod could learn: `untrack()` per-read, the Suspense mental model for propagating loading states upward.

### vs. Preact Signals
Preact Signals is minimal and fast. It uses a global version counter and topological ordering.
- **Preact** has `.value` getter/setter for ergonomic access. Anod uses `cx.val()`.
- **Preact** has no async story at all. Anod's async primitives are a major differentiator.
- **Preact** has no ownership/disposal model. Anod's is comprehensive.
- **Preact** does lazy evaluation similar to anod (computes don't re-run until read).

Anod could learn: the `.value` ergonomic pattern (though it conflicts with the context-based tracking).

### vs. Alien Signals
Alien Signals focuses purely on raw sync performance. It's the speed benchmark target.
- **Alien** has no async, no ownership, no error handling, no batching.
- **Alien** uses a different graph structure optimized for minimal overhead.
- **Anod** is competitive on sync benchmarks while offering vastly more features.

Nothing to learn feature-wise, but Alien's implementation tricks (inline caching, monomorphic dispatch) are worth studying for performance.

### vs. MobX
MobX is the most feature-rich comparison point. It pioneered many reactive patterns.
- **MobX** has deep observability (objects, arrays, maps). Anod is flat signals only.
- **MobX** has `when()`, `reaction()`, `autorun()`, `flow()`. Anod's effect + task covers similar ground but differently.
- **MobX** has middleware (intercept/observe). Anod has none.
- **MobX** uses Proxy-based tracking. Anod uses explicit `cx.val()`.
- **MobX** `flow()` uses generators for async. Anod uses native async/await with REGRET.

Anod could learn: `when()` is a genuinely useful primitive. Deep observability is high-value for complex state.

### vs. Vue Reactivity (`@vue/reactivity`)
Vue's reactivity is Proxy-based with automatic deep tracking.
- **Vue** has `ref()`, `reactive()`, `computed()`, `watch()`, `watchEffect()`.
- **Vue** has `effectScope()` similar to anod's `root()`.
- **Vue** has `shallowRef` vs `ref` for controlling depth. Anod is always shallow.
- **Vue** has `triggerRef` for manual notification. Anod has `equal(false)` for similar effect.
- **Vue** scheduler defers effect execution to microtask by default. Anod runs effects synchronously.

Anod could learn: `effectScope()` naming is clearer than `root()`. Scheduler flexibility (sync vs async effect execution) would be valuable.

---

## 6. Strategic Observations

### Anod's Niche
Anod occupies a unique position: it's a **low-level reactive primitive library with first-class async support**. No other library in this space has the async story that anod has. This is its differentiator and should be leaned into.

### Biggest Risk
API complexity. The library is approaching the point where the number of concepts a user must learn becomes a barrier. Every new feature (defer, suspend, pending, eager, stable, weak) adds cognitive load. Consider whether some of these should be "advanced" APIs that most users never touch, documented separately.

### Biggest Opportunity
The `c.pending()` pattern is potentially revolutionary for UI frameworks. It enables Suspense-like behavior without any framework support — just a reactive primitive. If anod can demonstrate this pattern cleanly, it could become the go-to reactive core for frameworks that want async data loading without Suspense complexity.

### What to Build Next (Priority Order)
1. **`cx.peek(sender)`** — Trivial to implement, high impact, removes a sharp edge
2. **`c.when(fn)`** — Natural companion to existing async, useful for testing too
3. **Stabilize anod-list** — Reactive array methods are table stakes for adoption
4. **Scheduler API** — Even just "sync vs microtask" for effects would be valuable
5. **Deep reactivity** — Either in core or as `anod-store` package
