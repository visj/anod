# 04. Dependent queries

The second request needs the first one's result: load a user, then the projects of the user's team. The classic footguns:

- firing the second request with `undefined`;
- typing everything as `T | undefined`;
- a flag to switch the second request off until the first has answered.

**Scenario.** User 1 loads (20ms), then team `x`'s projects (20ms). At 60ms the user switches to user 2.

- **Expected:** `loading`, `Ada: p1, p2`, `loading`, `Bob: p3`.
- **Expected requests, in order:** user 1, projects x, user 2, projects y. No request is made for team `undefined`.

## anod

```js
const user = c.task(userId, async (id, c) => {
	return await c.suspend(api.user(id, c.controller().signal));
});
const projects = c.task(async (c) => {
	const { team } = await c.suspend(user);
	return await c.suspend(api.projects(team, c.controller().signal));
});
c.effect((c) => {
	if (c.pending([user, projects])) show("loading");
	else show(`${c.val(user).name}: ${c.val(projects).join(", ")}`);
});
```

Awaiting a task waits for it to settle, and subscribes to it. When `userId` changes, `projects` waits for the new user, then fetches. There is no enabled flag, and `team` is never `undefined`.

## React + TanStack Query

```jsx
const team = user.data?.team;
const projects = useQuery({
	queryKey: ["projects", team],
	queryFn: ({ signal }) => api.projects(team, signal),
	enabled: team !== undefined
});
const text = user.isPending || projects.isPending ? "loading" : `${user.data.name}: ${projects.data.join(", ")}`;
```

The documented pattern is `enabled`, with `user.data?.team` threaded through the key. A disabled query counts as pending, so one check covers both steps.

- **Naive:** forgetting `enabled` still renders the right text, but fires `fetch projects undefined` twice and logs TanStack's "Query data cannot be undefined" warning.

## Solid 2.0

```js
const user = createMemo(() => api.user(userId(), abortSignal()));
const projects = createMemo(() => api.projects(user().team, abortSignal()));
```

Reading a memo that isn't ready suspends the reader, so the chain needs no flag.

- **Pending UI:** after the first load, a switch is a transition that keeps the old pair on screen, so showing `loading` needs `isPending(projects)`.
- **Workaround:** the render effect has to read both values *before* checking `isPending`. With the obvious `isPending(projects) ? "loading" : …`, beta.8 re-runs both requests in a loop and the view ends stuck on `loading`, in both the dev and prod builds. This is likely a beta bug.

## Jotai

```js
const projects = atom(async (get, { signal }) => {
	const { team } = await get(user);
	return api.projects(team, signal);
});
```

This is the same shape as anod: await the upstream atom, and get no flag and no `undefined`.

## Svelte 5

```svelte
const user = $derived(await api.user(userId, getAbortSignal()));
const projects = $derived(await api.projects(user.team, getAbortSignal()));
const text = $derived($effect.pending() ? "loading" : `${user.name}: ${projects.join(", ")}`);
```

This is the tersest of the five: the second derived waits for the first just by reading it.

- **Naive:** without `$effect.pending()`, Svelte keeps the old UI during the switch, so the middle `loading` never appears. That's arguably a better default.

## Verdict

**anod, Solid, Jotai and Svelte are equivalent here:**

- dependencies chain by reading;
- there is no flag, and no `undefined`.

**TanStack Query** needs `enabled` and optional chaining, which is the price of a keyed cache rather than a graph.

**Solid** works, but hit a beta bug in its pending check.

| | Chains by | Flag needed | Pending UI |
|---|---|---|---|
| anod | `await c.suspend(user)` | no | `c.pending([user, projects])` |
| React + TanStack Query | `enabled` + key | yes | `isPending` |
| Solid 2.0 | reading `user()` | no | `isPending` (beta bug, see above) |
| Jotai | `await get(user)` | no | `unwrap` → `undefined` |
| Svelte 5 | reading `user` | no | `$effect.pending()` |
