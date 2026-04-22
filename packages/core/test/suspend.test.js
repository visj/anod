import { describe, test, expect, collectAsync } from "#test-runner";
import { signal, root } from "#fyren";

let c; root((_c) => { c = _c; });

const tick = () => Promise.resolve();
const settle = () => tick().then(tick).then(tick);

function capture(fn) {
	const nodes = fn();
	return nodes.map((n) => new WeakRef(n));
}

// ─── 1. Pull-flow: c.pending() + c.val() ────────────────────────────────────

describe("pull-flow: c.pending() with tasks", () => {
	test("effect waits for single task then reads value", async () => {
		let resolve;
		const taskA = c.task((cx) => cx.suspend(new Promise((r) => { resolve = r; })));
		let observed = null;
		let runs = 0;

		c.effect((cx) => {
			runs++;
			if (cx.pending(taskA)) {
				return;
			}
			observed = cx.val(taskA);
		});

		expect(runs).toBe(1);
		expect(observed).toBe(null);

		resolve(42);
		await settle();

		expect(runs).toBe(2);
		expect(observed).toBe(42);
	});

	test("effect waits for multiple tasks then combines values", async () => {
		let resolveA, resolveB, resolveC;
		const taskA = c.task((cx) => cx.suspend(new Promise((r) => { resolveA = r; })));
		const taskB = c.task((cx) => cx.suspend(new Promise((r) => { resolveB = r; })));
		const taskC = c.task((cx) => cx.suspend(new Promise((r) => { resolveC = r; })));
		let observed = null;
		let runs = 0;

		c.effect((cx) => {
			runs++;
			if (cx.pending([taskA, taskB, taskC])) {
				return;
			}
			observed = cx.val(taskA) + cx.val(taskB) + cx.val(taskC);
		});

		expect(runs).toBe(1);
		resolveA(10);
		await settle();
		expect(runs).toBe(2);
		expect(observed).toBe(null); // still pending (B, C)

		resolveB(20);
		await settle();
		expect(runs).toBe(3);
		expect(observed).toBe(null); // still pending (C)

		resolveC(30);
		await settle();
		expect(runs).toBe(4);
		expect(observed).toBe(60);
	});

	test("task re-runs when dep changes, effect re-waits", async () => {
		const s1 = signal(1);
		let taskRuns = 0;
		const taskA = c.task((cx) => {
			taskRuns++;
			const v = cx.val(s1);
			return cx.suspend(Promise.resolve(v * 10));
		});
		let observed = null;
		let effectRuns = 0;

		c.effect((cx) => {
			effectRuns++;
			if (cx.pending(taskA)) {
				return;
			}
			observed = cx.val(taskA);
		});

		await settle();
		expect(observed).toBe(10);
		expect(effectRuns).toBe(2); // first: pending, second: settled

		s1.set(2);
		await settle();
		expect(observed).toBe(20);
		expect(taskRuns).toBe(2);
	});

	test("pending returns false immediately for already-settled task", async () => {
		const taskA = c.task((cx) => cx.suspend(Promise.resolve(99)));
		await settle();

		let observed = null;
		let runs = 0;
		c.effect((cx) => {
			runs++;
			if (cx.pending(taskA)) {
				return;
			}
			observed = cx.val(taskA);
		});
		expect(runs).toBe(1);
		expect(observed).toBe(99);
	});

	test("pending subscribes: effect re-runs when task settles", async () => {
		let resolve;
		const taskA = c.task((cx) => cx.suspend(new Promise((r) => { resolve = r; })));
		let runs = 0;
		let observed = null;

		c.effect((cx) => {
			runs++;
			if (cx.pending(taskA)) {
				observed = "loading";
				return;
			}
			observed = cx.val(taskA);
		});
		expect(observed).toBe("loading");
		expect(runs).toBe(1);

		resolve(100);
		await settle();
		expect(observed).toBe(100);
		expect(runs).toBe(2);
	});

	test("compute uses pending to derive loading state", async () => {
		let resolve;
		const taskA = c.task((cx) => cx.suspend(new Promise((r) => { resolve = r; })));

		const status = c.compute((cx) => {
			if (cx.pending(taskA)) {
				return "loading";
			}
			return "value:" + cx.val(taskA);
		});

		expect(status.get()).toBe("loading");

		resolve(42);
		await settle();
		expect(status.get()).toBe("value:42");
	});

	test("loading suppresses downstream: effect not notified while task restarts", async () => {
		let resolveA;
		const s1 = signal(1);
		const taskA = c.task((cx) => {
			cx.val(s1);
			return cx.suspend(new Promise((r) => { resolveA = r; }));
		});
		let effectRuns = 0;

		c.effect((cx) => {
			effectRuns++;
			if (cx.pending(taskA)) {
				return;
			}
			cx.val(taskA);
		});
		expect(effectRuns).toBe(1);

		// Changing s1 triggers task re-run, but loading suppresses downstream.
		// The effect should NOT re-run while the task is loading.
		s1.set(2);
		await settle();
		expect(effectRuns).toBe(1);

		resolveA(99);
		await settle();
		expect(effectRuns).toBe(2); // settled — now effect runs
	});
});

