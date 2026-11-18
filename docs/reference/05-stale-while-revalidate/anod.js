import { root, signal } from "anod";

export function mount({ api, show }) {
	const page = signal(1);

	const app = root((c) => {
		/** A task keeps its value while it loads the next one. */
		const list = c.task(page, async (n, c) => {
			return await c.suspend(api.page(n, c.controller().signal));
		});

		c.effect((c) => {
			const data = c.val(list);
			if (data === void 0) {
				show("loading");
			} else {
				const text = `page ${data.n}: ${data.items.join(", ")}`;
				show(c.pending(list) ? `${text} (updating)` : text);
			}
		});
	});

	return {
		setPage: (n) => page.set(n),
		unmount: () => app.dispose()
	};
}
