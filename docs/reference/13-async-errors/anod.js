import { root, signal } from "anod";

export function mount({ api, show }) {
	/** There is no refetch(): a task re-runs when something it reads changes. */
	const attempt = signal(0);

	const app = root((c) => {
		/** The app-level handler: whatever nothing below handles. */
		c.recover((err) => api.report(err.error));

		const data = c.task(attempt, async (_, c) => await c.suspend(api.load()));

		c.effect((c) => {
			const err = c.rejected(data);
			if (c.pending(data)) {
				show("loading");
			} else if (err) {
				show(`error: ${err.error.message}`);
			} else {
				show(`data: ${c.val(data)}`);
			}
		});

		/** Fails after an await: a PANIC, which goes up to the root. */
		c.spawn(async (c) => {
			await c.suspend(api.sendAnalytics());
		});
	});

	return {
		retry: () => attempt.set((n) => n + 1),
		unmount: () => app.dispose()
	};
}
