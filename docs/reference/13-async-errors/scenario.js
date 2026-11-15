/**
 * Async errors. The first load fails; the view shows the error and the
 * user retries, and the second load succeeds. Separately, a background
 * side effect (sending analytics) fails after an await: that error must
 * reach an app-level handler, not vanish as an unhandled rejection.
 *
 * app: retry(). The app loads on mount, and sends analytics on mount.
 */
import { request } from "../_harness/api.js";

export function createApi(ctx) {
	let attempts = 0;
	return {
		load() {
			const n = ++attempts;
			return request(ctx, n === 1
				? { error: new Error("Server 500"), ms: 20 }
				: { value: "ok", ms: 20 });
		},
		sendAnalytics() {
			return request(ctx, { error: new Error("analytics down"), ms: 30 });
		},
		report(error) {
			ctx.event(`reported: ${error.message}`);
		}
	};
}

export async function drive(app, { wait }) {
	await wait(50);
	app.retry();
	await wait(60);
}

export const expected = {
	shown: ["loading", "error: Server 500", "loading", "data: ok"],
	events: ["reported: analytics down"]
};
