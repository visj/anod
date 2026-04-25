import { describe, test, expect } from "#test-runner";
import { signal, root, batch } from "#anod";

const tick = () => Promise.resolve();
const settle = () => tick().then(tick).then(tick);

describe("stale task activation", () => {
	test("old promise resolves task with stale value when re-run happens in same flush", async () => {
		/**
		 * A task re-runs within the same batch flush cycle. Both
		 * activations share the same TIME, so _time is identical.
		 * The old promise's captured time matches _time, causing
		 * resolvePromise to incorrectly accept the stale result.
		 */
		let firstResolve;
		let settleCount = 0;
		let settledValues = [];
		const source = signal(1);

		const r = root((c) => {
			const task = c.task(source, async (val, c) => {
				if (val === 1) {
					return await c.suspend(new Promise((r) => { firstResolve = r; }));
				}
				return await c.suspend(Promise.resolve("correct:" + val));
			});

			c.spawn(async (c) => {
				const result = await c.suspend(task);
				settleCount++;
				settledValues.push(result);
			});
		});

		await settle();
		expect(settleCount).toBe(0); // task still loading

		/** Re-run task within the same flush cycle by batching
		 *  with another signal that triggers a pull. */
		batch(() => {
			source.set(2);
		});
		await settle();
		expect(settleCount).toBe(1);
		expect(settledValues).toEqual(["correct:2"]);

		/** Now resolve the OLD promise from activation 1.
		 *  This MUST be ignored — the task already settled with val=2. */
		firstResolve("STALE");
		await settle();

		/** settleCount should still be 1 — old resolve must not
		 *  trigger a second settlement. */
		expect(settleCount).toBe(1);
		expect(settledValues).toEqual(["correct:2"]);
		r.dispose();
	});

	test("_time++ abort in _receive does not break needsUpdate for PENDING nodes", async () => {
		/**
		 * A task with FLAG_FIBER (has abort controller) is still
		 * loading (mid-flight promise) when its dep changes.
		 * _receive sees FLAG_LOADING + FLAG_FIBER, bumps _time,
		 * clears fiber. Then a downstream effect pulls through
		 * needsUpdate. The _time bump must not break the change
		 * detection (dep._ctime > node._time).
		 */
		let taskResolve;
		let taskRuns = 0;
		let effectRuns = 0;
		const source = signal(1);
		let doubled;
		let task;
		const r = root((c) => {
			doubled = c.compute(source, (val) => val * 2);

			task = c.task(doubled, async (val, c) => {
				const ctrl = c.controller(); // creates fiber -> FLAG_FIBER
				taskRuns++;
				/** Slow promise — task stays FLAG_LOADING. */
				return await c.suspend(new Promise((r) => { taskResolve = r; }));
			});

			c.spawn(async (c) => {
				const result = await c.suspend(task);
				effectRuns++;
			});
		});

		/** Task is still loading (promise not resolved). */
		expect(taskRuns).toBe(1);
		expect(effectRuns).toBe(0);

		/**
		 * Change source while task is mid-flight. The task receives
		 * notification with FLAG_LOADING + FLAG_FIBER set.
		 * _receive bumps _time and clears fiber.
		 */
		taskRuns = 0;
		console.log("before set: doubled._time =", doubled._time, "task._time =", task._time);
		source.set(2);
		console.log("after set: doubled._time =", doubled._time, "task._time =", task._time);

		/** Task must re-run with the new value. */
		await settle();
		console.log("after settle: doubled._time =", doubled._time, "task._time =", task._time);
		expect(taskRuns).toBe(1);

		/** Resolve the new promise so spawn can consume. */
		taskResolve(42);
		await settle();
		expect(effectRuns).toBe(1);
		r.dispose();
	});
});


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
