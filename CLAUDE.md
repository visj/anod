# Instructions for Claude
## Code guidelines
Always run `bun make` before you run `bun test`. All tests target the bundled output, not the source files directly, to ensure that the final bundle ready to be shipped works correctly.
### Branches 
Always expand branches fully, like this:
```ts
if (myStatement) {
    return true; // GOOD
}
```
Do *not* write code like this:
```ts
if (myStatement) return false; // BAD
if (myStatement) { return false; } // BAD
```
### Allocation
Never use anything other than `boolean` or `number`, if those suffice. For enums, matching, etc, always create a const value at top level, like this:
```ts
// Outside registry
const KIND_MATCH = 0;
const KIND_TUPLE = 1;
/** @param {number} kind */
function allocOnSlab(types, volatile, kind) { }
```
Do *not* write code like this:
```ts
/** @param {string} kind - 'tuple' or 'match' */
function allocOnSlab(types, volatile, kind) { }
```
Always avoid heap allocations when possible. Prefer code duplication over heap allocs. Never allocate strings, arrays, destructured return arguments unless absolutely necessary.
### Comments
Write meaningful comments, only when the code is not obvious, or for very complicated algorithms. Prefer JSDoc style comments over // comments.
### JSDoc
If you can, add correct JSDoc type definitions. Because we "fake" a lot of typescript features, this project is built on javascript and uses jsdoc for type safety, instead of Typescript. That way, we can fully create a virtual API through typescript that fakes the number as a Complex/Type etc.

## Library overview

Anod is a fine-grained reactive signal library for JavaScript. It belongs to the same family as S.js, Solid signals, Preact signals, and Alien signals, but takes its own approach to scheduling, dependency tracking, and memory layout.

The monorepo contains two packages:

- **`anod`** — the core reactive engine (production-ready)
- **`anod-list`** — reactive array methods built on top of the signal primitives (work in progress)

### Core primitives

There are four node types, distinguished by bit-flag type tags (`Type._ROOT`, `Type._SIGNAL`, `Type._COMPUTE`, `Type._EFFECT`). Type flags encode capabilities: `_SEND` (can broadcast changes), `_RECEIVE` (can subscribe to changes), `_OWNER` (can own child nodes for hierarchical disposal).

**Signal** — a writable reactive cell. Holds a value, notifies subscribers on `set()` when the value changes (`!==`). Has no dependencies, only subscribers. Created via `signal(value)`.

**Compute** — a derived reactive value. Runs a function to produce its value, automatically tracking which signals/computes it reads. Memoized: only re-runs when dependencies change, and only propagates downstream when its own output changes. Created via `compute(fn, seed?, opts?, args?)` or `sender.derive(fn, seed?, opts?, args?)`.

**Effect** — a side-effect node. Similar to Compute in dependency tracking, but doesn't produce a value for others to read. Instead it runs side effects and can return a cleanup function. Can own child nodes (scoped effects). Created via `effect(fn, opts?, args?)` or `sender.watch(fn, opts?, args?)`.

**Root** — an ownership scope. Groups effects and computes for batch disposal. Created via `root(fn)`.

### Dependency tracking

Dependency tracking is **dynamic** and happens at runtime via the `read(sender)` method on Compute and Effect nodes. When a node's function executes, every `read()` call registers a bidirectional link between the sender and the receiver.

Links are stored in a **dual-pointer + overflow array** layout to minimize allocations in the common case:

- **Sender side**: `_sub1` (first subscriber), `_subs[]` (packed array of `[receiver, depslot]` pairs for additional subscribers)
- **Receiver side**: `_dep1`, `_dep2` (first two dependencies), `_deps[]` (packed array of `[sender, subslot]` pairs for 3+ dependencies)

On re-execution, dependencies are reconciled via `pruneDeps()`. This uses a **version-tagging algorithm** to efficiently handle three cases:

1. **Recycled deps** — re-accessed in the same order; no action needed
2. **Stale deps** — not re-accessed; unsubscribed and removed
3. **Re-accessed stale deps** — existed before but accessed out of order; detected by version tag and moved rather than unsubscribed then resubscribed

Unsubscription uses **swap-with-last** for O(1) removal from packed arrays — no splice, no null gaps.

### Propagation model

Anod uses a **push-based notification with lazy compute evaluation**.

When a signal changes:
1. `notifyStale()` walks all subscribers, setting them STALE and queuing them
2. Computes go to `COMPUTE_QUEUE`; effects go to `EFFECT_QUEUE` or `SCOPE_QUEUE[level]`
3. The `start()` transaction loop processes queues in order: disposals → signal updates → computes → scoped effects (by level) → flat effects
4. Computes only actually re-execute when still STALE at processing time (may have been refreshed earlier by a downstream read)

**Time-based deduplication**: a global clock (`CLOCK._time`) increments each transaction cycle. Each node tracks `_time` of last update — if a node has already been marked stale for the current time, it's skipped. This prevents diamond-dependency nodes from being processed multiple times.

**Pending/refresh optimization**: when a Compute has only been marked PENDING (not STALE), reading it triggers `refresh()` which walks upstream to check if any actual dependency changed. If none did, the compute skips re-execution entirely. This avoids unnecessary work in deep chains where an upstream compute's value didn't actually change.

### Batching

