/**
 * Mount helpers for the frameworks that render: React and Svelte run
 * in happy-dom. Each returns an async unmount function.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (typeof document === "undefined") {
	GlobalRegistrator.register();
}

export async function mountReact(element) {
	const { createRoot } = await import("react-dom/client");
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	root.render(element);
	return async () => {
		root.unmount();
		container.remove();
	};
}

export async function mountSvelte(Component, props) {
	const { mount, unmount } = await import("svelte");
	const target = document.createElement("div");
	document.body.appendChild(target);
	const app = mount(Component, { target, props });
	return async () => {
		await unmount(app);
		target.remove();
	};
}
