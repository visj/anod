# 02. Async side effects

Not every async operation produces a value to display. When the selected photo changes, this one loads it, decodes it and draws it to a canvas. A query cache doesn't help here: what goes wrong is that the old run's draw happens after the new one's, or on top of it. Each `await` is a place where the run can have become stale, and the decode step can't be cancelled.

**Scenario.** Photo 1 is selected (load 80ms). At 10ms the user selects photo 2 (load 20ms). Each load is followed by `decode()` (10ms, not cancellable), then `draw()`.

- **Expected events:** `abort load 1`, `draw image-2`. Photo 1 is never drawn.

## anod

```js
c.spawn(selected, async (id, c) => {
	const bytes = await c.suspend(api.load(id, c.controller().signal));
	const image = await c.suspend(api.decode(bytes));
	api.draw(image);
});
```

A spawn is an async effect, and the same guard covers every await:

- a re-run aborts the controller;
- the old run never continues past the `c.suspend()` it is waiting on, whichever one that is.

There is no `aborted` check and no `AbortError` to swallow.

## React + TanStack Query

```jsx
useEffect(() => {
	const controller = new AbortController();
	const { signal } = controller;
	(async () => {
		const bytes = await api.load(selected, signal);
		const image = await api.decode(bytes);
		if (!signal.aborted) {
			api.draw(image);
		}
	})().catch((err) => {
		if (err.name !== "AbortError") throw err;
	});
	return () => controller.abort();
}, [selected]);
```

TanStack Query doesn't apply, so this is plain React. The cleanup aborts the load, but the run has to check `signal.aborted` itself after every await that can't be cancelled, and filter out its own `AbortError`.

- **Naive:** an async function in an effect, with no cleanup, draws `image-2` and then `image-1`.

## Solid 2.0

```js
const bytes = createMemo(() => {
	const controller = new AbortController();
	onCleanup(() => controller.abort());
	return api.load(selected(), controller.signal);
});
const image = createMemo(() => api.decode(bytes()));
createEffect(image, (img) => api.draw(img));
```

Solid 2 splits an effect into a tracked compute and a side effect. The awaits move into a chain of async memos, and the effect only ever runs with a settled image. That's correct and short, but a procedure with several steps has to be reshaped into one memo per step.

- **Naive:** `createEffect(selected, async (id) => …)` crashes on the next run in the production build (`TypeError: this.$e is not a function`), because the returned promise is taken as a cleanup. The dev build reports a clear error instead.

## Jotai

Jotai's atoms are for state, so this uses React's `useEffect`, with the same controller, `aborted` check and `AbortError` filter as the React version. jotai-effect's `atomEffect` is synchronous with a cleanup, so it would need the same code.

## Svelte 5

```svelte
$effect(() => {
	const id = selected;
	const signal = getAbortSignal();
	(async () => {
		const bytes = await api.load(id, signal);
		const image = await api.decode(bytes);
		if (!signal.aborted) api.draw(image);
	})().catch((err) => {
		if (err.name !== "AbortError") throw err;
	});
});
```

`getAbortSignal()` saves the controller, but the rest is manual, as in React. An `async` effect callback is a footgun: it stops tracking at its first `await`.

- **Naive:** `$effect(async () => …)` draws both photos.

## Verdict

**anod's clearest win.**

- Only anod has an async effect whose continuation is guarded at every await.
- Solid gets correctness by making you split the procedure into memos.
- React, Jotai and Svelte leave you to write the abort plumbing, the `aborted` checks and the error filtering by hand.

| | Guarded continuation | Code shape |
|---|---|---|
| anod | ✓ every `c.suspend()` | one spawn |
| React + TanStack Query | manual `aborted` checks | `useEffect` + IIFE + catch |
| Solid 2.0 | ✓ (memo chain) | one memo per await |
| Jotai | manual | `useEffect`, as in React |
| Svelte 5 | manual | `$effect` + IIFE + catch |
