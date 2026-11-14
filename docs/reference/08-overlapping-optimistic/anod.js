import { root, resource } from "anod";

export function mount({ api, show }) {
	const likes = resource(0);

	const app = root((c) => {
		c.effect((c) => {
			const n = c.val(likes);
			show(c.pending(likes) ? `${n} (saving)` : String(n));
		});
	});

	return {
		like: () =>
			likes.set(likes.get() + 1, async (c) => {
				try {
					return await c.suspend(api.like());
				} catch {
					/**
					 * Only the latest write gets here: an older one's result
					 * or failure is dropped. The value before this write may
					 * be another unconfirmed guess, so resync with the server.
					 */
					return await c.suspend(api.count());
				}
			}),
		unmount: () => app.dispose()
	};
}
