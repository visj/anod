# 08. Overlapping optimistic mutations

A like button shows +1 at once and saves in the background. With one click at a time, a failed save rolls back to the value before the click. With two quick clicks, that value was itself an unconfirmed guess, and rolling back to it leaves the counter wrong. This is the hard case of optimistic UI.

**Scenario.** The server count starts at 0.

- **Round 1:** two quick clicks. The first save succeeds (server: 1), the second fails.
- **Round 2:** two quick clicks, and both fail.

**Expected:** `0`, `1 (saving)`, `2 (saving)`, `1`, `2 (saving)`, `3 (saving)`, `1`. Each round ends on what the server holds, and `(saving)` shows while any save is in flight.

## anod

```js
likes.set(likes.get() + 1, async (c) => {
	try {
		return await c.suspend(api.like());
	} catch {
		return await c.suspend(api.count());
	}
});
```

Only the latest write's callback continues past `c.suspend()`: an older write's result or failure is dropped. So a rollback can never clobber a newer write. The latest write can't trust the value before it either, so on failure it resyncs with the server. `(saving)` is `c.pending(likes)`.

- **Awkward:** the obvious rollback, `catch { return prev }`, is wrong in round 2, because `prev` is the first click's guess.
- **Awkward:** "the last confirmed value" isn't available either. The first save's success arrives while it is already superseded, so its continuation never runs. It would have to be recorded in a `.then()` outside `c.suspend()`. Resyncing costs one request, but is simpler and always right.

## React + TanStack Query

```jsx
const like = useMutation({
	mutationKey: likeKey,
	mutationFn: () => api.like(),
	onMutate: async () => {
		await queryClient.cancelQueries({ queryKey: countKey });
		queryClient.setQueryData(countKey, (n) => n + 1);
	},
	onSettled: () => {
		if (queryClient.isMutating({ mutationKey: likeKey }) === 1) {
			return queryClient.invalidateQueries({ queryKey: countKey });
		}
	}
});
```

This is [TkDodo's concurrent optimistic updates](https://tkdodo.eu/blog/concurrent-optimistic-updates-in-react-query) pattern: no snapshot rollback, and only the last mutation to settle refetches. Returning the invalidation promise keeps the state "saving" until the server's count has arrived.

- **Naive:** the official guide's snapshot-and-rollback recipe rolls back to the stale guess and shows `1 (saving)`, `2 (saving)` out of order.
- **Naive:** TkDodo's pattern without returning the promise flickers to `3` before `1`.

## Solid 2.0

```js
const server = createMemo((prev) => (prev === void 0 ? 0 : api.count()));
const [likes, setLikes] = createOptimistic(() => server());
const like = action(function* () {
	setLikes((n) => n + 1);
	try {
		yield api.like();
	} catch {}
	refresh(server);
});
```

**Best in class.** Optimistic writes are layers over the server value. Overlapping actions merge into one transition, and every layer is dropped when it ends. There is no rollback code at all, and round 2 ends on 1 by construction. The `catch` is only there because a throwing action rejects its promise.

## Jotai: workaround

Write atoms plus a sequence number, so that only the latest write sets the count, to a `confirmed` value recorded by every save that succeeds. A `saving` counter atom drives `(saving)`.

## Svelte 5: workaround

A `saving` counter and a `confirmed` value in `$state`. When the last save settles, the count goes back to `confirmed`.

- **Naive:** Svelte's docs show the pattern `likes += 1; try … catch { likes -= 1 }`. It ends on the right value, but shows an extra `2 (saving)`.

## Verdict

**Solid wins:** an optimistic layer reverts by itself, with no code.

- **anod** is close: supersession makes the latest write the only one that settles. But the rollback target is up to you, and the natural `prev` is wrong.
- **TanStack Query's** official recipe is wrong under overlap. The correct one is a non-obvious pattern from a blog post.
- **Jotai and Svelte** need hand-written bookkeeping.

This is the clearest case for an optimistic layer in anod: see [../README.md](../README.md#amendments).

| | Rollback code | Naive recipe correct |
|---|---|---|
| anod | resync on failure | no (`return prev` is wrong) |
| React + TanStack Query | invalidate when last | no (official recipe is wrong) |
| Solid 2.0 | none | yes |
| Jotai | sequence number + confirmed | no |
| Svelte 5 | counter + confirmed | no |