// ─── 2. c.suspend(nativePromise) leak tests ─────────────────────────────────

describe("suspend(promise): memory safety", () => {
	test("discarded promise does not retain spawn after re-run", async () => {
		const s1 = signal(1);
		const promises = [];

		const r = root((r) => {
			r.spawn(async (cx) => {
				const v = cx.val(s1);
				const p = new Promise((resolve) => {
					// Intentionally never resolve some of these
					if (v > 3) {
						resolve(v);
					}
				});
				promises.push(new WeakRef(p));
				await cx.suspend(p);
			});
		});

		await settle();
		// Trigger multiple re-runs to create abandoned promises
		s1.set(2); await settle();
		s1.set(3); await settle();
		s1.set(4); await settle();
		s1.set(5); await settle();

		r.dispose();
		await collectAsync();

		// The old promises should be collectible (not held by spawn)
		let collected = 0;
		for (const ref of promises) {
			if (!ref.deref()) {
				collected++;
			}
		}
		// At least the first few should be collected (never resolved, spawn moved on)
		expect(collected).toBe(promises.length);
	});

	test("rapid signal updates: spawn doesn't crash or hang", async () => {
		const s1 = signal(0);
		let runs = 0;

		const r = root((r) => {
			r.spawn(async (cx) => {
				runs++;
				cx.val(s1);
				await cx.suspend(new Promise((resolve) => setTimeout(resolve, 50)));
			});
		});

		// Fire off many re-runs rapidly
		for (let i = 1; i <= 10; i++) {
			s1.set(i);
			await tick();
		}
		await settle();
		// Should have re-run for each signal change (or at least several)
		expect(runs >= 5).toBe(true);

		r.dispose();
	});

	test("task: stale activation promise is discarded", async () => {
		let resolvers = [];
		const s1 = signal(1);

		const taskA = c.task((cx) => {
			const v = cx.val(s1);
			return cx.suspend(new Promise((resolve) => {
				resolvers.push({ v, resolve });
			}));
		});

		// Subscribe an effect to make the task eager (FLAG_EAGER via suspend)
		let observed = null;
		c.spawn(async (cx) => {
			observed = await cx.suspend(taskA);
		});

		await tick();
		expect(taskA.loading).toBe(true);
		expect(resolvers.length).toBe(1);

		// Re-run the task by changing dep (task is eager due to awaiter)
		s1.set(2);
		await settle();
		expect(resolvers.length).toBe(2);

		// Resolve the SECOND (current) promise first
		resolvers[1].resolve(222);
		await settle();

		expect(taskA.loading).toBe(false);
		expect(taskA.get()).toBe(222);

		// Resolving the first (stale) promise should be a no-op
		resolvers[0].resolve(111);
		await settle();
		expect(taskA.get()).toBe(222); // unchanged
	});

	test("disposed spawn: pending promise resolution is a no-op", async () => {
		let resolve;
		let cleanupRan = false;

		const r = root((r) => {
			r.spawn(async (cx) => {
				cx.cleanup(() => { cleanupRan = true; });
				await cx.suspend(new Promise((r2) => { resolve = r2; }));
			});
		});

		await settle();
		expect(cleanupRan).toBe(false);

		r.dispose();
		expect(cleanupRan).toBe(true);

		// Resolving after dispose should do nothing
		resolve(42);
		await settle();
		// No crash, no side effects
	});

	test("spawn re-run aborts controller and clears old promise", async () => {
		const s1 = signal(1);
		let aborted = false;
		let controllers = [];

		const r = root((r) => {
			r.spawn(async (cx) => {
				const ctrl = cx.controller();
				controllers.push(ctrl);
				ctrl.signal.addEventListener("abort", () => { aborted = true; });
				cx.val(s1);
				await cx.suspend(new Promise(() => {})); // never resolves
			});
		});

		await settle();
		expect(aborted).toBe(false);
		expect(controllers.length).toBe(1);

		s1.set(2); // re-run spawn
		await settle();
		expect(aborted).toBe(true); // old controller aborted
		expect(controllers.length).toBe(2);

		r.dispose();
	});
});

