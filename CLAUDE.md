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
const FLAG_STALE = 1;
const FLAG_PENDING = 2;
/** @param {number} flag */
function setFlag(node, flag) { }
```
Do *not* write code like this:
```ts
/** @param {string} flag - 'stale' or 'pending' */
function setFlag(node, flag) { }
```
Always avoid heap allocations when possible. Prefer code duplication over heap allocs. Never allocate strings, arrays, destructured return arguments unless absolutely necessary.

Anod is extremely sensitive to V8 optimization. Code that looks equivalent often isn't — prototype methods beat free functions in polymorphic dispatch, `Array.prototype.pop()` beats `arr.length--` for swap-remove, and multiple call sites can prevent inlining that a single call site with an intermediate variable enables. Always prefer small flat structs with inline fields for the common case and arrays only on overflow.
### Comments
Always write meaningful comments about how the code works. Do not insert meaningless section comments. Prefer JSDoc style comments over regular // comments.
### JSDoc
If you can, add correct JSDoc type definitions. Because we "fake" a lot of typescript features, this project is built on javascript and uses jsdoc for type safety, instead of Typescript. That way, we can fully create a virtual API through typescript that fakes the node types, flags etc.

## Library overview

Anod is a fine-grained reactive signal library for JavaScript. It belongs to the same family as S.js, Solid signals, Preact signals, and Alien signals, but takes its own approach to scheduling, dependency tracking, and memory layout.

The monorepo contains two packages:

- **`anod`** — the core reactive engine (approaching 1.0)
- **`anod-list`** — reactive array methods built on top of the signal primitives (work in progress)

### Core primitives

There are four sync node types plus two async variants, distinguished by bit-flag type tags. Type flags encode capabilities: `_SEND` (can broadcast changes), `_RECEIVE` (can subscribe to changes), `_OWNER` (can own child nodes for hierarchical disposal).

**Signal** — a writable reactive cell. Holds a value, notifies subscribers on `set()` when the value changes (`!==` or custom equality). Has no dependencies, only subscribers. Created via `signal(value)`.

**Compute** — a derived reactive value. Runs a function to produce its value, automatically tracking which senders it reads. **Purely pull-based**: notifications mark it stale/pending but it does not re-execute until something reads it. Created via `compute(fn)` (unbound, dynamic deps) or `compute(dep, fn)` (bound, single dep).

**Effect** — a side-effect sink. Tracks dependencies like Compute but produces no value. Re-runs eagerly via the transaction loop when any dependency changes. Can own child nodes and register cleanup functions. Created via `effect(fn)` or `effect(dep, fn)`.

**Task** — async Compute. Same shape as Compute with `FLAG_ASYNC` set. Runs a function that returns a Promise. While pending it holds `FLAG_LOADING`; on resolution it settles its value and pushes notification to its subscribers. Created via `task(fn)` or `task(dep, fn)`.

**Spawn** — async Effect. Async counterpart of Effect — side-effectful, owns cleanups, runs async work. Created via `spawn(fn)` or `spawn(dep, fn)`.

**Root** / **scope** — ownership boundaries. `root(fn)` creates a top-level ownership scope; `scope()` creates a nested one. Disposing an owner recursively disposes owned nodes and runs their cleanups.

### Propagation model

Anod separates notification from evaluation:

- **Notification is push**: when a Signal writes, it walks its subscriber list and marks each receiver `FLAG_STALE` (direct dep) or `FLAG_PENDING` (transitive). Stale/pending propagation stops at nodes already marked for the current transaction time.
- **Compute evaluation is pull**: Computes never re-run as part of notification. They re-run on the next read that finds them stale. This avoids work for values nobody reads.
- **Effects are pushed to queues**: flat effects go to `RECEIVERS`, scoped effects go to `SCOPES[level]` (level = owner depth). The transaction loop drains these in order after signals settle.
- **Tasks push on resolve**: when a task's promise settles, it pushes its update into the `TASKS` queue of the current transaction. The loop processes tasks that resolved mid-flight — they don't need to be pulled by effects, since they notify their subscribers when they have an actual value to deliver. If no active transaction exists, settling a task starts a new one.

### The `start()` transaction loop

`start(fn)` runs `fn()` and then drains all queues. Nested `start()` calls are no-ops (inline execution). The loop order each cycle:

1. **Disposals** — nodes queued for disposal
2. **Signal updates** — `SENDERS` / `PAYLOADS` (batched senders)
3. **Tasks** — `TASKS` queue (async results that resolved during this cycle)
4. **Scoped effects by level** — `SCOPES[0]`, `[1]`, `[2]`, ... parent-before-child
5. **Flat effects** — `RECEIVERS`

After each queue drains, `CLOCK._time` advances. Any node that runs writes that schedule new work brings the loop back to step 1. A runaway guard caps iterations at 100,000 and throws `"Runaway cycle"` if exceeded.

### Dependency tracking

Tracking is dynamic at runtime. When a receiver's function calls `read(sender)`, a bidirectional link is created.

Links use a **dual-pointer + overflow array** layout to avoid allocations in the common case:

- **Sender side**: `_sub1` (first subscriber), `_subs[]` (packed array of `[receiver, depslot]` pairs for additional subscribers).
- **Receiver side**: `_dep1`, `_dep2` (first two deps inline), `_deps[]` (packed array of `[sender, subslot]` pairs for 3+ deps).

Reconciliation on re-run uses `pruneDeps()` with version-tagging to handle three cases in one pass:

1. **Recycled deps** — re-accessed in the same order; no action needed
2. **Stale deps** — not re-accessed; unsubscribed and swap-removed
3. **Reordered deps** — accessed out of order; detected by version tag, moved rather than resubscribed

Unsubscription uses **swap-with-last** (`Array.prototype.pop()`) for O(1) removal. Arrays are always kept packed, no null gaps.

### Bound vs. unbound nodes

**Bound** nodes (`FLAG_BOUND`) are created via `compute(dep, fn)` / `effect(dep, fn)` / `task(dep, fn)` / `spawn(dep, fn)`. They have a fixed single dep passed at construction. The callback receives the dep's value directly as the first argument — no `read()` call needed, no setup, no reconciliation.

This is **critical for performance**: V8 must see both bound and unbound paths exercised from program start. Without real bound-dep callsites, V8 dead-code-eliminates the bound fast path and the later transition causes deopt. Measured: adding a stable-fast-path branch without exercising it caused 1.08μs → 1.28μs regression with IPC dropping from 6.19 → 4.52. The bound path is 30-50% faster and uses 60-90% less memory than unbound for the single-dep case.

**Unbound** nodes are created via `compute(fn)` / `effect(fn)` / etc. The callback receives the node itself as first argument, exposing `read()` for dynamic dep tracking.

Callback signatures:
- **Bound sync**: `(val, c, prev, args) => ...` — `val` first so `compute(age, a => a > 18)` is natural; `c` second when helpers are needed.
- **Unbound sync**: `(c, prev, args) => ...` — `c` is the node itself.
- **Bound async**: `(val, c, prev, args) => ...` — same as sync. `c` is always needed for async because of cleanup / future suspend.
- **Unbound async**: `(c, prev, args) => ...` — same as sync unbound.

### Evaluation modes (`Opt` flags)

- **Default**: dynamic dependency tracking with full reconciliation
- **`Opt.STABLE`**: no dependency tracking at read time; the bound callback just receives the dep's value. Fastest but can't change deps
- **`Opt.DEFER`**: don't auto-start on creation; remain STALE until explicitly read
- **`Opt.DISABLED`**: node starts in a paused state. `FLAG_DISABLED` lives only on the root node of a scope; `_setStale` stops propagation when it sees DISABLED, marking FLAG_STALE but not enqueuing. Re-enable directly enqueues since FLAG_STALE is already set. O(1) enable/disable without tree walks.

### Gate (validation wrapper)

`Gate` extends `Signal` to add validation. Created via `gate(value).check(eqFn).guard(validator)`. It overrides `.set()` to run through user-supplied equality (`_equals` array) and validation (`_guards` array) functions before accepting a new value. Shared prototype with Signal for `_value`, `_version`, `_flag` access.

Gate-on-Compute is possible but rare (users do `new Gate(compute, ...)` directly).

### Async

Tasks and spawns are async nodes. The body returns a Promise (or async iterable). The library:

- Sets `FLAG_LOADING` on the node while the promise is pending.
- Stores the old value during loading; `.val()` returns the last-known value (stale-while-revalidate).
- Uses `WeakRef` to hold the node reference from the resolution handler, allowing GC if the node is disposed before the promise settles.
- On invalidate mid-flight, pushes to the `TASKS` queue of the current (or new) transaction, does not notify subscribers, it only notifies on settle.
- Exposes `task.loading()` and `task.error()` as separate observable flags.

**Stale activation semantics**: if a task re-runs before its previous promise resolves, the old activation is logically abandoned. When the old promise resolves, the library checks the node's current activation id — if it doesn't match, the resolution is discarded. This prevents stale values from overwriting newer results.

**Not yet implemented** (design decided but not built):
- `c.suspend(promise)` — wrap a native promise so its continuation never runs if the node is disposed / stale. Planned design: WeakRef + activation id check, returns a shared `NOOP` thenable on stale/disposed so the continuation is silently dropped and GC'd.
- `c.wait(task)` with two-way slot binding for `await task` ergonomics — may or may not ship; the shape is uncertain.
- `c.when([tasks], callback)` derived-compute helper.
- `c.resolved([tasks])` zero-alloc subscribe+check.

### Batching

`batch(fn)` defers propagation until `fn` completes. Signal sets within a batch coalesce via `SIGNAL_QUEUE` / `SIGNAL_OPS`. Nested `batch()` calls inline. `batch` is distinct from `start` — `batch` is pure coalescing within an existing transaction, while `start` is the transaction loop itself.

### Scoped effects and hierarchical disposal

Effects can have owned child nodes.

Owner nodes track `_owned` children. Disposal is recursive. Cleanup functions are stored compactly: single function for count=1, array with slot recycling for count>1. Scoped effects track `_level` (owner depth) and execute via `SCOPE_QUEUE[level]`, parent-before-child, without a full topological sort.

### Error handling

Errors in compute bodies are caught and stored with `FLAG_ERROR` set. Reading an errored compute via `.val()` rethrows. Errors in effects dispose the effect. `recover(fn)` on a compute/effect intercepts errors: return true to swallow, false or throw to propagate.

Errors are normalized — if the thrown value isn't an `Error`, it's wrapped with a descriptive message and the original value stored as `cause`.

### The `@anod/list` package

The list package is currently completely out of date. We do not make any changes to that package at the moment. Any breaking change in the core library, just leave it. Don't run tests, don't patch anything. We will fix that later when the core stabilizes.

`@anod/list` extends `Signal.prototype` and `Compute.prototype` with reactive array methods. Two categories:

**Read methods** (return a bound Compute that re-runs when the source array changes):
`at`, `concat`, `entries`, `every`, `filter`, `find`, `findIndex`, `findLast`, `findLastIndex`, `flat`, `flatMap`, `includes`, `indexOf`, `join`, `keys`, `map`, `reduce`, `reduceRight`, `slice`, `some`, `values`

**Mutation methods** (only on Signal, mutate in place and notify):
`copyWithin`, `fill`, `pop`, `push`, `reverse`, `shift`, `sort`, `splice`, `unshift`

Read methods support **reactive parameters** — args can be plain values, Signals, or functions, resolved at execution time via `getVal()`. Example: `.slice(signal(0), signal(5))` creates a reactive slice that updates when either bound changes.

`forEach` is special — creates an Effect rather than a Compute, since it's inherently side-effectful.

The `list(value)` factory creates a Signal with `FLAG_LIST` set, the entry point for the list API.

### Key design principles

1. **Pure pull for computes, push for effects and tasks.** Computes never run unread; effects run when queued; tasks push their settled results. This minimizes wasted work without sacrificing responsiveness.

2. **Dual-pointer dep storage.** First dep/sub inline, overflow into packed arrays. Avoids allocation in the ~80% common case.

3. **Bound-dep fast path.** `compute(dep, fn)` skips all setup/reconciliation. 30-50% faster than unbound for single-dep cases. Must be exercised from startup or V8 dead-codes it.

4. **Version-tag reconciliation.** One-pass dep pruning with in-place compaction. No diff, no splice, no nulls.

5. **Topological effect levels.** Scoped effects execute parent-before-child via level-indexed queues.

6. **Bit-packed state.** All node state in a single 32-bit flag field. Fast branching with bitwise ops.

7. **Zero-allocation hot paths.** No strings, no closures on reads/writes. Queues pre-allocated. Arrays kept packed.

8. **WeakRef async.** Async resolution handlers hold nodes weakly, so disposed nodes GC even if their promise is still pending.

9. **JSDoc + TypeScript declarations.** Source is plain JS with JSDoc for Closure Compiler; public API is a separate `.d.ts`.
