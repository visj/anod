# 07. A background refetch races an optimistic write

A refetch reads the server, and while it is in flight the user adds a todo, which is shown at once and saved. The refetch then returns its snapshot, taken before the add, and overwrites the new todo for a moment or for good. This is one of the most common bugs in data-fetching code, and TanStack's docs have a dedicated step for it.

**Scenario.** The list starts as `["a"]`. A refetch starts (80ms, snapshot `["a"]`). At 10ms the user adds `"b"`, which is saved in 20ms. The refetch returns at 80ms.

- **Expected:** `a`, `a, b`. `a, b` is shown before the server has saved it, and the snapshot never puts the list back to `a`.

## anod

```js
const todos = resource(["a"], async (c) => await c.suspend(api.list(c.controller().signal)), DEFER);

refetch: () => todos.refresh(),
add: (text) => todos.set((list) => [...list, text], () => api.add(text)),
```

The loader is the refetch, and `refresh()` runs it. `DEFER` makes the seed the server's value until then, as `initialData` with `staleTime: Infinity` does in TanStack, and the `prev` check does in Solid; without it, the loader would load at mount, as a task runs at creation. A write supersedes the load in flight and aborts its controller, so the old snapshot is never shown. The add is a save, and what it returns is the server's list.

## React + TanStack Query

```jsx
const add = useMutation({
	mutationFn: (text) => api.add(text),
	onMutate: async (text) => {
		await queryClient.cancelQueries({ queryKey: todosKey });
		queryClient.setQueryData(todosKey, (old) => [...old, text]);
	},
	onSettled: () => queryClient.invalidateQueries({ queryKey: todosKey })
});
```

This is the documented optimistic-update recipe. The `cancelQueries` step exists for exactly this race.

- **Naive:** without `cancelQueries` and the invalidate, the snapshot lands on top: `a`, `a, b`, `a`. Adding only the invalidate passes by luck, since `invalidateQueries` cancels a refetch in flight by default.
- **Cost:** a second fetch after every mutation.

## Solid 2.0

```js
const server = createMemo((prev) => (prev === void 0 ? ["a"] : api.list()));
const [todos, setTodos] = createOptimistic(() => server());
const add = action(function* (text) {
	setTodos((list) => [...list, text]);
	yield api.add(text);
	refresh(server);
});
```

`createOptimistic` layers the writes of the actions in flight over the server value, and keeps the layer until the action's transition ends, including the `refresh` it starts. That refresh replaces the slow one, so the old snapshot is never committed. The `prev` seed stands in for "rendered with `["a"]`, no request yet".

## Jotai: workaround

```js
const inflight = atom(null);
const add = atom(null, async (get, set, text) => {
	get(inflight)?.abort();
	set(todos, [...get(todos), text]);
	await api.add(text);
});
```

Jotai's write atoms have no notion of supersession, so the refetch keeps its controller in an atom and every write aborts it by hand.

- **Naive:** `a`, `a, b`, `a`.

## Svelte 5: workaround

Async mode doesn't cover writes, so this is plain `$state`, with each write aborting the refetch's controller by hand, as in Jotai.

- **Naive:** `todos = await api.list()` gives `a`, `a, b`, `a`.

## Verdict

**anod and Solid solve it structurally.**

- **anod:** a write supersedes the load in flight on the same resource, and aborts it.
- **Solid:** optimistic layers are held through the action's transition.

TanStack has a documented recipe. Jotai and Svelte leave it to you.

| | Race handled by | Naive result |
|---|---|---|
| anod | a write supersedes and aborts the load in flight | correct |
| React + TanStack Query | `cancelQueries` in `onMutate` | `a` comes back |
| Solid 2.0 | `createOptimistic` + `action` + `refresh` | n/a (the optimistic API is the idiom) |
| Jotai | hand-written abort | `a` comes back |
| Svelte 5 | hand-written abort | `a` comes back |
