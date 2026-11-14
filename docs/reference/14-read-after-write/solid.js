import { createRoot, createSignal, createMemo, createRenderEffect, flush } from "@solidjs/signals";

export function mount({ api, show }) {
	const [price] = createSignal(10);
	const [quantity, setQuantity] = createSignal(1);
	let total;

	const unmount = createRoot((dispose) => {
		total = createMemo(() => price() * quantity());
		createRenderEffect(total, (t) => show(`total ${t}`));
		return dispose;
	});

	return {
		setQuantity(n) {
			setQuantity(n);
			/** Writes are batched until the next microtask; flush() applies them now. */
			flush();
			api.track(total());
		},
		unmount
	};
}
