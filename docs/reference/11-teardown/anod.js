import { root, signal } from "anod";

export function mount({ api, show }) {
	const channel = signal("A");

	const app = root((c) => {
		c.effect(channel, (name, c) => {
			const last = signal("waiting");
			const socket = api.connect(name, (msg) => last.set(msg));
			/** Runs before the next channel opens, and on dispose. */
			c.cleanup(() => socket.close());
			/** A child: disposed with the run that created it. */
			c.effect(last, (msg) => show(`${name}: ${msg}`));
		});
	});

	return {
		setChannel: (name) => channel.set(name),
		unmount: () => app.dispose()
	};
}
