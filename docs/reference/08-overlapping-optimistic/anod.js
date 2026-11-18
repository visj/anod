import { root, resource } from "anod";

export function mount({ api, show }) {
	/** Seeded with the count the page was rendered with. */
	const likes = resource(0);

	const app = root((c) => {
		c.effect((c) => {
			const n = c.val(likes);
			show(c.pending(likes) ? `${n} (saving)` : String(n));
		});
	});

	return {
		/**
		 * A save: what api.like() returns is the server's count. When the
		 * newest save fails, the value falls back to the last count the
		 * server confirmed, even one a superseded save returned.
		 */
		like: () => likes.set((n) => n + 1, () => api.like()),
		unmount: () => app.dispose()
	};
}
