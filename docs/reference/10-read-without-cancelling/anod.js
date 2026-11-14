import { root, signal } from "anod";

export function mount({ api, show }) {
	const token = signal("t1");

	const app = root((c) => {
		const data = c.task(async (c) => {
			/**
			 * Read now, subscribed when the run settles: a change in flight
			 * doesn't cancel it, but runs it again once it is done.
			 */
			const t = c.defer(token);
			return await c.suspend(api.data(t, c.controller().signal));
		});

		c.effect(data, (text) => show(text ?? "loading"));
	});

	return {
		setToken: (t) => token.set(t),
		unmount: () => app.dispose()
	};
}
