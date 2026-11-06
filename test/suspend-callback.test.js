import { describe, test, expect } from "#test-runner";
import { signal, root, c, REFUSE, PANIC, FATAL, refuse } from "#anod";

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

describe("c.suspend(task, onResolve, onReject)", () => {
	test("a settled task calls onResolve synchronously, before suspend returns", () => {
		const got = [];
		const r = root((r) => {
			const task = r.task((cx) => cx.suspend((resolve) => resolve(3)));
			r.spawn((cx) => {
				cx.suspend(task, (v) => {
					got.push("cb:" + v);
				});
				got.push("after");
			});
		});
		expect(got).toEqual(["cb:3", "after"]);
		r.dispose();
	});

	test("a loading task calls onResolve once it settles, without a microtask", async () => {
		const got = [];
		let g;
		const r = root((r) => {
			g = gate(r);
			r.spawn((cx) => {
				cx.suspend(g.task, (v) => {
					got.push(v);
				});
			});
		});
		await settle();
		expect(got).toEqual([]);
		g.resolve(9);
		await settle();
		expect(got).toEqual([9]);
		r.dispose();
	});

	test("the callback runs in the same tick as the task settles", () => {
		const got = [];
		let resolveTask;
		const r = root((r) => {
			const task = r.task((cx) => cx.suspend((resolve) => {
				resolveTask = resolve;
			}));
			r.spawn((cx) => {
				cx.suspend(task, (v) => {
					got.push(v);
				});
			});
		});
		resolveTask(4);
		expect(got).toEqual([4]);
		r.dispose();
	});

	test("a task settles with what onResolve returns, and is loading until then", async () => {
		let g, doubled;
		const r = root((r) => {
			g = gate(r);
			doubled = r.task((cx) => {
				cx.suspend(g.task, (v) => v * 2);
			});
		});
		expect(doubled.loading).toBe(true);
		g.resolve(21);
		await settle();
		expect(doubled.loading).toBe(false);
		expect(doubled.get()).toBe(42);
		r.dispose();
	});

	test("a task over a settled task settles with onResolve's result in the same run", () => {
		let doubled;
		const r = root((r) => {
			const task = r.task((cx) => cx.suspend((resolve) => resolve(5)));
			doubled = r.task((cx) => {
				cx.suspend(task, (v) => v * 2);
			});
		});
		expect(doubled.loading).toBe(false);
		expect(doubled.get()).toBe(10);
		r.dispose();
	});

	test("an error calls onReject with the error, and the task settles with its result", async () => {
		let g, safe, seen;
		const r = root((r) => {
			g = gate(r);
			safe = r.task((cx) => {
				cx.suspend(
					g.task,
					(v) => v,
					(err) => {
						seen = err;
						return "fallback";
					}
				);
			});
		});
		g.reject("boom");
		await settle();
		expect(seen.type).toBe(FATAL);
		expect(seen.error).toBe("boom");
		expect(safe.error).toBe(false);
		expect(safe.get()).toBe("fallback");
		r.dispose();
	});

	test("an error with no onReject fails the node with the same error", async () => {
		let src, dst;
		const r = root((r) => {
			let d = deferred();
			src = r.task(async (cx) => {
				await cx.suspend(d.promise);
				throw refuse("bad");
			});
			dst = r.task((cx) => {
				cx.suspend(src, (v) => v);
			});
			d.resolve();
		});
		await settle();
		expect(dst.error).toBe(true);
		expect(dst.get()).toBe(src.get());
		expect(dst.get().type).toBe(REFUSE);
		r.dispose();
	});

	test("an error with no onReject reaches the spawn's recover", async () => {
		let g;
		const errors = [];
		const r = root((r) => {
			g = gate(r);
			r.spawn((cx) => {
				cx.recover((err) => {
					errors.push(err.error);
					return true;
				});
				cx.suspend(g.task, () => {});
			});
		});
		g.reject("nope");
		await settle();
		expect(errors).toEqual(["nope"]);
		r.dispose();
	});

	test("a throwing onResolve fails the node as FATAL", async () => {
		let g, dst;
		const r = root((r) => {
			g = gate(r);
			dst = r.task((cx) => {
				cx.suspend(g.task, () => {
					throw new TypeError("oops");
				});
			});
		});
		g.resolve(1);
		await settle();
		expect(dst.error).toBe(true);
		expect(dst.get().type).toBe(FATAL);
		expect(dst.get().error).toBeInstanceOf(TypeError);
		r.dispose();
	});

	test("the node subscribes to the task and re-runs when it settles again", async () => {
		const s = signal(1);
		const got = [];
		const r = root((r) => {
			const task = r.task(async (cx) => {
				const v = cx.val(s);
				await cx.suspend(tick());
				return v;
			});
			r.spawn((cx) => {
				cx.suspend(task, (v) => {
					got.push(v);
				});
			});
		});
		await settle();
		expect(got).toEqual([1]);
		s.set(2);
		await settle();
		expect(got).toEqual([1, 2]);
		r.dispose();
	});

	test("a re-run before the task settles drops the old callback", async () => {
		const s = signal("a");
		const got = [];
		let g;
		const r = root((r) => {
			g = gate(r);
			r.spawn((cx) => {
				const tag = cx.val(s);
				cx.suspend(g.task, (v) => {
					got.push(tag + v);
				});
			});
		});
		s.set("b");
		g.resolve(1);
		await settle();
		expect(got).toEqual(["b1"]);
		r.dispose();
	});

	test("disposing the waiting node before the task settles drops the callback", async () => {
		const got = [];
		let g, spawn;
		const r = root((r) => {
			g = gate(r);
			spawn = r.spawn((cx) => {
				cx.suspend(g.task, (v) => {
					got.push(v);
				});
			});
		});
		spawn.dispose();
		g.resolve(1);
		await settle();
		expect(got).toEqual([]);
		r.dispose();
	});

	test("disposing the awaited task fails a waiter with no onReject", async () => {
		const errors = [];
		let inner, task;
		const r = root((r) => {
			inner = root((r2) => {
				task = r2.task((cx) => cx.suspend(new Promise(() => {})));
			});
			r.spawn((cx) => {
				cx.recover((err) => {
					errors.push(err.error.message);
					return true;
				});
				cx.suspend(task, () => {});
			});
		});
		inner.dispose();
		await settle();
		expect(errors).toEqual(["Awaited task was disposed"]);
		r.dispose();
	});

	test("disposing the awaited task calls onReject with a PANIC Defect", async () => {
		const errors = [];
		let inner, task;
		const r = root((r) => {
			inner = root((r2) => {
				task = r2.task((cx) => cx.suspend(new Promise(() => {})));
			});
			r.spawn((cx) => {
				cx.suspend(task, () => {}, (err) => {
					errors.push([err.type, err.error.message]);
				});
			});
		});
		inner.dispose();
		await settle();
		expect(errors).toEqual([[PANIC, "Awaited task was disposed"]]);
		r.dispose();
	});

	test("reads in a deferred callback are tracked", async () => {
		const s = signal(1);
		const got = [];
		let g;
		const r = root((r) => {
			g = gate(r);
			r.spawn((cx) => {
				cx.suspend(g.task, (v) => {
					got.push(v + cx.val(s));
				});
			});
		});
		g.resolve(10);
		await settle();
		expect(got).toEqual([11]);
		s.set(2);
		await settle();
		expect(got).toEqual([11, 12]);
		r.dispose();
	});

	test("a callback sees the task's dependents as updated", async () => {
		const s = signal(1);
		const got = [];
		const r = root((r) => {
			const task = r.task(async (cx) => {
				const v = cx.val(s);
				await cx.suspend(tick());
				return v;
			});
			const tenfold = r.compute(task, (v) => v * 10);
			r.spawn((cx) => {
				cx.suspend(task, (v) => {
					got.push([v, cx.val(tenfold)]);
				});
			});
		});
		await settle();
		s.set(2);
		await settle();
		expect(got).toEqual([[1, 10], [2, 20]]);
		r.dispose();
	});

	test("a second suspend while one is pending throws", async () => {
		let g, h, caught;
		const r = root((r) => {
			g = gate(r);
			h = gate(r);
			r.spawn((cx) => {
				cx.suspend(g.task, () => {});
				try {
					cx.suspend(h.task, () => {});
				} catch (err) {
					caught = err;
				}
			});
		});
		expect(caught).toBeInstanceOf(Error);
		g.resolve(1);
		h.resolve(1);
		await settle();
		r.dispose();
	});

	test("an async spawn cannot use the callback form after an await", async () => {
		let g, caught;
		const r = root((r) => {
			g = gate(r);
			r.spawn(async (cx) => {
				await cx.suspend(tick());
				try {
					cx.suspend(g.task, () => {});
				} catch (err) {
					caught = err;
				}
			});
		});
		await settle();
		expect(caught).toBeInstanceOf(Error);
		g.resolve(1);
		await settle();
		r.dispose();
	});
});

