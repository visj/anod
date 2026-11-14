import { root, signal } from "anod";

export function mount({ api }) {
	const items = signal(["a", "b"]);

	const app = root((c) => {
		/** Runs once the tree below has been torn down. */
		c.cleanup(() => api.shutdown());

		c.spawn(items, async (list, c) => {
			/**
			 * Changes wait for this run to end, then run it once with the
			 * latest list. Disposal waits too.
			 */
			c.shield();
			for (const item of list) {
				await c.suspend(api.save(item));
			}
			api.done();
		});
	});

	return {
		setItems: (list) => items.set(list),
		unmount: () => app.dispose()
	};
}
