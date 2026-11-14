import { root, signal } from "anod";

export function mount({ api, show }) {
	const userId = signal(1);

	const app = root((c) => {
		const user = c.task(userId, async (id, c) => {
			return await c.suspend(api.user(id, c.controller().signal));
		});
		const posts = c.task(userId, async (id, c) => {
			return await c.suspend(api.posts(id, c.controller().signal));
		});

		/**
		 * Waits for both, so it only ever holds a pair from the same
		 * user. While the next pair loads, it keeps the last one.
		 */
		const page = c.task(async (c) => {
			const [name, list] = await c.suspend([user, posts]);
			return `${name} | ${list.join(", ")}`;
		});

		c.effect(page, (text) => show(text ?? "loading"));
	});

	return {
		selectUser: (id) => userId.set(id),
		unmount: () => app.dispose()
	};
}
