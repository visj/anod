# 06. Tearing

A header shows the user's name and a list shows their posts. Both come from the same id, from requests that take different times. After a switch, the fast request lands first, and a naive UI shows one user's name over another user's posts. The fix is to hold the old pair until the new pair is complete.

**Scenario.** User 1 loads (user 20ms, posts 60ms). At 100ms the user switches to user 2.

- **Expected:** `loading`, `Ada | a1, a2`, `Bob | b1`. `Bob | a1, a2` is never shown.

## anod

```js
const page = c.task(async (c) => {
	const [name, list] = await c.suspend([user, posts]);
	return `${name} | ${list.join(", ")}`;
});
c.effect(page, (text) => show(text ?? "loading"));
```

An array suspend waits until every task has settled, so the joined value is always a consistent pair. A task keeps its last value while it loads, so the old pair stays up.

## React + TanStack Query: workaround

```jsx
const pair = useQueries({
	queries: [userQuery, postsQuery],
	combine: ([user, posts]) => (user.isSuccess && posts.isSuccess ? `${user.data} | ${posts.data.join(", ")}` : undefined)
});
const [last, setLast] = useState("loading");
if (pair !== undefined && pair !== last) setLast(pair);
const text = pair ?? last;
```

`keepPreviousData` works per query, so the user switches before the posts. The last complete pair has to be kept by hand, in state set during render.

React's own answer is `useSuspenseQueries` inside a transition, which doesn't tear. But React 19 delays revealing content for up to 300ms after a fallback was shown, longer than this scenario runs.

- **Naive:** two `useQuery` calls, each with `keepPreviousData`, show `Bob | a1, a2`.

## Solid 2.0

```js
const user = createMemo(() => api.user(userId(), abortSignal()));
const posts = createMemo(() => api.posts(userId(), abortSignal()));
createRenderEffect(() => `${user()} | ${posts().join(", ")}`, show);
```

Both memos start in the same transition when `userId` changes, and it commits once both have settled. Consistency comes globally, without writing a join.

## Jotai

```js
const page = atom(async (get) => {
	const [name, list] = await Promise.all([get(user), get(posts)]);
	return `${name} | ${list.join(", ")}`;
});
const view = unwrap(page, keepPrevious);
```

This is the same join as anod's, with `unwrap` keeping the last pair.

- **Naive:** two separate `unwrap`s tear.

## Svelte 5

```svelte
const name = $derived(api.user(userId, getAbortSignal()));
const posts = $derived(api.posts(userId, getAbortSignal()));
const text = $derived(`${await name} | ${(await posts).join(", ")}`);
```

Svelte holds a state change back from the UI until the async work it caused has completed, so it can't tear, even naively.

- **Naive:** two sequential `$derived(await …)` calls also pass, at the cost of a waterfall: the posts request starts only after the user arrives. In dev mode the compiler warns about it.

## Verdict

**Solid and Svelte win:** consistency is global, so even the naive code doesn't tear.

- **anod and Jotai** need an explicit join, one short task or atom, which is easy once you know to write it.
- **React + TanStack Query** needs a manual workaround, or Suspense, whose reveal throttle fights short timelines.

| | Naive code tears | Fix |
|---|---|---|
| anod | yes, if the effect reads both directly | `c.suspend([user, posts])` |
| React + TanStack Query | yes | `useQueries` + keep last pair by hand |
| Solid 2.0 | no (transitions) | — |
| Jotai | yes | `Promise.all` atom + `unwrap` |
| Svelte 5 | no (synchronized updates) | — |
