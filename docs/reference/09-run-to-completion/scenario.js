/**
 * An async job that must run to completion. A list of items is saved one
 * by one. If the list changes mid-save, the save in progress finishes
 * first; then one more save runs with the latest list (the lists in
 * between are skipped). Unmounting waits for the save in progress, then
 * reports that the shutdown is complete.
 *
 * In ember-concurrency's terms this is a keepLatest task.
 *
 * app: setItems(list). The app starts with ["a", "b"].
 */
import { request } from "../_harness/api.js";

export function createApi(ctx) {
	return {
		save(item) {
			return request(ctx, { value: () => ctx.event(`saved ${item}`), ms: 20 });
		},
		done() {
			ctx.event("batch done");
		},
		shutdown() {
			ctx.event("shutdown complete");
		}
	};
}

/** Unmounts at 50ms, while "d" is being saved. */
export async function drive(app, { wait }) {
	await wait(10);
	app.setItems(["c"]);
	await wait(5);
	app.setItems(["d"]);
	await wait(35);
}

export const expected = {
	shown: [],
	events: ["saved a", "saved b", "batch done", "saved d", "batch done", "shutdown complete"]
};
