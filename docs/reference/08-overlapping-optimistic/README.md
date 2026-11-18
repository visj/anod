# 08. Overlapping optimistic mutations

A like button shows +1 at once and saves in the background. With one click at a time, a failed save rolls back to the value before the click. With two quick clicks, that value was itself an unconfirmed guess, and rolling back to it leaves the counter wrong. This is the hard case of optimistic UI.

**Scenario.** The server count starts at 0.

- **Round 1:** two quick clicks. The first save succeeds (server: 1), the second fails.
- **Round 2:** two quick clicks, and both fail.

**Expected:** `0`, `1 (saving)`, `2 (saving)`, `1`, `2 (saving)`, `3 (saving)`, `1`. Each round ends on what the server holds, and `(saving)` shows while any save is in flight.

## anod

```js
const likes = resource(0);

like: () => likes.set((n) => n + 1, () => api.like()),
```

A resource keeps the server's value next to its own. Each save that succeeds confirms what it returned, even one a newer click superseded, and only the newest save sets the value. When the newest save fails, the value falls back to the server's value. `(saving)` is `c.pending(likes)`, and `c.rejected(likes)` would give the error.

- **Round 1:** the first save returns 1 while the second is in flight, so the server's value is 1. The second fails, and the count falls back to 1.
- **Round 2:** both fail, and the count falls back to 1, not to the first click's guess.

There is no rollback code and no extra request.

- **The caveat:** the server's value is only as good as what a save returns. Here `api.like()` returns the count. A save that returns nothing confirms its optimistic value, which is right for one writer but not when other users change the count too. For those, `refresh()` with a loader gets the real value, as Solid's `refresh(server)` does.

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

**anod and Solid:** a failed write reverts by itself, with no code.

- **anod** keeps the server's value next to the value, and falls back to it. It needs no extra request.
- **Solid** layers the optimistic writes over the server value, and drops them when the actions end; it refetches the server value with `refresh`.
- **TanStack Query's** official recipe is wrong under overlap. The correct one is a non-obvious pattern from a blog post.
- **Jotai and Svelte** need hand-written bookkeeping.

| | Rollback code | Naive recipe correct |
|---|---|---|
| anod | none | yes |
| React + TanStack Query | invalidate when last | no (official recipe is wrong) |
| Solid 2.0 | none | yes |
| Jotai | sequence number + confirmed | no |
| Svelte 5 | counter + confirmed | no |
