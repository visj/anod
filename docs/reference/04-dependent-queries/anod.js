import { root, signal } from "anod";

export function mount({ api, show }) {
	const userId = signal(1);

	const app = root((c) => {
		const user = c.task(userId, async (id, c) => {
			return await c.suspend(api.user(id, c.controller().signal));
		});

		/** Waits for the user: no enabled flag, and no undefined to handle. */
		const projects = c.task(async (c) => {
			const { team } = await c.suspend(user);
			return await c.suspend(api.projects(team, c.controller().signal));
		});

		c.effect((c) => {
			if (c.pending([user, projects])) {
				show("loading");
			} else {
				show(`${c.val(user).name}: ${c.val(projects).join(", ")}`);
			}
		});
	});

	return {
		selectUser: (id) => userId.set(id),
		unmount: () => app.dispose()
	};
}
