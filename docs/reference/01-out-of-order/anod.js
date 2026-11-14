import { root, signal } from "anod";

export function mount({ api, show }) {
	const query = signal("a");

	const app = root((c) => {
		/** A re-run aborts the previous request and drops its response. */
		const results = c.task(query, async (q, c) => {
			return await c.suspend(api.search(q, c.controller().signal));
		});

		c.effect((c) => {
			if (c.pending(results)) {
				show("searching");
			} else {
				const { q, items } = c.val(results);
				show(`${items.length} results for ${q}`);
			}
		});
	});

	return {
		type: (q) => query.set(q),
		unmount: () => app.dispose()
	};
}
