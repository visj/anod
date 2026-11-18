import { createRoot, createSignal, createMemo, createRenderEffect, createLoadingBoundary, onCleanup } from "@solidjs/signals";

export function mount({ api, show }) {
	const [query, setQuery] = createSignal("a");

	const unmount = createRoot((dispose) => {
		/**
		 * An async memo ignores the result of a run that has been
		 * replaced. Aborting the request is up to us, in onCleanup.
		 */
		const results = createMemo(() => {
			const controller = new AbortController();
			onCleanup(() => controller.abort());
			return api.search(query(), controller.signal);
		});

		/** <Loading fallback="searching">{...}</Loading> */
		createLoadingBoundary(
			() => createRenderEffect(results, ({ q, items }) => show(`${items.length} results for ${q}`)),
			() => show("searching")
		);
		return dispose;
	});

	return { type: setQuery, unmount };
}
