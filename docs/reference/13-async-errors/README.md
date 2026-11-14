# 13. Async errors

Two kinds of async failure:

- **A load that fails.** The view shows the error, and the user retries.
- **A background side effect that fails after an await** (sending analytics). That error must reach an app-level handler, not vanish as an unhandled rejection.

Error boundaries in most UI libraries only see errors thrown during rendering.

**Scenario.** The first load fails (`Server 500`). At 50ms the user retries, and the second load succeeds. Analytics, sent on mount, fails at 30ms.

- **Expected:** `loading`, `error: Server 500`, `loading`, `data: ok`.
- **Expected events:** `reported: analytics down`.

## anod: known gap

```js
c.recover((err) => api.report(err.error));

const data = c.task(attempt, async (_, c) => await c.suspend(api.load()));

c.spawn(async (c) => {
	await c.suspend(api.sendAnalytics());
});
```

**Shows:** `loading`, `error: Server 500`, `data: ok`. The middle `loading` is missing.

The analytics failure is a `PANIC` that travels up the owners to the root's `c.recover()`, with no code at the call site.

Two awkward parts:

- **The pending gap again:** the retry re-runs the task, but its readers aren't told that it is loading. See [05](../05-stale-while-revalidate/README.md).
- **There is no `refetch()`:** a task runs again only when something it reads changes, so the retry is an `attempt` counter signal that the task reads. It works, but every library here has a direct way. See [../README.md](../README.md#amendments).

## React + TanStack Query

```jsx
const { data, error, isPending, refetch } = useQuery({ queryKey: ["data"], queryFn: () => api.load(), retry: false });
const { mutate: sendAnalytics } = useMutation({ mutationFn: () => api.sendAnalytics() });

new QueryClient({ mutationCache: new MutationCache({ onError: (err) => api.report(err) }) });
```

`refetch` retries. A query with no data goes back to pending, so `isPending` gives `loading`.

For the background job, React has no path from an effect's rejection to an error boundary. The app-level hook here is TanStack's `MutationCache.onError`, which means routing analytics through `useMutation` just to get it. That is a bit of a stretch.

- **Naive:** with default retries, the first failure is retried silently, and analytics is an unhandled rejection.

## Solid 2.0: two workarounds

```js
createErrorBoundary(
	() => createLoadingBoundary(…),
	(err, reset) => {
		retry = reset;
		createRenderEffect(() => (isPending(data) ? "loading" : `error: ${err.message}`), show);
	}
);
createEffect(() => api.sendAnalytics(), { effect() {}, error: (err) => api.report(err) });
```

The error boundary's `reset` retries.

- **The retry is a transition:** by default the error stays up until the data arrives, so the fallback checks `isPending` to show `loading`.
- **A side effect's error doesn't reach an error boundary:** without its own handler it is only logged with `console.error`. So the handler sits on each effect, not at app level.

## Jotai

`atomWithRefresh` gives retry.

- **Error state:** Jotai 3 removed `loadable` and `unwrap` rethrows, so the error is mapped to a value by hand (`.then(v => …, e => …)`), or left to `Suspense` plus an `ErrorBoundary`.
- **Analytics:** a `useEffect` with `.catch(api.report)`; there is no app-level path.

## Svelte 5

```svelte
<svelte:boundary onerror={(_, r) => (reset = r)}>
	<App />
	{#snippet pending()}…{/snippet}
	{#snippet failed(err)}…{/snippet}
</svelte:boundary>
```

The boundary's `failed` snippet and `reset` make a neat retry: it renders the content again, which loads again and shows `pending`. The background job catches and reports by hand, since a rejection in an effect doesn't reach a boundary.

## Verdict

**Split.**

- **Background errors: anod wins.** A rejection after an await in a spawn is a `PANIC` that reaches the root's `c.recover()`, as a thrown error would. Of the others, only TanStack Query has an app-level hook, and only for work routed through `useMutation`; the rest catch at each call site.
- **Retry UI: anod loses.** The others have a `refetch` or `reset` and a pending state that works. anod has neither today.

| | Retry | "loading" on retry | Background error reaches app handler |
|---|---|---|---|
| anod | counter signal | ✗ (gap) | ✓ `c.recover()` |
| React + TanStack Query | `refetch` | ✓ | via `MutationCache` only |
| Solid 2.0 | boundary `reset` | with `isPending` | ✗ (per-effect handler) |
| Jotai | `atomWithRefresh` | ✓ | ✗ |
| Svelte 5 | boundary `reset` | ✓ | ✗ |
