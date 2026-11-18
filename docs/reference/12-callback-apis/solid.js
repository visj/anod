import { createRoot, createSignal, createMemo, createRenderEffect, createLoadingBoundary } from "@solidjs/signals";

export function mount({ api, show }) {
	const [name, setName] = createSignal("A");

	const unmount = createRoot((dispose) => {
		/** A promise wraps the callbacks; a replaced run's result is ignored. */
		const result = createMemo(() => new Promise((resolve, reject) => api.lookup(name(), resolve, reject)));

		createLoadingBoundary(
			() => createRenderEffect(result, ({ name, id }) => show(`${name} is #${id}`)),
			() => createRenderEffect(name, (n) => show(`looking up ${n}`))
		);
		return dispose;
	});

	return { lookup: setName, unmount };
}
