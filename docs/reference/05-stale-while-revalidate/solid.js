import { createRoot, createSignal, createMemo, createRenderEffect, createLoadingBoundary, isPending, onCleanup } from "@solidjs/signals";

export function mount({ api, show }) {
	const [page, setPage] = createSignal(1);

	const unmount = createRoot((dispose) => {
		const list = createMemo(() => {
			const controller = new AbortController();
			onCleanup(() => controller.abort());
			return api.page(page(), controller.signal);
		});

		/**
		 * The fallback only covers the first load. After that, a change is
		 * a transition: the old page stays, and isPending marks it stale.
		 */
		createLoadingBoundary(
			() =>
				createRenderEffect(() => {
					const { n, items } = list();
					const text = `page ${n}: ${items.join(", ")}`;
					return isPending(list) ? `${text} (updating)` : text;
				}, show),
			() => show("loading")
		);
		return dispose;
	});

	return { setPage, unmount };
}
