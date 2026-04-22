import { describe, test, expect } from "#test-runner";
import { signal, root } from "#fyren";

const tick = () => Promise.resolve();
const settle = () => tick().then(tick).then(tick);

describe("stale spawn activation", () => {
	test("old suspend resolve is ignored after spawn re-runs", async () => {
		let resolveOld;
		let observed = [];
		const trigger = signal(0);

		const r = root((c) => {
			c.spawn(async (c) => {
				let val = c.val(trigger);
				if (val === 0) {
					await c.suspend(new Promise((r) => { resolveOld = r; }));
					observed.push("old:" + val);
				} else {
					await c.suspend(Promise.resolve());
					observed.push("new:" + val);
				}
			});
		});

		await settle();
		expect(observed).toEqual([]);

		trigger.set(1);
		await settle();
		expect(observed).toEqual(["new:1"]);

		resolveOld("stale");
		await settle();
		expect(observed).toEqual(["new:1"]);
		r.dispose();
	});

	test("stale effect promise does not trigger _settle after re-run", async () => {
		/**
		 * The async fn returns a Promise. resolvePromise receives it.
		 * If the spawn re-runs, the old activation's time doesn't match.
		 * resolvePromise should NOT call _settle on the stale activation.
		 * We verify by checking that the effect doesn't get stuck in a
		 * weird state (e.g. loading=true after it should have settled).
		 */
		const trigger = signal(0);
		let spawnRef = null;

		const r = root((c) => {
			c.spawn(async (c) => {
				c.val(trigger);
				spawnRef = c;
				await c.suspend(tick());
			});
		});

		await settle();
		expect(spawnRef.loading).toBe(false);

		trigger.set(1);
		await settle();
		/** After re-run and settle, should not be loading. */
		expect(spawnRef.loading).toBe(false);
		r.dispose();
	});

	test("stale effect reject does not trigger _error after re-run", async () => {
		let rejectOld;
		let errors = [];
		const trigger = signal(0);

		const r = root((c) => {
			c.spawn(async (c) => {
				c.recover((err) => {
					errors.push(err.message);
					return true;
				});
				let val = c.val(trigger);
				if (val === 0) {
					await c.suspend(new Promise((_, rej) => { rejectOld = rej; }));
				} else {
					await c.suspend(Promise.resolve());
				}
			});
		});

		await settle();

		trigger.set(1);
		await settle();
		expect(errors).toEqual([]);

		/** Reject old promise — should NOT trigger recover. */
		rejectOld(new Error("stale error"));
		await settle();
		expect(errors).toEqual([]);
		r.dispose();
	});
});
