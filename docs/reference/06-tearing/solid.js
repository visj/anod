import { createRoot, createSignal, createMemo, createRenderEffect, createLoadingBoundary, onCleanup } from "@solidjs/signals";

/** An AbortSignal that aborts when the computation re-runs or is disposed. */
function abortSignal() {
	const controller = new AbortController();
	onCleanup(() => controller.abort());
	return controller.signal;
}

export function mount({ api, show }) {
	const [userId, setUserId] = createSignal(1);

	const unmount = createRoot((dispose) => {
		const user = createMemo(() => api.user(userId(), abortSignal()));
		const posts = createMemo(() => api.posts(userId(), abortSignal()));

		/**
		 * Both start in the same transition when userId changes, and it
		 * commits once both have settled: the old pair stays until then.
		 */
		createLoadingBoundary(
			() => createRenderEffect(() => `${user()} | ${posts().join(", ")}`, show),
			() => show("loading")
		);
		return dispose;
	});

	return { selectUser: setUserId, unmount };
}
