# 12. Callback APIs

Not everything returns a promise. Geolocation, many SDKs and old libraries take callbacks, and some can't be cancelled at all. Here the user looks up `"A"`, which is slow, then `"B"` before `"A"` has answered. `"A"`'s callback still fires later, and must be ignored.

**Scenario.** `lookup("A")` answers after 80ms. At 10ms the user looks up `"B"`, which answers after 20ms. The API has no way to cancel.

- **Expected:** `looking up A`, `looking up B`, `B is #66`.

## anod

```js
const result = c.task(name, (n, c) => {
	c.suspend((resolve, reject) => api.lookup(n, resolve, reject));
});
```

The callback form of `c.suspend()` needs no promise. The task settles when `resolve` is called, and a `resolve` from a replaced run is ignored, so the result is right.

```js
c.effect((c) => {
	if (c.pending(result)) {
		show(`looking up ${c.val(name)}`);
	} else { … }
});
```

The effect reads `name` with `c.val()`, not `name.get()`. When the user looks up `"B"`, the task is still loading `"A"`, so it is loading already and its readers aren't told again. The effect shows `looking up B` because it depends on `name` itself.

## React + TanStack Query

```jsx
const { data, isPending } = useQuery({
	queryKey: ["lookup", name],
	queryFn: () => new Promise((resolve, reject) => api.lookup(name, resolve, reject))
});
```

A queryFn only needs a promise. `"A"`'s late callback resolves the entry for `"A"`, which nothing is showing.

## Solid 2.0

```js
const result = createMemo(() => new Promise((resolve, reject) => api.lookup(name(), resolve, reject)));
```

This is the same promise wrap. A replaced run's result is ignored. It is the shortest version in the set, but it relies on the second lookup happening during the first load, which the boundary's fallback covers; a later lookup would need `isPending`.

## Jotai

A promise atom wrapping the callback, read through `unwrap`. A late resolve settles a promise nothing reads.

## Svelte 5

```svelte
const result = $derived(await new Promise((res, rej) => api.lookup(name, res, rej)));
```

Svelte ignores a resolve from a superseded run. `name` has to live in the parent, above the boundary, so the `pending` snippet can show `looking up B` during the first load.

## Verdict

**A tie on correctness:** wrapping a callback in a promise is trivial, and every framework then drops the late answer.

- anod's promise-free form is a performance and ergonomics nicety, with no allocation and no microtask. It isn't a capability the others lack.

| | Late callback ignored | Shows "looking up B" |
|---|---|---|
| anod | ✓ (no promise needed) | ✓ |
| React + TanStack Query | ✓ | ✓ |
| Solid 2.0 | ✓ | ✓ (fallback) |
| Jotai | ✓ | ✓ |
| Svelte 5 | ✓ | ✓ (state moved up) |
