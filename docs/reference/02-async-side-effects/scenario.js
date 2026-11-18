/**
 * An async side effect: when the selected photo changes, load it,
 * decode it, then draw it to a canvas. Photo 1 loads slowly, and the
 * user selects photo 2 before it arrives. Only photo 2 may be drawn,
 * and the load of photo 1 should be aborted.
 *
 * There is no derived value here, only a side effect with two awaits
 * in it, so a query cache doesn't apply.
 *
 * app: select(id). The app starts with photo 1 selected.
 */
import { request } from "../_harness/api.js";

export function createApi(ctx) {
	return {
		load(id, signal) {
			return request(ctx, { value: `bytes-${id}`, ms: id === 1 ? 80 : 20, signal, label: `load ${id}` });
		},
		/** Can't be cancelled. */
		decode(bytes) {
			return request(ctx, { value: bytes.replace("bytes", "image"), ms: 10 });
		},
		draw(image) {
			ctx.event(`draw ${image}`);
		}
	};
}

export async function drive(app, { wait }) {
	await wait(10);
	app.select(2);
	await wait(120);
}

export const expected = {
	shown: [],
	events: ["abort load 1", "draw image-2"]
};
