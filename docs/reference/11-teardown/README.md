# 11. Teardown

A live subscription to a chat channel. Switching channels closes the old socket before the new one opens, and unmounting closes the last one. No socket may leak, and the view only shows messages from the current channel. This is the baseline every framework handles, and it shows each one's lifecycle model.

**Scenario.** Channel `A` opens; messages arrive every 20ms. At 30ms the user switches to `B`. The app unmounts at 60ms.

- **Expected:** `A: waiting`, `A: A1`, `B: waiting`, `B: B1`.
- **Expected events:** open A, message A1, close A, open B, message B1, close B.

## anod

```js
c.effect(channel, (name, c) => {
	const last = signal("waiting");
	const socket = api.connect(name, (msg) => last.set(msg));
	c.cleanup(() => socket.close());
	c.effect(last, (msg) => show(`${name}: ${msg}`));
});
```

Each run owns its cleanup and its child effect. A re-run, or the disposal of the root, disposes the child, then runs the cleanup. State made inside the run (`last`) starts fresh with each channel.

## React + TanStack Query

```jsx
function Channel({ api, show, name }) {
	const [last, setLast] = useState("waiting");
	useEffect(() => {
		const socket = api.connect(name, setLast);
		return () => socket.close();
	}, [name]);
	// …
}
<Channel key={channel} name={channel} />
```

The `useEffect` cleanup closes the socket. The `key` remounts the component, so its state resets.

- **Naive:** one component that resets `last` inside the effect commits one frame of `B: A1`.

## Solid 2.0

```js
createEffect(channel, (name) => {
	setLast({ name, msg: "waiting" });
	const socket = api.connect(name, (msg) => setLast({ name, msg }));
	return () => socket.close();
});
```

In Solid 2, an effect's cleanup is its return value.

- **Naive:** Solid 1's habit, `onCleanup` inside the effect callback, is silently dropped, with no warning even in dev. No socket is ever closed, and `B: A1` shows.

## Jotai

```js
const messages = atom((get) => {
	const name = get(channel);
	const last = atom("waiting");
	last.onMount = (set) => {
		const socket = api.connect(name, set);
		return () => socket.close();
	};
	return last;
});
```

An atom per channel, whose `onMount` opens the socket on first subscription and closes it when the last subscriber leaves. It's idiomatic, but it takes Jotai know-how (an atom of atoms).

## Svelte 5

```svelte
$effect(() => {
	last = "waiting";
	const socket = api.connect(channel, (msg) => (last = msg));
	return () => socket.close();
});
```

This is the canonical `$effect` with a returned cleanup.

## Verdict

**A tie on correctness.** Every framework has a cleanup per run. The differences are in what's easy to get wrong:

- React needs a `key` to avoid a torn frame.
- Solid 2 silently ignores Solid 1's `onCleanup` habit.
- anod's ownership tree makes run-scoped state and children natural.

anod's distinctive teardown features aren't exercised here:

- the controller is aborted before the cleanups run;
- a disposal can wait for a shielded run ([09](../09-run-to-completion/README.md)).

| | Cleanup | Easy to get wrong |
|---|---|---|
| anod | `c.cleanup()`, owned children | — |
| React + TanStack Query | `useEffect` return | torn frame without `key` |
| Solid 2.0 | effect return | `onCleanup` silently dropped |
| Jotai | `onMount` return | needs an atom per channel |
| Svelte 5 | `$effect` return | — |
