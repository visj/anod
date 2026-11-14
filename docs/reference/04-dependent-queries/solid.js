import { createRoot, createSignal, createMemo, createRenderEffect, createLoadingBoundary, isPending, onCleanup } from "@solidjs/signals";

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
		/** Reading a pending memo suspends this one: no enabled flag. */
		const projects = createMemo(() => api.projects(user().team, abortSignal()));

		createLoadingBoundary(
			() =>
				createRenderEffect(() => {
					/**
					 * A switch keeps the old pair on screen; isPending lets us
					 * show loading instead. Workaround: read the values first.
					 * Short-circuiting them away behind isPending makes the
					 * beta re-run both requests in a loop.
					 */
					const text = `${user().name}: ${projects().join(", ")}`;
					return isPending(projects) ? "loading" : text;
				}, show),
			() => show("loading")
		);
		return dispose;
	});

	return { selectUser: setUserId, unmount };
}
