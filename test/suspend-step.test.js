import { describe, test, expect } from "#test-runner";
import { signal, resource, root, batch, PANIC, LOADING, ERROR } from "#anod";

const tick = () => Promise.resolve();
const settle = async (n = 10) => {
	for (let i = 0; i < n; i++) {
		await tick();
	}
};

function deferred() {
	let resolve, reject;
	const promise = new Promise((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

/** A task that loads until the returned resolve/reject is called. */
function gate(r) {
	let d = deferred();
	const task = r.task((cx) => cx.suspend(d.promise));
	return {
		task,
		resolve: (v) => d.resolve(v),
		reject: (e) => d.reject(e),
	};
}

/** A task that has settled with value. */
function done(r, value) {
	return r.task((cx) => cx.suspend((resolve) => resolve(value)));
}

describe("steps: a suspend in a callback continues the run", () => {
	test("settled steps run in the same run, and the run settles with the last result", () => {
		let t;
		const seen = [];
		const r = root((r) => {
			const a = done(r, 1);
			const b = done(r, 2);
			t = r.task((cx) => {
				cx.suspend(a, (x) => {
					cx.suspend(b, (y) => x + y);
				});
			});
			r.effect(t, (v) => {
				seen.push(v);
			});
		});
		expect(t.is(LOADING)).toBe(false);
		expect(t.get()).toBe(3);
		expect(seen).toEqual([3]);
		r.dispose();
	});

	test("a loading step keeps the run loading, and it settles once, with the last result", async () => {
		let t, g;
		const seen = [];
		const r = root((r) => {
			const a = done(r, 1);
			g = gate(r);
			t = r.task((cx) => {
				cx.suspend(a, (x) => {
					cx.suspend(g.task, (y) => x + y);
				});
			});
			r.effect((cx) => {
				if (!cx.pending(t)) {
					seen.push(cx.val(t));
				}
			});
		});
		expect(t.is(LOADING)).toBe(true);
		g.resolve(2);
		await settle();
		expect(t.is(LOADING)).toBe(false);
		expect(t.get()).toBe(3);
		expect(seen).toEqual([3]);
		r.dispose();
	});

	test("a step after a loading step continues the run", async () => {
		let t, g;
		const r = root((r) => {
			g = gate(r);
			const b = done(r, 10);
			t = r.task((cx) => {
				cx.suspend(g.task, (x) => {
					cx.suspend(b, (y) => x + y);
				});
			});
		});
		expect(t.is(LOADING)).toBe(true);
		g.resolve(1);
		await settle();
		expect(t.is(ERROR)).toBe(false);
		expect(t.get()).toBe(11);
		r.dispose();
	});

	test("two loading steps settle the run with the last result", async () => {
		let t, g, h;
		const r = root((r) => {
			g = gate(r);
			h = gate(r);
			t = r.task((cx) => {
				cx.suspend(g.task, (x) => {
					cx.suspend([h.task], ([y]) => x * y);
				});
			});
		});
		g.resolve(3);
		await settle();
		expect(t.is(LOADING)).toBe(true);
		h.resolve(4);
		await settle();
		expect(t.get()).toBe(12);
		r.dispose();
	});

	test("a long chain of settled steps runs in constant stack", () => {
		let t;
		const r = root((r) => {
			const a = done(r, 1);
			t = r.task((cx) => {
				const loop = (i, sum) => {
					if (i === 20000) {
						return sum;
					}
					cx.suspend(a, (x) => loop(i + 1, sum + x));
				};
				return loop(0, 0);
			});
		});
		expect(t.get()).toBe(20000);
		r.dispose();
	});

	test("a step whose callback returns without suspending ends the chain", () => {
		let t;
		const r = root((r) => {
			const xs = [done(r, 1), done(r, 2), done(r, 3)];
			t = r.task((cx) => {
				let sum = 0;
				const loop = (i) => {
					if (i === xs.length) {
						return sum;
					}
					cx.suspend(xs[i], (x) => {
						sum += x;
						return loop(i + 1);
					});
				};
				return loop(0);
			});
		});
		expect(t.get()).toBe(6);
		r.dispose();
	});

	test("a re-run drops the steps the old run hadn't reached", async () => {
		const s = signal("a");
		const got = [];
		let g, h;
		const r = root((r) => {
			g = gate(r);
			h = gate(r);
			r.spawn((cx) => {
				const tag = cx.val(s);
				cx.suspend(g.task, (x) => {
					cx.suspend(h.task, (y) => {
						got.push(tag + x + y);
					});
				});
			});
		});
		g.resolve(1);
		await settle();
		s.set("b");
		h.resolve(2);
		await settle();
		expect(got).toEqual(["b12"]);
		r.dispose();
	});

	test("disposing the node drops the steps it hadn't reached", async () => {
		const got = [];
		let g, h, t;
		const r = root((r) => {
			g = gate(r);
			h = gate(r);
			t = r.task((cx) => {
				cx.suspend(g.task, (x) => {
					cx.suspend(h.task, (y) => {
						got.push(x + y);
						return x + y;
					});
				});
			});
		});
		g.resolve(1);
		await settle();
		t.dispose();
		h.resolve(2);
		await settle();
		expect(got).toEqual([]);
		r.dispose();
	});

	test("an error in a step's senders goes to that step's onReject", async () => {
		let t, g;
		const r = root((r) => {
			const a = done(r, 1);
			g = gate(r);
			t = r.task((cx) => {
				cx.suspend(a, (x) => {
					cx.suspend(
						g.task,
						(y) => x + y,
						(err) => "fallback:" + err.error
					);
				});
			});
		});
		g.reject("boom");
		await settle();
		expect(t.is(ERROR)).toBe(false);
		expect(t.get()).toBe("fallback:boom");
		r.dispose();
	});

	test("an error in a step's senders with no onReject fails the run", async () => {
		let t, g;
		const r = root((r) => {
			const a = done(r, 1);
			g = gate(r);
			t = r.task((cx) => {
				cx.suspend(a, (x) => {
					cx.suspend(g.task, (y) => x + y);
				});
			});
		});
		g.reject("boom");
		await settle();
		expect(t.is(ERROR)).toBe(true);
		expect(t.get().error).toBe("boom");
		r.dispose();
	});

	test("a step that throws after suspending fails the run, and its wait is dropped", async () => {
		let t, g;
		let ran = false;
		const r = root((r) => {
			const a = done(r, 1);
			g = gate(r);
			t = r.task((cx) => {
				cx.suspend(a, () => {
					cx.suspend(g.task, () => {
						ran = true;
						return "late";
					});
					throw new Error("step");
				});
			});
		});
		expect(t.is(ERROR)).toBe(true);
		g.resolve(2);
		await settle();
		expect(ran).toBe(false);
		expect(t.is(ERROR)).toBe(true);
		r.dispose();
	});

	test("two suspends in the same step throw", () => {
		let caught;
		const r = root((r) => {
			const a = done(r, 1);
			const b = done(r, 2);
			r.task((cx) => {
				cx.suspend(a, () => {
					cx.suspend(b, () => {});
					try {
						cx.suspend(b, () => {});
					} catch (err) {
						caught = err;
					}
				});
			});
		});
		expect(caught).toBeInstanceOf(Error);
		r.dispose();
	});

	test("reads in a later step are tracked", async () => {
		const s = signal(10);
		let t, g;
		const r = root((r) => {
			g = gate(r);
			t = r.task((cx) => {
				cx.suspend(g.task, (x) => {
					cx.suspend(g.task, (y) => x + y + cx.val(s));
				});
			});
		});
		g.resolve(1);
		await settle();
		expect(t.get()).toBe(12);
		s.set(20);
		await settle();
		expect(t.get()).toBe(22);
		r.dispose();
	});

	test("the task runs again correctly after a chain with a loading step", async () => {
		const s = signal(1);
		let t, g;
		const r = root((r) => {
			const a = done(r, 100);
			g = gate(r);
			t = r.task((cx) => {
				const k = cx.val(s);
				cx.suspend(a, (x) => {
					cx.suspend(g.task, (y) => x + y + k);
				});
			});
		});
		g.resolve(10);
		await settle();
		expect(t.get()).toBe(111);
		s.set(2);
		await settle();
		expect(t.get()).toBe(112);
		r.dispose();
	});

	test("a spawn runs its steps in order, and ends after the last one", async () => {
		const log = [];
		let g, h, sp;
		const r = root((r) => {
			g = gate(r);
			h = gate(r);
			sp = r.spawn((cx) => {
				cx.finalize(() => log.push("finalize"));
				cx.suspend(g.task, (saved) => {
					log.push("saved " + saved);
					cx.suspend(h.task, (receipt) => {
						log.push("receipt " + receipt);
					});
				});
			});
		});
		g.resolve(1);
		await settle();
		expect(sp.is(LOADING)).toBe(true);
		h.resolve(2);
		await settle();
		expect(sp.is(LOADING)).toBe(false);
		expect(log).toEqual(["saved 1", "receipt 2", "finalize"]);
		r.dispose();
	});
});

describe("steps: a promise a callback returns is adopted", () => {
	test("a returned promise keeps the task loading, and it settles with its value", async () => {
		let t;
		const d = deferred();
		const r = root((r) => {
			const a = done(r, 1);
			t = r.task((cx) => {
				cx.suspend(a, (x) => d.promise.then((y) => x + y));
			});
		});
		expect(t.is(LOADING)).toBe(true);
		d.resolve(2);
		await settle();
		expect(t.get()).toBe(3);
		r.dispose();
	});

	test("a returned promise that rejects fails the task", async () => {
		let t;
		const r = root((r) => {
			const a = done(r, 1);
			t = r.task((cx) => {
				cx.suspend(a, () => Promise.reject("boom"));
			});
		});
		await settle();
		expect(t.is(ERROR)).toBe(true);
		expect(t.get().error).toBe("boom");
		r.dispose();
	});

	test("a returned task or resource is the run's value, as the fn's would be", () => {
		let fromStep, fromFn, fromRes;
		const res = resource(0);
		let a;
		const r = root((r) => {
			a = done(r, 1);
			fromStep = r.task((cx) => {
				cx.suspend(a, () => a);
			});
			fromFn = r.task(() => a);
			fromRes = r.task((cx) => {
				cx.suspend(a, () => res);
			});
		});
		expect(fromStep.is(LOADING)).toBe(false);
		expect(fromStep.get()).toBe(a);
		expect(fromFn.get()).toBe(a);
		expect(fromRes.get()).toBe(res);
		r.dispose();
	});

	test("a callback follows the task it picks by suspending on it", async () => {
		let t, g;
		const r = root((r) => {
			const plan = done(r, false);
			const quick = done(r, "quick");
			g = gate(r);
			t = r.task((cx) => {
				cx.suspend(plan, (fast) => {
					cx.suspend(fast ? quick : g.task, (v) => v);
				});
			});
		});
		expect(t.is(LOADING)).toBe(true);
		g.resolve("slow");
		await settle();
		expect(t.get()).toBe("slow");
		r.dispose();
	});

	test("an async callback is adopted, and its awaits are its own", async () => {
		let t, g;
		const r = root((r) => {
			const a = done(r, 1);
			g = gate(r);
			t = r.task((cx) => {
				cx.suspend(a, async (x) => {
					const y = await cx.suspend(g.task);
					return x + y;
				});
			});
		});
		g.resolve(2);
		await settle();
		expect(t.get()).toBe(3);
		r.dispose();
	});

	test("a promise returned by a stale run is dropped", async () => {
		const s = signal(1);
		const first = deferred();
		let t;
		const r = root((r) => {
			const a = done(r, 0);
			t = r.task((cx) => {
				const k = cx.val(s);
				cx.suspend(a, () => (k === 1 ? first.promise : Promise.resolve("second")));
			});
			r.effect(t, () => {});
		});
		s.set(2);
		await settle();
		first.resolve("first");
		await settle();
		expect(t.get()).toBe("second");
		r.dispose();
	});

	test("a spawn stays loading until the promise its callback returns settles", async () => {
		const d = deferred();
		let sp;
		const r = root((r) => {
			const a = done(r, 1);
			sp = r.spawn((cx) => {
				cx.suspend(a, () => d.promise);
			});
		});
		expect(sp.is(LOADING)).toBe(true);
		d.resolve();
		await settle();
		expect(sp.is(LOADING)).toBe(false);
		r.dispose();
	});

	test("a sync compute keeps a returned promise as its value, as its fn would", async () => {
		let cmp;
		const p = Promise.resolve(1);
		const g = deferred();
		const r = root((r) => {
			const t = r.task((cx) => cx.suspend(g.promise));
			cmp = r.compute((cx) => {
				cx.suspend(t, () => p);
			});
		});
		g.resolve(0);
		await settle();
		expect(cmp.get()).toBe(p);
		r.dispose();
	});
});

describe("promises and plain values in suspend", () => {
	test("the callback form takes a single promise", async () => {
		let t;
		const r = root((r) => {
			t = r.task((cx) => {
				cx.suspend(Promise.resolve(3), (x) => x * 2);
			});
		});
		expect(t.is(LOADING)).toBe(true);
		await settle();
		expect(t.get()).toBe(6);
		r.dispose();
	});

	test("a rejected promise calls onReject with a Defect", async () => {
		let t, seen;
		const r = root((r) => {
			t = r.task((cx) => {
				cx.suspend(Promise.reject("boom"), (x) => x, (err) => {
					seen = err;
					return "fallback";
				});
			});
		});
		await settle();
		expect(seen.type).toBe(PANIC);
		expect(seen.error).toBe("boom");
		expect(t.get()).toBe("fallback");
		r.dispose();
	});

	test("the callback form takes an array of promises", async () => {
		let t;
		const r = root((r) => {
			t = r.task((cx) => {
				cx.suspend([Promise.resolve(1), Promise.resolve(2)], ([a, b]) => a + b);
			});
		});
		await settle();
		expect(t.get()).toBe(3);
		r.dispose();
	});

	test("the callback form takes tasks and promises together", async () => {
		let t, g;
		const r = root((r) => {
			g = gate(r);
			t = r.task((cx) => {
				cx.suspend([g.task, Promise.resolve(2), done(r, 3)], ([a, b, c]) => a + b + c);
			});
		});
		await settle();
		expect(t.is(LOADING)).toBe(true);
		g.resolve(1);
		await settle();
		expect(t.get()).toBe(6);
		r.dispose();
	});

	test("the await form takes an array of promises", async () => {
		let t;
		const r = root((r) => {
			t = r.task(async (cx) => {
				const [a, b] = await cx.suspend([Promise.resolve(1), Promise.resolve(2)]);
				return a + b;
			});
		});
		await settle();
		expect(t.get()).toBe(3);
		r.dispose();
	});

	test("the await form takes a loading task and a promise together", async () => {
		let t, g;
		const r = root((r) => {
			g = gate(r);
			t = r.task(async (cx) => {
				const [a, b] = await cx.suspend([g.task, Promise.resolve(2)]);
				return a + b;
			});
		});
		await settle();
		expect(t.is(LOADING)).toBe(true);
		g.resolve(1);
		await settle();
		expect(t.get()).toBe(3);
		r.dispose();
	});

	test("a rejected promise in an array fails the await", async () => {
		let t;
		const r = root((r) => {
			t = r.task(async (cx) => {
				return await cx.suspend([Promise.resolve(1), Promise.reject("boom")]);
			});
		});
		await settle();
		expect(t.is(ERROR)).toBe(true);
		r.dispose();
	});

	test("plain values pass through, alone or in an array", async () => {
		let t1, t2, t3;
		const r = root((r) => {
			t1 = r.task(async (cx) => await cx.suspend(5));
			t2 = r.task((cx) => {
				cx.suspend([1, null, "x"], (values) => values);
			});
			t3 = r.task((cx) => {
				cx.suspend(7, (x) => x + 1);
			});
		});
		expect(t2.get()).toEqual([1, null, "x"]);
		expect(t3.get()).toBe(8);
		await settle();
		expect(t1.get()).toBe(5);
		r.dispose();
	});

	test("an array with a promise waits at least a microtask, even if it has resolved", async () => {
		let t;
		const r = root((r) => {
			const a = done(r, 1);
			const p = Promise.resolve(2);
			t = r.task((cx) => {
				cx.suspend([a, p], ([x, y]) => x + y);
			});
		});
		expect(t.is(LOADING)).toBe(true);
		await settle();
		expect(t.get()).toBe(3);
		r.dispose();
	});

	test("a promise's answer to a stale run never reaches its callback", async () => {
		const s = signal(1);
		const first = deferred();
		const got = [];
		const r = root((r) => {
			r.spawn((cx) => {
				const k = cx.val(s);
				cx.suspend([k === 1 ? first.promise : Promise.resolve("second")], ([v]) => {
					got.push(v);
				});
			});
		});
		s.set(2);
		await settle();
		first.resolve("first");
		await settle();
		expect(got).toEqual(["second"]);
		r.dispose();
	});

	test("the caller's array is left as it was", async () => {
		const p = Promise.resolve(1);
		const input = [p, 2];
		const r = root((r) => {
			r.task((cx) => {
				cx.suspend(input, (values) => values);
			});
		});
		await settle();
		expect(input[0]).toBe(p);
		expect(input[1]).toBe(2);
		r.dispose();
	});
});

describe("an async write tells readers the resource is loading", () => {
	test("r.set(fn) with a promise makes c.pending(r) true for its readers", async () => {
		const res = resource(1);
		const d = deferred();
		const seen = [];
		const r = root((r) => {
			r.effect((cx) => {
				seen.push(cx.pending(res));
			});
		});
		res.set((cx) => cx.suspend(d.promise));
		expect(seen).toEqual([false, true]);
		d.resolve(5);
		await settle();
		expect(seen).toEqual([false, true, false]);
		r.dispose();
	});

	test("r.set(fn) with a callback suspend makes c.pending(r) true for its readers", async () => {
		const res = resource(1);
		let finish;
		const seen = [];
		const r = root((r) => {
			r.effect((cx) => {
				seen.push(cx.pending(res));
			});
		});
		res.set((cx) => {
			cx.suspend((resolve) => {
				finish = resolve;
			});
		});
		expect(seen).toEqual([false, true]);
		finish(5);
		await settle();
		expect(seen).toEqual([false, true, false]);
		expect(res.get()).toBe(5);
		r.dispose();
	});

	test("a write to a resource that is already loading doesn't tell its readers again", async () => {
		const res = resource(1);
		const d1 = deferred();
		const d2 = deferred();
		let runs = 0;
		const r = root((r) => {
			r.effect((cx) => {
				cx.pending(res);
				runs++;
			});
		});
		res.set((cx) => cx.suspend(d1.promise));
		expect(runs).toBe(2);
		res.set((cx) => cx.suspend(d2.promise));
		expect(runs).toBe(2);
		d2.resolve(3);
		await settle();
		expect(runs).toBe(3);
		r.dispose();
	});

	test("an async write queued in a batch tells readers when the batch ends", async () => {
		const res = resource(1);
		const d = deferred();
		const seen = [];
		const r = root((r) => {
			r.effect((cx) => {
				seen.push(cx.pending(res));
			});
		});
		batch(() => {
			res.set((cx) => cx.suspend(d.promise));
		});
		expect(seen).toEqual([false, true]);
		d.resolve(5);
		await settle();
		expect(seen).toEqual([false, true, false]);
		r.dispose();
	});

	test("a sync result doesn't make the resource loading", () => {
		const res = resource(1);
		let runs = 0;
		const r = root((r) => {
			r.effect((cx) => {
				cx.pending(res);
				runs++;
			});
		});
		res.set(() => 2);
		expect(res.is(LOADING)).toBe(false);
		expect(res.get()).toBe(2);
		expect(runs).toBe(2);
		r.dispose();
	});
});