describe("c.suspend(tasks, onResolve, onReject)", () => {
	test("settled tasks call onResolve synchronously with every value", () => {
		const got = [];
		const r = root((r) => {
			const a = r.task((cx) => cx.suspend((resolve) => resolve(1)));
			const b = r.task((cx) => cx.suspend((resolve) => resolve(2)));
			r.spawn((cx) => {
				cx.suspend([a, b], (values) => {
					got.push(values);
				});
				got.push("after");
			});
		});
		expect(got).toEqual([[1, 2], "after"]);
		r.dispose();
	});

	test("loading tasks call onResolve once all have settled", async () => {
		const got = [];
		let a, b;
		const r = root((r) => {
			a = gate(r);
			b = gate(r);
			r.spawn((cx) => {
				cx.suspend([a.task, b.task], (values) => {
					got.push(values);
				});
			});
		});
		b.resolve("b");
		await settle();
		expect(got).toEqual([]);
		a.resolve("a");
		await settle();
		expect(got).toEqual([["a", "b"]]);
		r.dispose();
	});

	test("a task settles with what onResolve returns for the snapshot", async () => {
		let a, b, sum;
		const r = root((r) => {
			a = gate(r);
			b = gate(r);
			sum = r.task((cx) => {
				cx.suspend([a.task, b.task], ([x, y]) => x + y);
			});
		});
		a.resolve(2);
		b.resolve(3);
		await settle();
		expect(sum.get()).toBe(5);
		r.dispose();
	});

	test("a failing member calls onReject", async () => {
		let a, b;
		const errors = [];
		const r = root((r) => {
			a = gate(r);
			b = gate(r);
			r.spawn((cx) => {
				cx.suspend(
					[a.task, b.task],
					() => {},
					(err) => {
						errors.push(err.error);
					}
				);
			});
		});
		a.reject("first");
		await settle();
		expect(errors).toEqual(["first"]);
		r.dispose();
	});

	test("a settled failing member calls onReject synchronously", () => {
		const errors = [];
		const r = root((r) => {
			const a = r.task((cx) => cx.suspend((resolve, reject) => reject("bad")));
			r.spawn((cx) => {
				cx.suspend([a], () => {}, (err) => {
					errors.push(err.error);
				});
			});
		});
		expect(errors).toEqual(["bad"]);
		r.dispose();
	});
});

