# 14. Read-after-write

A click handler changes the quantity in a cart, then sends the new total to analytics in the same handler. Is the derived total up to date right after the write? This is a design choice more than a footgun, but it decides whether event handlers can trust what they read.

**Scenario.** Price 10, quantity 1. At 10ms the handler sets the quantity to 3 and immediately reads the total.

- **Expected:** `total 10`, `total 30`.
- **Expected events:** `track total 30`.

## anod

```js
setQuantity(n) {
	quantity.set(n);
	api.track(total.get());
}
```

A write flushes the graph synchronously. When `set()` returns, every compute and effect is up to date.

## React + TanStack Query

```jsx
function onQuantity(n) {
	setQuantity(n);
	api.track(totalOf(price, n));
}
```

State is a snapshot: `total` holds the old value until the next render. React's docs suggest computing the next value yourself, which repeats the derivation.

- **Naive:** `track(total)` sends 10.

## Solid 2.0

```js
setQuantity(n);
flush();
api.track(total());
```

Solid 2 batches writes until the next microtask, so a read right after a write sees the old value. `flush()` applies them now. It is documented, but easy to forget.

- **Naive:** sends 10.

## Jotai

```js
store.set(quantity, n);
api.track(store.get(total));
```

The store is synchronous, so a derived atom is fresh right after `set()`.

## Svelte 5

```svelte
quantity = n;
api.track(total);
```

A `$derived` is computed when read, so it is up to date. Effects still run later, batched.

## Verdict

**anod, Jotai and Svelte are consistent right after a write. Solid 2 and React aren't, by design.**

- **Solid batches** so that a series of writes is applied as one, and an async transition can hold them.
- **React snapshots** state per render.

anod gets batching through an explicit `batch()` instead, and is the only one of the five where effects have also run when the write returns.

| | Derived fresh after write | Effects run by then |
|---|---|---|
| anod | ✓ | ✓ |
| React + TanStack Query | ✗ (snapshot) | ✗ |
| Solid 2.0 | after `flush()` | after `flush()` |
| Jotai | ✓ | ✗ (React renders later) |
| Svelte 5 | ✓ | ✗ (batched) |
