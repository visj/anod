# 05. Stale-while-revalidate

When the page of a list changes, the screen shouldn't go blank. The old page stays visible, marked as updating, until the new one has arrived. That takes two things: a value that survives a reload, and a pending state that turns on when the reload starts.

**Scenario.** Page 1 loads (20ms). At 50ms the user goes to page 2 (20ms).

- **Expected:** `loading`, `page 1: 1a, 1b`, `page 1: 1a, 1b (updating)`, `page 2: 2a, 2b`.

## anod: known gap

```js
const list = c.task(page, async (n, c) => {
	return await c.suspend(api.page(n, c.controller().signal));
});
c.effect((c) => {
	const data = c.val(list);
	if (data === void 0) return show("loading");
	const text = `page ${data.n}: ${data.items.join(", ")}`;
	show(c.pending(list) ? `${text} (updating)` : text);
});
```

**Shows:** `loading`, `page 1: 1a, 1b`, `page 2: 2a, 2b`. There is no `(updating)`.

The task does keep its value while it loads, so the first half works. But when a task starts loading again, its readers are not told:

1. The effect checks its dependencies.
2. That pulls the task, which starts its fetch.
3. The value hasn't changed, so the effect is skipped.
4. It only runs again once the task settles, when `c.pending()` is already false.

A resource doesn't have this problem: its async write notifies its readers when it starts loading (`startLoading`), but a task's re-run doesn't. A one-line change is proposed in [../README.md](../README.md#amendments): stamp the task's change time when it starts loading. It fixes this example, 12 and 13, and 2 existing tests would need their run counts updated.

## React + TanStack Query

```jsx
const { data, isPlaceholderData } = useQuery({
	queryKey: ["page", page],
	queryFn: ({ signal }) => api.page(page, signal),
	placeholderData: keepPreviousData
});
```

`keepPreviousData` plus `isPlaceholderData` is the documented recipe, and it works out of the box.

- **Naive:** without `keepPreviousData` it flashes back to `loading`.

## Solid 2.0

```js
createRenderEffect(() => {
	const { n, items } = list();
	const text = `page ${n}: ${items.join(", ")}`;
	return isPending(list) ? `${text} (updating)` : text;
}, show);
```

This is Solid 2's default: the loading boundary covers the first load only, later changes are transitions that keep the old value, and `isPending` marks it stale.

- **Caveat:** `isPending` read in a user effect, rather than a render effect, gives one glitch frame, `page 2: 2a, 2b (updating)`.

## Jotai

```js
const stale = (prev) => prev && { ...prev, updating: true };
const view = unwrap(list, stale);
```

`unwrap`'s fallback receives the previous value, so stale-while-revalidate takes one line. The fallback must be a stable function, because `unwrap` caches by its identity.

## Svelte 5

```svelte
const data = $derived(await api.page(page, getAbortSignal()));
const text = $derived(`page ${data.n}: ${data.items.join(", ")}${$effect.pending() ? " (updating)" : ""}`);
```

This is Svelte's default too: an update keeps the old UI, and `$effect.pending()` reports the work in flight. The first load is handled by the boundary's `pending` snippet in a parent component.

## Verdict

**anod is the only one that fails, because of a gap in task notification**, not a design limitation. With the proposed fix, the anod code above passes unchanged. The other four all have stale-while-revalidate as a default or a one-liner.

| | Keeps old value | Knows it is reloading |
|---|---|---|
| anod | ✓ | ✗ (readers not told, see above) |
| React + TanStack Query | `keepPreviousData` | `isPlaceholderData` |
| Solid 2.0 | ✓ default | `isPending` |
| Jotai | `unwrap(atom, prev => …)` | through the fallback |
| Svelte 5 | ✓ default | `$effect.pending()` |
