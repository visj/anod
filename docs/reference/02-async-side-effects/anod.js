import { root, signal } from "anod";

export function mount({ api }) {
	const selected = signal(1);

	const app = root((c) => {
		/**
		 * A spawn is an async effect. When selected changes, the run in
		 * flight is aborted, and its continuation never runs past the
		 * c.suspend() it is waiting on, whichever await that is.
		 */
		c.spawn(selected, async (id, c) => {
			const bytes = await c.suspend(api.load(id, c.controller().signal));
			const image = await c.suspend(api.decode(bytes));
			api.draw(image);
		});
	});

	return {
		select: (id) => selected.set(id),
		unmount: () => app.dispose()
	};
}
