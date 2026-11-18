/**
 * Reading a value without letting it cancel the work. A request is made
 * with the current auth token. The token is refreshed while the request
 * is in flight: that must not abort the request (it is still valid),
 * but once it has arrived, the data is fetched again with the new token.
 *
 * app: setToken(token). The app starts with "t1".
 */
import { request } from "../_harness/api.js";

export function createApi(ctx) {
	return {
		data(token, signal) {
			ctx.event(`fetch with ${token}`);
			return request(ctx, { value: `data for ${token}`, ms: 40, signal, label: token });
		}
	};
}

export async function drive(app, { wait }) {
	await wait(10);
	app.setToken("t2");
	await wait(120);
}

export const expected = {
	shown: ["loading", "data for t1", "data for t2"],
	events: ["fetch with t1", "fetch with t2"]
};
