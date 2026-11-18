import { createRoot, createSignal, createMemo, createEffect, createRenderEffect, createLoadingBoundary, onCleanup, untrack, refresh } from "@solidjs/signals";

export function mount({ api, show }) {
	const [token, setToken] = createSignal("t1");

	const unmount = createRoot((dispose) => {
		/**
		 * Workaround: there is no "read now, subscribe once settled". The
		 * memo reads the token untracked, so a change can't re-run it, and
		 * an effect, which only runs once data has settled, refreshes it
		 * if the token has moved on.
		 */
		let used;
		const data = createMemo(() => {
			used = untrack(token);
			const controller = new AbortController();
			onCleanup(() => controller.abort());
			return api.data(used, controller.signal);
		});
		createEffect(
			() => (data(), token()),
			(t) => {
				if (t !== used) {
					refresh(data);
				}
			}
		);

		createLoadingBoundary(
			() => createRenderEffect(data, show),
			() => show("loading")
		);
		return dispose;
	});

	return { setToken, unmount };
}
