import { createRoot, createSignal, createMemo, createEffect, onCleanup } from "@solidjs/signals";

export function mount({ api }) {
	const [selected, setSelected] = createSignal(1);

	const unmount = createRoot((dispose) => {
		/**
		 * Effects split the tracked, possibly async, compute from the side
		 * effect. The awaits go in async memos; a stale result is dropped.
		 */
		const bytes = createMemo(() => {
			const controller = new AbortController();
			onCleanup(() => controller.abort());
			return api.load(selected(), controller.signal);
		});
		const image = createMemo(() => api.decode(bytes()));

		/** Runs only with a settled image, never with one from a replaced run. */
		createEffect(image, (img) => api.draw(img));
		return dispose;
	});

	return { select: setSelected, unmount };
}
