import { createRoot, createMemo, createEffect, createRenderEffect, createLoadingBoundary, createErrorBoundary, isPending } from "@solidjs/signals";

export function mount({ api, show }) {
	let retry;

	const unmount = createRoot((dispose) => {
		const data = createMemo(() => api.load());

		/** <Errored><Loading><p>data: {data()}</p></Loading></Errored> */
		createErrorBoundary(
			() =>
				createLoadingBoundary(
					() => createRenderEffect(data, (d) => show(`data: ${d}`)),
					() => show("loading")
				),
			(err, reset) => {
				/** Resetting re-renders the children, and reading an errored memo re-runs it. */
				retry = reset;
				/**
				 * Workaround: the retry is a transition, so the error stays up
				 * until the data arrives instead of falling back to loading.
				 * isPending shows that it is loading.
				 */
				createRenderEffect(() => (isPending(data) ? "loading" : `error: ${err.message}`), show);
			}
		);

		/** A rejected compute goes to the effect's error handler. */
		createEffect(() => api.sendAnalytics(), {
			effect() {},
			error: (err) => api.report(err)
		});
		return dispose;
	});

	return { retry: () => retry(), unmount };
}
