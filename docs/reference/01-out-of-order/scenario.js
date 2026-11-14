/**
 * A search box. The request for "a" is slow and the one for "ab" fast,
 * so the response for "a" would arrive last. Only "ab" may be shown,
 * and the request for "a" should be aborted.
 *
 * app: type(q). The app starts with the query "a".
 */
import { request } from "../_harness/api.js";

const DB = ["anod", "ant", "abacus", "absolute"];

export function createApi(ctx) {
	return {
		search(q, signal) {
			return request(ctx, {
				value: { q, items: DB.filter((w) => w.startsWith(q)) },
				ms: q === "a" ? 80 : 20,
				signal,
				label: q
			});
		}
	};
}

export async function drive(app, { wait }) {
	await wait(10);
	app.type("ab");
	await wait(120);
}

export const expected = {
	shown: ["searching", "2 results for ab"],
	events: ["abort a"]
};
