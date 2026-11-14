import { createRoot, createMemo, createOptimistic, createRenderEffect, action, refresh } from "@solidjs/signals";

export function mount({ api, show }) {
	let server, todos, setTodos;

	const unmount = createRoot((dispose) => {
		/** Seeded with the list the page was rendered with; refresh() fetches. */
		server = createMemo((prev) => (prev === void 0 ? ["a"] : api.list()));
		/** The server list, plus the writes of any action in flight. */
		[todos, setTodos] = createOptimistic(() => server());

		createRenderEffect(todos, (list) => show(list.join(", ")));
		return dispose;
	});

	/**
	 * The optimistic value is kept until the action's transition is done,
	 * which includes the refresh it starts. That refresh replaces the one
	 * in flight, so the old snapshot is never committed.
	 */
	const add = action(function* (text) {
		setTodos((list) => [...list, text]);
		yield api.add(text);
		refresh(server);
	});

	return { refetch: () => refresh(server), add, unmount };
}
