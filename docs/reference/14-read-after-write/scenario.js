/**
 * Read-after-write. A click handler changes the quantity in a cart, then
 * sends the new total to analytics, in the same handler. The total it
 * sends must be the new one.
 *
 * app: setQuantity(n). Price 10, quantity 1.
 */
export function createApi(ctx) {
	return {
		track(total) {
			ctx.event(`track total ${total}`);
		}
	};
}

export async function drive(app, { wait }) {
	await wait(10);
	app.setQuantity(3);
	await wait(20);
}

export const expected = {
	shown: ["total 10", "total 30"],
	events: ["track total 30"]
};
