# 42: `ReadonlySignal` isn't accepted where a node is read

Found by Katode (M47 T47.13), which hands client fns anod's `Signal<T>` and `ReadonlySignal<T>`. Types only: the runtime already accepts it.

## What breaks

```ts
function watch(c: Context, count: ReadonlySignal<number>) {
	c.val(count);        // error TS2345: ReadonlySignal<number> is not assignable to Sender<number>
}
```

The same holds for every parameter typed `Sender<T>`: `c.val`, `c.defer`, `c.pending`, `c.rejected`, `c.set` and `c.post` (where a write is wanted, rightly), and the `dep` of bound `compute`, `task`, `effect` and `spawn`. A `ReadonlySignal` can be read with `.get()`, but not followed, so the type anod has for "you may read this" can't be used for reading in a tracking context. Katode's generated code needs a cast at each call.

## Root cause

`Sender<T>` in `types/internal.d.ts` is a union of the concrete node types: `Signal<T> | MutableSignal<T> | Resource<T> | Compute<T> | Task<T>`. `ReadonlySignal<T>` is their common base interface, not a member, so it's assignable to none of them.

## What anod should do

Every read-only parameter accepts a `ReadonlySignal<T>`: `val`, `defer`, `pending`, `rejected`, and a bound node's `dep`. Write parameters (`set`, `post`) keep requiring a writable node.

One way: a read type, e.g. `Sender<T>` becomes (or gains a sibling) `ReadonlySignal<T>` for the read positions, keeping the union where the concrete kind matters (`Settled<T>`, `AsyncSender<T>`, writes). Whether `Sender` itself changes meaning is anod's call.

## Tests

A type test (tsc, no runtime change): a function taking `ReadonlySignal<number>` calls `c.val`, `c.defer`, `c.pending`, `c.rejected` and binds a compute and an effect to it, and compiles without casts; `c.set(readonly, 1)` still fails to compile.

## Status

Fixed 2026-11-13 on feat/error-model, in `types/internal.d.ts` only. The read positions take `ReadonlySignal<T>`: `val`, `defer`, `pending`, `rejected`, and the `dep` (`dep1`) of every bound factory and constructor (compute, task, effect, spawn, action). `Sender<T>` keeps its meaning, the union of concrete kinds, and stays on `set` and `post`. `test/types.ts` has the tests.
