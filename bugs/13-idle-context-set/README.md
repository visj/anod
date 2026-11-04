# 13: Idle `c.set` gaps

Branch `fix/13-idle-context-set`, based on `fix/12-queued-resource-writes`. Chain B (contextual and resource writes).

## What breaks

The idle path of `contextSet` (a contextual write from an async continuation) diverges from `signal.set`:

- A void updater on `signal(v, false)` sets the value to `undefined` instead of keeping the mutated object.
- Writing to a disposed signal is accepted and stores the value, while `signal.set` throws.

```js
c.spawn(async (cx) => {
    await cx.suspend(load());
    cx.set(list, (arr) => { arr.push(1); }); // list.get() is now undefined
});
```

## Root cause

- `contextSet`'s idle branch resolves the updater and writes without the `FLAG_MUTABLE` void-return handling and without the `FLAG_DISPOSED` check that `set` has.

## What anod should do

- A contextual write behaves exactly like `sender.set()`, plus the self-notification guard. Same updater semantics, same disposed check (throws).

## Tests (2)

- `test/explore/scheduling.test.js` › contextual writes (c.set / c.post) › idle c.set with a void updater on signal(v, false) keeps the mutated value
- `test/explore/scheduling.test.js` › contextual writes (c.set / c.post) › idle c.set does not write into a disposed signal

Run with `bun test --conditions=src test/explore/scheduling.test.js`.

## Fix

Both tests pass.

### Changes

- **`contextSet`**: the idle branch now resolves the updater exactly like `set()`'s idle branch. A function updater on a `FLAG_MUTABLE` sender that returns `undefined` keeps the current value (`write = false`) and still notifies. The `FLAG_DISPOSED` check (`throw new Error(ILLEGAL_READ)`) sits at the top, before the `IDLE` branch, as in `set()`, so it covers the queued path too.
- **`contextPost`**: the same `FLAG_DISPOSED` check at the top, as in `SignalProto.post`.

### Behavior decisions

- **The disposed check also covers the queued `c.set` and `c.post`.** "Exactly like `sender.set()`" means throwing wherever `set()` / `post()` throw, and both check at the top. Before the fix, a queued contextual write to a disposed sender was accepted and then dropped silently by the drain. Now it throws in the calling node, like `sender.set()` does there. A sender disposed after its write was queued is still skipped by the drain, as before. The `contextPost` check goes beyond the two listed tests and can be dropped if unwanted.
- **The single-argument resource form keeps its contextual meaning.** `c.set(resource, fn)` still treats `fn` as an updater `(prev) => next`, in both the idle and queued paths, while `resource.set(fn)` runs it as an async callback `(c, current)`. The README documents only the three-argument async form for contextual writes, so changing this would be an API decision. I left it for the maintainer.
- **`_runAsync` receives the updater's result, as in `set()`.** With a void updater on a mutable resource plus an `asyncFn`, the callback's `optimistic` is `undefined`. The idle `set()` does the same today, while the queued `asyncAssign` passes `node._value`. I kept the two idle paths identical. If this changes, both idle paths should pass `sender._value` when `write` is false.

### Types

Unchanged. `Context.set` / `Context.post` type the updater as `(prev: T) => T`, so TypeScript callers cannot return void from a contextual updater on a `signal(v, false)`, though the runtime now allows it on both paths. A `MutableSignal<T>` overload would not help: `Signal<T>` and `MutableSignal<T>` are structurally interchangeable (method bivariance), so the overload would also accept void updaters on plain signals. I tried it, and that is what happened. Telling them apart would need a brand on `MutableSignal`.

### Test expectations changed

None.

### Other bugs' tests

None changed state.

### Hot paths touched

None. `contextSet` gains one flag check at the top and the `write` local in its idle branch, and `contextPost` gains one flag check. Both are contextual write paths, not `set()` itself. No new fields.
