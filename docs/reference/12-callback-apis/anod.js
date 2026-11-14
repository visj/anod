import { root, signal } from "anod";

export function mount({ api, show }) {
	const name = signal("A");

	const app = root((c) => {
		/**
		 * No promise: the task settles when resolve is called, and a
		 * resolve from a run that has been replaced is ignored.
		 */
		const result = c.task(name, (n, c) => {
			c.suspend((resolve, reject) => api.lookup(n, resolve, reject));
		});

		c.effect((c) => {
			if (c.pending(result)) {
				show(`looking up ${name.get()}`);
			} else {
				const { name, id } = c.val(result);
				show(`${name} is #${id}`);
			}
		});
	});

	return {
		lookup: (n) => name.set(n),
		unmount: () => app.dispose()
	};
}
