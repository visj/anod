import { root, signal } from "anod";

export function mount({ api, show }) {
	const price = signal(10);
	const quantity = signal(1);
	let total;

	const app = root((c) => {
		total = c.compute((c) => c.val(price) * c.val(quantity));
		c.effect(total, (t) => show(`total ${t}`));
	});

	return {
		setQuantity(n) {
			quantity.set(n);
			/** The graph is up to date when set() returns. */
			api.track(total.get());
		},
		unmount: () => app.dispose()
	};
}
