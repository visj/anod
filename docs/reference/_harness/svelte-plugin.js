/**
 * Bun preload: compiles .svelte files for the client, with Svelte's
 * experimental async mode on (await in $derived and in markup).
 */
import { plugin } from "bun";
import { compile } from "svelte/compiler";

plugin({
	name: "svelte",
	setup(build) {
		build.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
			const source = await Bun.file(path).text();
			const out = compile(source, {
				filename: path,
				generate: "client",
				experimental: { async: true }
			});
			return { contents: out.js.code, loader: "js" };
		});
	}
});