// ─── 3. c.suspend(task) two-way binding leak tests ───────────────────────────

describe("suspend(task): two-way binding lifecycle", () => {
	test("awaiter disposed while waiting: no retained references", async () => {
		let resolve;
		const taskA = c.task((cx) => cx.suspend(new Promise((r) => { resolve = r; })));

		const refs = capture(() => {
			const nodes = [];
			const r = root((r) => {
				r.spawn(async (cx) => {
					await cx.suspend(taskA);
				});
				nodes.push(r);
			});
			r.dispose();
			return nodes;
		});

		await collectAsync();
		for (const ref of refs) {
			expect(ref.deref()).toBeUndefined();
		}

		// Resolve after disposal — should be a no-op
		resolve(42);
		await settle();
		expect(taskA.get()).toBe(42);
	});

	test("responder disposed while awaiter waiting: awaiter freed", async () => {
		const refs = capture(() => {
			const nodes = [];
			let taskA;
			const r = root((r) => {
				taskA = r.task((cx) => cx.suspend(new Promise(() => {}))); // never resolves
				r.spawn(async (cx) => {
					await cx.suspend(taskA);
				});
				nodes.push(r, taskA);
			});
			r.dispose(); // disposes both task and spawn
			return nodes;
		});

		await collectAsync();
		for (const ref of refs) {
			expect(ref.deref()).toBeUndefined();
		}
	});

	test("multiple awaiters on one task: all freed after dispose", async () => {
		let resolve;
		const taskA = c.task((cx) => cx.suspend(new Promise((r) => { resolve = r; })));

		const refs = capture(() => {
			const nodes = [];
			const r = root((r) => {
				for (let i = 0; i < 5; i++) {
					r.spawn(async (cx) => {
						await cx.suspend(taskA);
					});
				}
				nodes.push(r);
			});
			r.dispose();
			return nodes;
		});

		await collectAsync();
		for (const ref of refs) {
			expect(ref.deref()).toBeUndefined();
		}

		resolve(99);
		await settle();
	});

	test("task settles, awaiter subscribes, then dep changes — full cycle", async () => {
		const s1 = signal(1);
		const taskA = c.task((cx) => cx.suspend(Promise.resolve(cx.val(s1) * 10)));
		await settle();

		let observed = null;
		let runs = 0;
		const r = root((r) => {
			r.spawn(async (cx) => {
				runs++;
				observed = await cx.suspend(taskA);
			});
		});
		await settle();
		expect(observed).toBe(10);
		expect(runs).toBe(1);

		// Update task dep — spawn should re-run
		s1.set(2);
		await settle();
		expect(observed).toBe(20);
		expect(runs).toBe(2);

		r.dispose();
	});

	test("chained tasks: A awaits B awaits C — all freed on dispose", async () => {
		const refs = capture(() => {
			const nodes = [];
			const r = root((r) => {
				const taskC = r.task((cx) => cx.suspend(Promise.resolve(1)));
				const taskB = r.task(async (cx) => {
					const v = await cx.suspend(taskC);
					return cx.suspend(Promise.resolve(v + 1));
				});
				const taskA = r.task(async (cx) => {
					const v = await cx.suspend(taskB);
					return cx.suspend(Promise.resolve(v + 1));
				});
				nodes.push(r, taskA, taskB, taskC);
			});
			r.dispose();
			return nodes;
		});

		await collectAsync();
		for (const ref of refs) {
			expect(ref.deref()).toBeUndefined();
		}
	});

	test("awaiter re-runs before task settles: channel cleaned up", async () => {
		let resolve;
		const taskA = c.task((cx) => cx.suspend(new Promise((r) => { resolve = r; })));

		const s1 = signal(1);
		let runs = 0;

		const r = root((r) => {
			r.spawn(async (cx) => {
				runs++;
				cx.val(s1);
				if (runs <= 3) {
					await cx.suspend(taskA);
				}
				await cx.suspend(tick());
			});
		});
		await settle();
		expect(runs).toBe(1);

		// Force multiple re-runs while task is pending
		s1.set(2); await settle();
		s1.set(3); await settle();
		s1.set(4); await settle();
		expect(runs).toBe(4);

		// Resolve the task — stale awaiters should be gone
		resolve(42);
		await settle();
		expect(taskA.get()).toBe(42);

		r.dispose();
	});

	test("task value updates propagate to awaiter via dep subscription", async () => {
		const s1 = signal(1);
		const taskA = c.task((cx) => cx.suspend(Promise.resolve(cx.val(s1) * 100)));
		await settle();
		expect(taskA.get()).toBe(100);

		let observed = null;
		let runs = 0;
		const r = root((r) => {
			r.spawn(async (cx) => {
				runs++;
				observed = await cx.suspend(taskA);
			});
		});

		await settle();
		expect(observed).toBe(100);
		expect(runs).toBe(1);

		// Updating s1 causes taskA to re-resolve, which should trigger
		// the spawn to re-run (since it subscribed to taskA via suspend)
		s1.set(2);
		await settle();
		expect(observed).toBe(200);

		r.dispose();
	});
});