`batch(fn)` defers all propagation until `fn` completes. Multiple `set()` calls within a batch are coalesced — signals queue their updates in `SIGNAL_QUEUE` / `SIGNAL_OPS` and the transaction loop processes them all at once. Nested batches are no-ops (just execute the function inline).

### Bound vs. unbound nodes

**Bound** nodes (`Flag._BOUND`) are created via `.derive()` / `.watch()`. They have a fixed set of dependencies (1 or 2 senders passed at construction time) and use `Flag._STABLE` by default — the function receives the dependency values directly without calling `read()`, so no dynamic tracking overhead.

**Unbound** nodes are created via the top-level `compute()` / `effect()` functions. They use dynamic dependency tracking — the function receives the node itself as the first argument (typed as `IReader`) and calls `c.read(signal)` to subscribe.

### Evaluation modes

- **Default**: dynamic dependency tracking with full `pruneDeps()` reconciliation
- **`Opt.STABLE`**: no dependency tracking; the function only receives the previous value (or for bound nodes, the sender values). Faster but can't change dependencies
- **`Opt.SETUP`**: runs the setup pass on first execution (used internally to register signal arguments in `@anod/list`)
- **`Opt.DEFER`**: don't auto-start the node on creation; it remains STALE until explicitly read

### Async support

Computes can return Promises or AsyncIterables. The library detects these via `isAsync()` and:

- Sets `Flag._LOADING` on the node
- Uses `WeakRef` to hold the node reference, allowing GC if the node is disposed before resolution
- On resolution, calls `settle()` which clears LOADING, updates the value, and triggers a new propagation cycle
- Async iterators are consumed incrementally — each yielded value triggers a settle

### Scoped effects and hierarchical disposal

Effects with owned nodes (owned !== null) participate in **topological level-based execution**. Each scoped effect tracks its `_level` (depth in the ownership tree). `SCOPE_QUEUE` is an array of arrays indexed by level (initially 4 slots, extended on demand). Parent-level effects always execute before child-level effects, ensuring proper cleanup ordering.

Owner nodes (`Root`, scoped `Effect`) track `_owned` children. Disposing an owner recursively disposes all owned nodes. Cleanup functions are stored compactly: a single function for count=1, an array for count>1, with slot recycling.

### Error handling

Errors in compute functions are caught and stored as the node's value with `Flag._ERROR` set. Reading an errored compute via `.val()` rethrows. Errors in effects cause the effect to be disposed. The `error()` method on Compute/Effect returns whether the node is in an error state.

### Cycle detection

The `start()` loop has a hard limit of 100,000 iterations. If exceeded, it throws a `"Runaway cycle"` error. Circular dependency reads are detected immediately — if a compute reads itself while already running (`Flag._RUNNING`), it throws `"Circular dependency"`.

### The `@anod/list` package

`@anod/list` extends `Signal.prototype` and `Compute.prototype` with reactive array methods. It provides two categories of operations:

**Read methods** (return a Compute that re-runs when the source array changes):
`at`, `concat`, `entries`, `every`, `filter`, `find`, `findIndex`, `findLast`, `findLastIndex`, `flat`, `flatMap`, `includes`, `indexOf`, `join`, `keys`, `map`, `reduce`, `reduceRight`, `slice`, `some`, `values`

**Mutation methods** (only on Signal, mutate the array in-place and trigger notification):
`copyWithin`, `fill`, `pop`, `push`, `reverse`, `shift`, `sort`, `splice`, `unshift`

Read methods are implemented as bound computes via `computeArray()` (internally uses `computeOne()`). They support **reactive parameters** — arguments can be plain values, Signals, or functions, resolved at execution time via `getVal()`. For example, `.slice(signal(0), signal(5))` creates a reactive slice that updates when either bound changes.

`forEach` is special — it creates an Effect rather than a Compute, since it's inherently side-effectful.

The `list(value)` factory creates a Signal with `Flag.LIST` set, which is the entry point for the list API.

### Key design differences from other signal libraries

1. **Hybrid push/pull**: notifications are pushed eagerly, but compute re-evaluation is lazy (only on read or when queued by the transaction loop). This avoids wasted work while keeping the graph consistent.

2. **Dual-pointer dependency storage**: the first two dependencies and the first subscriber use dedicated fields instead of arrays, avoiding allocations in the ~80% common case.

3. **Version-tag based dep pruning**: instead of diffing old and new dependency sets, version tags enable O(n) reconciliation with in-place array compaction.

4. **Topological effect levels**: scoped effects execute parent-before-child via level-indexed queues, without needing a full topological sort.

5. **Bit-flag state machine**: all node state (stale, pending, running, disposed, loading, error, bound, stable, etc.) is packed into a single 32-bit integer, enabling fast branching with bitwise ops.

6. **Zero-allocation-path design**: the library avoids strings, closures, and object allocations on the hot path. Enums are numeric constants, queues are pre-allocated arrays, and arrays are always kept packed (no null gaps).

7. **WeakRef-based async**: async resolution holds nodes via WeakRef, so disposed nodes can be GC'd even if their promise hasn't resolved yet.

8. **JSDoc + TypeScript declarations**: the source is plain JavaScript with JSDoc annotations for Closure Compiler compatibility. A separate `.d.ts` file provides the public TypeScript API, using branded types (`unique symbol`) to prevent accidental structural matching.
