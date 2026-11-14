# 12. Callback APIs

Not everything returns a promise. Geolocation, many SDKs and old libraries take callbacks, and some can't be cancelled at all. Here the user looks up `"A"`, which is slow, then `"B"` before `"A"` has answered. `"A"`'s callback still fires later, and must be ignored.

**Scenario.** `lookup("A")` answers after 80ms. At 10ms the user looks up `"B"`, which answers after 20ms. The API has no way to cancel.

- **Expected:** `looking up A`, `looking up B`, `B is #66`.

## anod: known gap

```js
const result = c.task(name, (n, c) => {
	c.suspend((resolve, reject) => api.lookup(n, resolve, reject));
});
```

**Shows:** `looking up A`, `B is #66`.

The callback form of `c.suspend()` needs no promise. The task settles when `resolve` is called, and a `resolve` from a replaced run is ignored, so the result is right.

What's missing is `looking up B`: this is the same gap as [05](../05-stale-while-revalidate/README.md). When the task re-runs for `"B"`, its readers aren't told that it is loading again. The proposed fix in [../README.md](../README.md#amendments) covers this path too: the callback form sets `FLAG_LOADING` in a different branch, and that branch needs the same stamp.

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
- anod is the only one that fails the expected output, because of the pending gap.

| | Late callback ignored | Shows "looking up B" |
|---|---|---|
| anod | ✓ (no promise needed) | ✗ (gap) |
| React + TanStack Query | ✓ | ✓ |
| Solid 2.0 | ✓ | ✓ (fallback) |
| Jotai | ✓ | ✓ |
| Svelte 5 | ✓ | ✓ (state moved up) |