// ─── 4. Ownership + dispose deep patterns ───────────────────────────────────

describe("ownership: async nodes and disposal", () => {
	test("root dispose cancels all pending tasks and spawns", async () => {
		let taskResolved = false;
		let spawnResolved = false;

		const r = root((r) => {
			r.task(async (cx) => {
				const v = await cx.suspend(new Promise((resolve) => setTimeout(resolve, 100, 1)));
				taskResolved = true;
				return v;
			});
			r.spawn(async (cx) => {
				await cx.suspend(new Promise((resolve) => setTimeout(resolve, 100, 2)));
				spawnResolved = true;
			});
		});

		await settle();
		r.dispose();

		// Wait longer than the timeout
		await new Promise((resolve) => setTimeout(resolve, 150));

		expect(taskResolved).toBe(false);
		expect(spawnResolved).toBe(false);
	});

	test("effect disposal clears owned async nodes", async () => {
		const s1 = signal(1);
		let innerRuns = 0;

		const r = root((r) => {
			r.effect((eff) => {
				eff.spawn(async (cx) => {
					innerRuns++;
					await cx.suspend(Promise.resolve(cx.val(s1)));
				});
			});
		});

		await settle();
		expect(innerRuns).toBe(1);

		// Effect re-run disposes old spawn, creates new one
		s1.set(2);
		await settle();
		expect(innerRuns).toBe(2);

		r.dispose();
	});

	test("nested roots with async: inner dispose doesn't affect outer", async () => {
		const s1 = signal(1);
		let outerRuns = 0;
		let innerRuns = 0;

		const outer = root((r) => {
			r.spawn(async (cx) => {
				outerRuns++;
				cx.val(s1);
				await cx.suspend(tick());
			});

			const inner = r.root((r2) => {
				r2.spawn(async (cx) => {
					innerRuns++;
					cx.val(s1);
					await cx.suspend(tick());
				});
			});
			inner.dispose();
		});

		await settle();
		expect(outerRuns).toBe(1);
		expect(innerRuns).toBe(1);

		s1.set(2);
		await settle();
		expect(outerRuns).toBe(2);
		expect(innerRuns).toBe(1); // inner was disposed

		outer.dispose();
	});

	test("task settles after awaiter subscribes: awaiter gets value", async () => {
		let resolve;
		const taskA = c.task((cx) => cx.suspend(new Promise((r) => { resolve = r; })));

		let observed = null;
		const r = root((r) => {
			r.spawn(async (cx) => {
				observed = await cx.suspend(taskA);
			});
		});
		await settle();
		expect(observed).toBe(null); // still waiting

		resolve(42);
		await settle();
		expect(observed).toBe(42);
		r.dispose();
	});

	test("GC: spawn with long promise chain — all freed after dispose", async () => {
		const refs = capture(() => {
			const nodes = [];
			const r = root((r) => {
				r.spawn(async (cx) => {
					await cx.suspend(Promise.resolve(1));
					await cx.suspend(Promise.resolve(2));
					await cx.suspend(Promise.resolve(3));
					await cx.suspend(Promise.resolve(4));
					await cx.suspend(Promise.resolve(5));
				});
				nodes.push(r);
			});
			nodes.push(r);
			r.dispose();
			return nodes;
		});

		await collectAsync();
		for (const ref of refs) {
			expect(ref.deref()).toBeUndefined();
		}
	});

	test("GC: task with dep + awaiter + controller — all freed", async () => {
		const refs = capture(() => {
			const nodes = [];
			const r = root((r) => {
				const s1 = signal(1);
				const taskA = r.task(async (cx) => {
					cx.controller();
					return cx.suspend(Promise.resolve(cx.val(s1)));
				});
				r.spawn(async (cx) => {
					await cx.suspend(taskA);
				});
				nodes.push(s1, taskA, r);
			});
			r.dispose();
			return nodes;
		});

		await collectAsync();
		for (const ref of refs) {
			expect(ref.deref()).toBeUndefined();
		}
	});

	test("GC: multiple spawns awaiting same task — all freed after resolve + dispose", async () => {
		const refs = capture(() => {
			const nodes = [];
			let resolve;
			const r = root((r) => {
				const taskA = r.task((cx) => cx.suspend(new Promise((r2) => { resolve = r2; })));
				for (let i = 0; i < 5; i++) {
					r.spawn(async (cx) => {
						await cx.suspend(taskA);
					});
				}
				nodes.push(taskA, r);
			});
			resolve(42);
			// settle synchronously won't work, but dispose should clean up
			r.dispose();
			return nodes;
		});

		await collectAsync();
		for (const ref of refs) {
			expect(ref.deref()).toBeUndefined();
		}
	});
});

