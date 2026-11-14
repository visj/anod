import { createRoot, createSignal, createMemo, createRenderEffect, createLoadingBoundary } from "@solidjs/signals";

export function mount({ api, show }) {
	const [language, setLanguage] = createSignal("en");

	const unmount = createRoot((dispose) => {
		/**
		 * A read after an await isn't tracked, so the fetch and the
		 * translation are split: a memo that reads an async memo is
		 * itself synchronous, and tracks everything it reads.
		 */
		const doc = createMemo(() => api.doc(1));
		const view = createMemo(() => {
			const d = doc();
			return d.translatable ? api.translate(d.text, language()) : d.text;
		});

		createLoadingBoundary(
			() => createRenderEffect(view, show),
			() => show("loading")
		);
		return dispose;
	});

	return { setLanguage, unmount };
}
