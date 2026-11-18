# 09. Async work that must run to completion

Most async work should be cancelled when its inputs change, but some must not be: saving a list of items one by one, a multi-step commit, a transaction. If the list changes mid-save, the save in progress has to finish, and then one more save runs with the latest list; the lists in between are skipped. In ember-concurrency's vocabulary this is a `keepLatest` task. Unmounting should wait for the save in progress too, then report that the shutdown is complete.

**Scenario.** The app saves `["a", "b"]`, one item per 20ms. The list changes to `["c"]` at 10ms and to `["d"]` at 15ms. The app unmounts at 50ms, while `"d"` is being saved.

- **Expected events:** `saved a`, `saved b`, `batch done`, `saved d`, `batch done`, `shutdown complete`.

## anod

```js
const app = root((c) => {
	c.cleanup(() => api.shutdown());

	c.spawn(items, async (list, c) => {
		c.shield();
		for (const item of list) {
			await c.suspend(api.save(item));
		}
		api.done();
	});
});
```

`c.shield()` lets the current run finish:

- a change marks the spawn stale, and it runs once more with the latest list when the shielded run ends;
- `dispose()` waits too, then tears the tree down children first, so the root's cleanup is the "shutdown complete" hook.

These are two lines of intent, with no queue.

## React + TanStack Query: workaround

```jsx
useEffect(() => {
	next.current = items;
	running.current ??= (async () => {
		while (next.current !== null && mounted.current) {
			const list = next.current;
			next.current = null;
			for (const item of list) await api.save(item);
			api.done();
		}
		running.current = null;
	})();
}, [items]);
```

React has no task model. A `useMutation` with a `scope` runs mutations one at a time, but it queues *every* list (it would save `"c"`) and can't make unmounting wait. So this is a hand-written keepLatest queue. The unmount cleanup can't block, so it chains `shutdown()` onto the save in progress.

- **Naive:** an async loop per change interleaves: `saved a`, `saved c`, `saved d`, `saved b`.

## Solid 2.0: workaround

The same hand-written queue. The effect hands each list to it, and `unmount` disposes, awaits the queue, then shuts down. Solid has no run-to-completion primitive, and disposal is synchronous.

## Jotai: workaround

The same hand-written queue, driven from a `useEffect`. React can't wait in a cleanup, so `unmount` awaits the save itself.

## Svelte 5: workaround

The same hand-written queue, in an `$effect`. Unmounting can't wait, so the shutdown is chained onto the save in progress.

## Verdict

**anod is unique here.**

- **anod:** run-to-completion, re-run with the latest value, and disposal that waits are built in.
- **Everyone else:** about 15 lines of queue code, written outside the framework. The framework only serves as a trigger, and none of them can make teardown wait.

The other side of it: anod only has this policy and restart (the default). It has no `drop` (ignore changes while busy) or `enqueue` (run every change in order). See [../README.md](../README.md#amendments).

| | keepLatest | Teardown waits |
|---|---|---|
| anod | `c.shield()` | ✓ |
| React + TanStack Query | hand-written (`scope` queues every change) | no, chained by hand |
| Solid 2.0 | hand-written | no, awaited by hand |
| Jotai | hand-written | no, awaited by hand |
| Svelte 5 | hand-written | no, chained by hand |
