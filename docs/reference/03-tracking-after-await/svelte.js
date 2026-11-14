import { mountSvelte } from "../_harness/dom.js";
import Root from "./Root.svelte";

export async function mount({ api, show }) {
	const app = {};
	const expose = (controls) => Object.assign(app, controls);
	app.unmount = await mountSvelte(Root, { api, show, expose });
	return app;
}
