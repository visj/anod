/**
 * Stale-while-revalidate: a paginated list. When the page changes, the
 * old page stays visible, marked as updating, until the new one has
 * arrived. The view never goes blank after the first load.
 *
 * app: setPage(n). The app starts on page 1.
 */
import { request } from "../_harness/api.js";

export function createApi(ctx) {
	return {
		page(n, signal) {
			return request(ctx, { value: { n, items: [`${n}a`, `${n}b`] }, ms: 20, signal, label: `page ${n}` });
		}
	};
}

export async function drive(app, { wait }) {
	await wait(50);
	app.setPage(2);
	await wait(60);
}

export const expected = {
	shown: ["loading", "page 1: 1a, 1b", "page 1: 1a, 1b (updating)", "page 2: 2a, 2b"]
};
