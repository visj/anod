import { root, resource } from "anod";

export function mount({ api, show }) {
	const todos = resource(["a"]);

	const app = root((c) => {
		c.effect(todos, (list) => show(list.join(", ")));
	});

	return {
		/** An async write: keeps the list visible until the server answers. */
		refetch: () => todos.set(async (c) => await c.suspend(api.list())),
		/**
		 * An optimistic write. Any write to a resource ends the async
		 * write in flight, so the refetch's snapshot is dropped.
		 */
		add: (text) =>
			todos.set([...todos.get(), text], async (c) => await c.suspend(api.add(text))),
		unmount: () => app.dispose()
	};
}