// ─── 5. c.suspend([...tasks]) — array of tasks ──────────────────────────────

describe("suspend(tasks[]): concurrent task await", () => {
	test("all tasks already settled: returns array", async () => {
		const taskA = c.task((cx) => cx.suspend(Promise.resolve(10)));
		const taskB = c.task((cx) => cx.suspend(Promise.resolve(20)));
		const taskC = c.task((cx) => cx.suspend(Promise.resolve(30)));
		await settle();

		let result = null;
		const r = root((r) => {
			r.spawn(async (cx) => {
				result = await cx.suspend([taskA, taskB, taskC]);
			});
		});
		await settle();
		expect(result).toEqual([10, 20, 30]);
		r.dispose();
	});

	test("all tasks loading: resolves when all settle", async () => {
		let resolveA, resolveB, resolveC;
		const taskA = c.task((cx) => cx.suspend(new Promise((r) => { resolveA = r; })));
		const taskB = c.task((cx) => cx.suspend(new Promise((r) => { resolveB = r; })));
		const taskC = c.task((cx) => cx.suspend(new Promise((r) => { resolveC = r; })));

		let result = null;
		const r = root((r) => {
			r.spawn(async (cx) => {
				result = await cx.suspend([taskA, taskB, taskC]);
			});
		});
		await settle();
		expect(result).toBe(null);

		resolveA(10); await settle();
		expect(result).toBe(null);

		resolveB(20); await settle();
		expect(result).toBe(null);

		resolveC(30); await settle();
		expect(result).toEqual([10, 20, 30]);
		r.dispose();
	});

	test("mixed settled and loading", async () => {
		const taskA = c.task((cx) => cx.suspend(Promise.resolve(10)));
		await settle();

		let resolveB;
		const taskB = c.task((cx) => cx.suspend(new Promise((r) => { resolveB = r; })));
		const taskC = c.task((cx) => cx.suspend(Promise.resolve(30)));
		await settle();

		let result = null;
		const r = root((r) => {
			r.spawn(async (cx) => {
				result = await cx.suspend([taskA, taskB, taskC]);
			});
		});
		await settle();
		expect(result).toBe(null);

		resolveB(20); await settle();
		expect(result).toEqual([10, 20, 30]);
		r.dispose();
	});

	test("one task errors: rejects immediately", async () => {
		const taskA = c.task((cx) => cx.suspend(Promise.resolve(10)));
		const taskB = c.task((cx) => cx.suspend(Promise.reject(new Error("boom"))));
		const taskC = c.task((cx) => cx.suspend(Promise.resolve(30)));
		await settle();

		let caught = null;
		const r = root((r) => {
			r.spawn(async (cx) => {
				cx.recover((err) => { caught = err; return true; });
				await cx.suspend([taskA, taskB, taskC]);
			});
		});
		await settle();
		expect(caught).not.toBeNull();
		r.dispose();
	});

	test("tasks settle in reverse order", async () => {
		let resolveA, resolveB, resolveC;
		const taskA = c.task((cx) => cx.suspend(new Promise((r) => { resolveA = r; })));
		const taskB = c.task((cx) => cx.suspend(new Promise((r) => { resolveB = r; })));
		const taskC = c.task((cx) => cx.suspend(new Promise((r) => { resolveC = r; })));

		let result = null;
		const r = root((r) => {
			r.spawn(async (cx) => {
				result = await cx.suspend([taskA, taskB, taskC]);
			});
		});
		await settle();

		resolveC(30); await settle();
		expect(result).toBe(null);
		resolveB(20); await settle();
		expect(result).toBe(null);
		resolveA(10); await settle();
		expect(result).toEqual([10, 20, 30]);
		r.dispose();
	});

	test("subscribes to all tasks after array completes", async () => {
		const s1 = signal(1);
		const taskA = c.task((cx) => cx.suspend(Promise.resolve(cx.val(s1) * 10)));
		const taskB = c.task((cx) => cx.suspend(Promise.resolve(cx.val(s1) * 100)));
		await settle();

		let result = null;
		let runs = 0;
		const r = root((r) => {
			r.spawn(async (cx) => {
				runs++;
				result = await cx.suspend([taskA, taskB]);
			});
		});
		await settle();
		expect(result).toEqual([10, 100]);
		expect(runs).toBe(1);

		// Changing s1 invalidates both tasks. Each settles independently,
		// which may cause 1-2 extra spawn re-runs depending on timing.
		s1.set(2);
		await settle();
		expect(result).toEqual([20, 200]);
		expect(runs >= 2).toBe(true);
		r.dispose();
	});

	test("does not subscribe during walk (FLAG_BLOCKED)", async () => {
		let resolveA, resolveB;
		const s1 = signal(1);
		const taskA = c.task((cx) => {
			cx.val(s1);
			return cx.suspend(new Promise((r) => { resolveA = r; }));
		});
		const taskB = c.task((cx) => cx.suspend(new Promise((r) => { resolveB = r; })));

		let result = null;
		let runs = 0;
		const r = root((r) => {
			r.spawn(async (cx) => {
				runs++;
				result = await cx.suspend([taskA, taskB]);
			});
		});
		await settle();
		expect(runs).toBe(1);

		// Settle A — should NOT subscribe yet (blocked)
		resolveA(10); await settle();

		// Change s1 — if subscribed to taskA, this causes a re-run
		s1.set(2); await settle();
		expect(runs).toBe(1); // no premature re-run

		// Settle B — array completes, subscribe to both
		resolveB(20); await settle();
		expect(result).toEqual([10, 20]);
		r.dispose();
	});

	test("dispose while awaiting array: cleanup runs", async () => {
		const taskA = c.task((cx) => cx.suspend(new Promise(() => {})));
		const taskB = c.task((cx) => cx.suspend(new Promise(() => {})));

		let cleanupRan = false;
		const r = root((r) => {
			r.spawn(async (cx) => {
				cx.cleanup(() => { cleanupRan = true; });
				await cx.suspend([taskA, taskB]);
			});
		});
		await settle();
		expect(cleanupRan).toBe(false);

		r.dispose();
		expect(cleanupRan).toBe(true);
	});

	test("empty array: returns empty array immediately", async () => {
		let result = null;
		const r = root((r) => {
			r.spawn(async (cx) => {
				result = await cx.suspend([]);
			});
		});
		await settle();
		expect(result).toEqual([]);
		r.dispose();
	});

	test("callback variant: all settled, zero Promise allocation", async () => {
		const taskA = c.task((cx) => cx.suspend(Promise.resolve(10)));
		const taskB = c.task((cx) => cx.suspend(Promise.resolve(20)));
		await settle();

		let result = null;
		let errorVal = null;
		const r = root((r) => {
			r.spawn(async (cx) => {
				cx.suspend(
					[taskA, taskB],
					(values) => { result = values; },
					(err) => { errorVal = err; }
				);
				await cx.suspend(tick());
			});
		});
		await settle();
		expect(result).toEqual([10, 20]);
		expect(errorVal).toBe(null);
		r.dispose();
	});

	test("callback variant: loading tasks, callbacks fire on settle", async () => {
		let resolveA, resolveB;
		const taskA = c.task((cx) => cx.suspend(new Promise((r) => { resolveA = r; })));
		const taskB = c.task((cx) => cx.suspend(new Promise((r) => { resolveB = r; })));

		let result = null;
		const r = root((r) => {
			r.spawn(async (cx) => {
				cx.suspend(
					[taskA, taskB],
					(values) => { result = values; },
					() => {}
				);
				await cx.suspend(tick());
			});
		});
		await settle();
		expect(result).toBe(null);

		resolveA(10); await settle();
		expect(result).toBe(null);

		resolveB(20); await settle();
		expect(result).toEqual([10, 20]);
		r.dispose();
	});

	test("callback variant: error calls onReject", async () => {
		const taskA = c.task((cx) => cx.suspend(Promise.resolve(10)));
		const taskB = c.task((cx) => cx.suspend(Promise.reject(new Error("fail"))));
		await settle();

		let errorVal = null;
		let result = null;
		const r = root((r) => {
			r.spawn(async (cx) => {
				cx.recover(() => true);
				cx.suspend(
					[taskA, taskB],
					(values) => { result = values; },
					(err) => { errorVal = err; }
				);
				await cx.suspend(tick());
			});
		});
		await settle();
		expect(result).toBe(null);
		expect(errorVal).not.toBeNull();
		r.dispose();
	});

	test("callback variant: single task settled", async () => {
		const taskA = c.task((cx) => cx.suspend(Promise.resolve(42)));
		await settle();

		let result = null;
		const r = root((r) => {
			r.spawn(async (cx) => {
				cx.suspend(taskA,
					(val) => { result = val; },
					() => {}
				);
				await cx.suspend(tick());
			});
		});
		await settle();
		expect(result).toBe(42);
		r.dispose();
	});

	test("callback variant: single task loading", async () => {
		let resolve;
		const taskA = c.task((cx) => cx.suspend(new Promise((r) => { resolve = r; })));

		let result = null;
		const r = root((r) => {
			r.spawn(async (cx) => {
				cx.suspend(taskA,
					(val) => { result = val; },
					() => {}
				);
				await cx.suspend(tick());
			});
		});
		await settle();
		expect(result).toBe(null);

		resolve(99);
		await settle();
		expect(result).toBe(99);
		r.dispose();
	});
});
