import { root, resource } from "./src/index.js";

// Fake server — saves the batch after 100ms
const saveBatch = (todos) => new Promise((r) => setTimeout(() => r(todos), 1000));

const app = root((c) => {
	const todos = resource([]);

	// Add a todo: appears instantly with saved: false, settles when server confirms
	function addTodo(text) {
		todos.set([...todos.get(), { text, saved: false }], async (c, optimistic) => {
			await c.suspend(saveBatch(optimistic));
			return optimistic.map((t) => ({ ...t, saved: true }));
		});
	}

	// Derived: count of items still saving
	const pending = c.compute(todos, (list) => list.filter((t) => !t.saved).length);

	// Render on every change
	c.effect((c) => {
		const list = c.val(todos);
		const n = c.val(pending);
		const items = list.map((t) => `${t.saved ? "✓" : "⏳"} ${t.text}`).join("  ");
		console.log(items || "(empty)", n > 0 ? `| ${n} saving...` : list.length ? "| all saved" : "");
	});

	addTodo("Build anod");
	setTimeout(() => addTodo("Ship it"), 500);
});
