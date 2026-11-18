import { root } from "anod";

export function mount({ api, show }) {
	let data;

	const app = root((c) => {
		/** The app-level handler: whatever nothing below handles. */
		c.recover((err) => api.report(err.error));

		data = c.task(async (c) => await c.suspend(api.load()));

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
		/** Runs the task again, with nothing it reads changed. */
		retry: () => data.refresh(),
		unmount: () => app.dispose()
	};
}
