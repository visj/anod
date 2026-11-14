/**
 * A background refetch races an optimistic write. The todo list starts
 * as ["a"]. A slow refetch starts, and reads the server before the user
 * adds "b". The add is shown at once, and saved quickly. The refetch
 * then returns its old snapshot, ["a"], which must not overwrite "b",
 * not even for a moment.
 *
 * app: refetch(), add(text). The app starts with ["a"], no request.
 */
import { request } from "../_harness/api.js";

export function createApi(ctx) {
	let server = ["a"];
	return {
		list(signal) {
			const snapshot = [...server];
			ctx.event("fetch list");
			return request(ctx, { value: snapshot, ms: 80, signal, label: "list" });
		},
		add(text) {
			ctx.event(`save ${text}`);
			return request(ctx, {
				value: () => {
					ctx.event(`saved ${text}`);
					return (server = [...server, text]);
				},
				ms: 20
			});
		}
	};
}

export async function drive(app, { wait }) {
	app.refetch();
	await wait(10);
	app.add("b");
	await wait(140);
}

/** "a, b" must be shown before the server has saved it: optimistically. */
export const expected = {
	shown: ["a", "a, b"],
	order: [["a, b", "saved b"]]
};
