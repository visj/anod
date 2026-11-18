/**
 * Overlapping optimistic mutations, and rolling back the ones that fail.
 * A like counter: each click shows +1 at once and saves in the
 * background. The view shows "(saving)" while a save is in flight, and
 * must end on what the server holds.
 *
 * Round 1: two quick clicks. The first save succeeds (server: 1), the
 * second fails. The counter must end on 1.
 * Round 2: two quick clicks, and both saves fail. The counter must go
 * back to 1, not to 2: the value before the second click was itself
 * an unconfirmed guess.
 *
 * app: like(). The server count starts at 0.
 */
import { request } from "../_harness/api.js";

export function createApi(ctx) {
	let server = 0;
	let calls = 0;
	return {
		/** The first call succeeds, every later one fails. */
		like() {
			const n = ++calls;
			ctx.event(`like ${n}`);
			return request(ctx, n === 1
				? { value: () => ++server, ms: 40 }
				: { error: new Error("Server 500"), ms: 40 });
		},
		count() {
			ctx.event("fetch count");
			return request(ctx, { value: () => server, ms: 10 });
		}
	};
}

export async function drive(app, { wait }) {
	app.like();
	await wait(10);
	app.like();
	await wait(90);
	app.like();
	await wait(10);
	app.like();
	await wait(110);
}

export const expected = {
	shown: ["0", "1 (saving)", "2 (saving)", "1", "2 (saving)", "3 (saving)", "1"]
};
