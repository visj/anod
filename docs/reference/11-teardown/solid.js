import { createRoot, createSignal, createEffect, createRenderEffect } from "@solidjs/signals";

export function mount({ api, show }) {
	const [channel, setChannel] = createSignal("A");
	/** Holds its channel, so a message is never shown under the wrong name. */
	const [last, setLast] = createSignal({ name: "A", msg: "waiting" });

	const unmount = createRoot((dispose) => {
		createEffect(channel, (name) => {
			setLast({ name, msg: "waiting" });
			const socket = api.connect(name, (msg) => setLast({ name, msg }));
			/** Runs before the next channel opens, and on dispose. */
			return () => socket.close();
		});

		createRenderEffect(last, ({ name, msg }) => show(`${name}: ${msg}`));
		return dispose;
	});

	return { setChannel, unmount };
}
