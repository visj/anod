# 01. Out-of-order responses

A search box sends a request on every keystroke. Responses can arrive out of order, so a slow response for an old query can land after the fast one for the current query and overwrite it. This is the canonical async race, and every library in this comparison solves it. The question is how much you have to write.

**Scenario.** The app searches for `"a"` (slow, 80ms). At 10ms the user types `"ab"` (fast, 20ms).

- **Expected:** `searching`, `2 results for ab`. The request for `"a"` is aborted, and its response is never shown.

## anod

```js
const results = c.task(query, async (q, c) => {
	return await c.suspend(api.search(q, c.controller().signal));
});

c.effect((c) => {
	if (c.pending(results)) {
		show("searching");
	} else {
		const { q, items } = c.val(results);
		show(`${items.length} results for ${q}`);
	}
});
```

When `query` changes, the task runs again. Two things then happen to the previous run:

- its controller is aborted;
- `c.suspend()` drops its response if it arrives anyway.

## React + TanStack Query

```jsx
const { data, isPending } = useQuery({
	queryKey: ["search", query],
	queryFn: ({ signal }) => api.search(query, signal)
});
```

Each query string has its own cache entry, so a late response for `"a"` lands in `["search", "a"]` and is never shown. TanStack aborts a query once nothing observes it, but only if the queryFn read `signal`.

- **Naive:** the same code without `signal` still shows the right thing; it just doesn't abort.
- **Without TanStack:** hand-written `useEffect` + `setState` shows `4 results for a` last. That is the footgun.

## Solid 2.0

```js
const results = createMemo(() => {
	const controller = new AbortController();
	onCleanup(() => controller.abort());
	return api.search(query(), controller.signal);
});
createLoadingBoundary(
	() => createRenderEffect(results, ({ q, items }) => show(`${items.length} results for ${q}`)),
	() => show("searching")
);
```

An async memo ignores the result of a run that has been replaced. Aborting the request is manual: an `AbortController`, aborted in `onCleanup`.

## Jotai

```js
const results = atom((get, { signal }) => api.search(get(query), signal));
const view = unwrap(results);
```

The read function receives a `signal` that is aborted when a dependency changes, and a stale promise is dropped. The idiomatic read is `useAtomValue(results)` under `<Suspense>`. Here `unwrap` is used instead: React 19 holds a revealed boundary back for up to 300ms after showing its fallback, longer than the scenario runs.

## Svelte 5 (experimental async)

```svelte
const results = $derived(await api.search(q, getAbortSignal()));
const text = $derived($effect.pending() ? "searching" : `${results.items.length} results for ${results.q}`);
```

`getAbortSignal()` is aborted when the derived re-runs, and Svelte discards superseded results. The first load needs a `<svelte:boundary>` with a `pending` snippet, in a parent component (`Root.svelte`). Later updates are seen through `$effect.pending()`.

## Verdict

**A tie.** Every library drops the stale response by default, and aborting is a one-liner in all but Solid.

| | Drops stale result | Aborts | Notes |
|---|---|---|---|
| anod | ✓ | ✓ `c.controller()` | |
| React + TanStack Query | ✓ (keyed cache) | ✓ `signal` | Raw React without TanStack has the bug |
| Solid 2.0 | ✓ | manual (`onCleanup`) | |
| Jotai | ✓ | ✓ `signal` | Suspense is the idiomatic read |
| Svelte 5 | ✓ | ✓ `getAbortSignal()` | Loading UI split between boundary and `$effect.pending()` |
