import { mountSvelte } from "../_harness/dom.js";
import App from "./App.svelte";

export async function mount({ api, show }) {
	const app = {};
	const expose = (controls) => Object.assign(app, controls);
	app.unmount = await mountSvelte(App, { api, show, expose });
	return app;
}
