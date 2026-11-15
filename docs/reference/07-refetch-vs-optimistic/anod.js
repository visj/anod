import { root, resource, DEFER } from "anod";

export function mount({ api, show }) {
	/**
	 * Seeded with the list the page was rendered with. DEFER: the loader
	 * waits for refresh(), the refetch.
	 */
	const todos = resource(["a"], async (c) => await c.suspend(api.list(c.controller().signal)), DEFER);

	const app = root((c) => {
		c.effect(todos, (list) => show(list.join(", ")));
	});

	return {
		refetch: () => todos.refresh(),
		/**
		 * An optimistic write, then a save. A write supersedes the load in
		 * flight and aborts it, so its old snapshot is never shown.
		 */
		add: (text) => todos.set((list) => [...list, text], () => api.add(text)),
		unmount: () => app.dispose()
	};
}
