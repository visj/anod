import { createRoot, createMemo, createOptimistic, createRenderEffect, isPending, action, refresh } from "@solidjs/signals";

export function mount({ api, show }) {
	let server, likes, setLikes;

	const unmount = createRoot((dispose) => {
		/** Seeded with the count the page was rendered with; refresh() fetches. */
		server = createMemo((prev) => (prev === void 0 ? 0 : api.count()));
		[likes, setLikes] = createOptimistic(() => server());

		createRenderEffect(() => {
			const n = likes();
			return isPending(likes) ? `${n} (saving)` : String(n);
		}, show);
		return dispose;
	});

	/**
	 * Optimistic writes are layered on the server value and all dropped
	 * when the actions are done, so a failure needs no rollback code.
	 */
	const like = action(function* () {
		setLikes((n) => n + 1);
		try {
			yield api.like();
		} catch {
			/** Handled: the +1 goes away on its own. */
		}
		refresh(server);
	});

	return { like, unmount };
}