describe("settle order", () => {
	/**
	 * A task's waiters resume after its subscribers are marked stale, so
	 * an array await whose members depend on each other gets a snapshot
	 * from one moment.
	 */
	test("an array await over dependent tasks sees one consistent snapshot", async () => {
		const s = signal(1);
		const seen = [];
		const r = root((r) => {
			const t = r.task(async (cx) => {
				const v = cx.val(s);
				await cx.suspend(new Promise((res) => setTimeout(res, 1)));
				return v;
			});
			const d = r.task(async (cx) => cx.val(t) * 10);
			r.spawn(async (cx) => {
				const [a, b] = await cx.suspend([t, d]);
				seen.push([a, b]);
			});
		});
		await new Promise((res) => setTimeout(res, 20));
		expect(seen).toEqual([[1, 10]]);
		s.set(2);
		await new Promise((res) => setTimeout(res, 20));
		expect(seen).toEqual([[1, 10], [2, 20]]);
		r.dispose();
	});

	test("the callback form over dependent tasks sees one consistent snapshot", async () => {
		const s = signal(1);
		const seen = [];
		const r = root((r) => {
			const t = r.task(async (cx) => {
				const v = cx.val(s);
				await cx.suspend(new Promise((res) => setTimeout(res, 1)));
				return v;
			});
			const d = r.task(async (cx) => cx.val(t) * 10);
			r.spawn((cx) => {
				cx.suspend([t, d], (values) => {
					seen.push(values);
				});
			});
		});
		await new Promise((res) => setTimeout(res, 20));
		expect(seen).toEqual([[1, 10]]);
		s.set(2);
		await new Promise((res) => setTimeout(res, 20));
		expect(seen).toEqual([[1, 10], [2, 20]]);
		r.dispose();
	});
});
