import { createRoot, createSignal, createEffect } from "@solidjs/signals";

export function mount({ api }) {
	const [items, setItems] = createSignal(["a", "b"]);
	/**
	 * Workaround: nothing in Solid runs async work to completion or makes
	 * disposal wait, so the effect hands lists to a hand-written
	 * keep-latest queue, and unmount awaits it.
	 */
	let latest = null;
	let running = null;

	async function drain() {
		while (latest !== null) {
			const list = latest;
			latest = null;
			for (const item of list) {
				await api.save(item);
			}
			api.done();
		}
		running = null;
	}

	const dispose = createRoot((dispose) => {
		createEffect(items, (list) => {
			latest = list;
			running ??= drain();
		});
		return dispose;
	});

	return {
		setItems,
		async unmount() {
			dispose();
			latest = null;
			await running;
			api.shutdown();
		}
	};
}
