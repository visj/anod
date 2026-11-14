# 10. Reading a value without letting it cancel the work

A request is made with the current auth token, and the token is refreshed while the request is in flight. The request is still valid, so it shouldn't be aborted. But the data should be fetched again with the new token once it has arrived. A tracked read cancels and restarts; an untracked read misses the change. This needs a third kind of read.

**Scenario.** Fetch with token `t1` (40ms). At 10ms the token becomes `t2`.

- **Expected:** `loading`, `data for t1`, `data for t2`.
- **Expected requests:** `t1`, then `t2`. Neither is aborted.

## anod

```js
const data = c.task(async (c) => {
	const t = c.defer(token);
	return await c.suspend(api.data(t, c.controller().signal));
});
```

`c.defer()` reads the value now and subscribes when the run settles. A change in flight doesn't cancel the run, and runs it again once it is done. This is one line.

## React + TanStack Query: workaround

```jsx
async function setToken(t) {
	token.current = t;
	if (queryClient.isFetching({ queryKey: dataKey })) {
		await queryClient.refetchQueries({ queryKey: dataKey }, { cancelRefetch: false });
	}
	await queryClient.refetchQueries({ queryKey: dataKey });
}
```

The token stays out of the query key, as auth usually does, and is read from a ref. A refetch while one is in flight either cancels it, or, with `cancelRefetch: false`, joins it and never uses the new token. So `setToken` waits for the request in flight, then refetches.

- **Naive:** with the token in the key, `t1` is aborted and its data is never shown.

## Solid 2.0: workaround

```js
const data = createMemo(() => {
	used = untrack(token);
	return api.data(used, abortSignal());
});
createEffect(() => (data(), token()), (t) => {
	if (t !== used) refresh(data);
});
```

The memo reads the token untracked. An effect, which only runs once `data` has settled, refreshes it if the token has moved on.

- **Naive:** a tracked `token()` aborts `t1`.

## Jotai: workaround

A shadow `requestToken` atom that the request reads. The `setToken` write atom sets the real token, awaits the request in flight, then copies the token over. Every `get()` is tracked, and Jotai 3 removed `setSelf`.

## Svelte 5: workaround

```svelte
const data = $derived(await api.data(used));
$effect(() => {
	if (!$effect.pending()) used = token;
});
```

The request reads a `used` copy that catches up only once nothing is pending. That's an effect writing state, which Svelte's docs discourage.

## Verdict

**anod is unique here:** `c.defer()` is a primitive.

- The other four need a shadow copy of the value plus code that re-syncs it after the request settles, about 6–10 lines.
- The pattern is rarer than the others in this set, but it is common around auth tokens, feature flags and settings that change while a slow job runs.

| | Primitive | Workaround |
|---|---|---|
| anod | `c.defer()` | — |
| React + TanStack Query | — | ref + wait-then-refetch |
| Solid 2.0 | — | `untrack` + refresh effect |
| Jotai | — | shadow atom |
| Svelte 5 | — | shadow state + effect |
