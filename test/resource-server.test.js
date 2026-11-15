import { describe, test, expect } from "#test-runner";
import { resource, root, batch, c, LOADING, ERROR, DEFER, STABLE } from "#anod";

const tick = () => Promise.resolve();
const settle = () => tick().then(tick).then(tick);

/** A promise settled from outside, to script the order requests answer in. */
function deferred() {
	let resolve;
	let reject;
	const promise = new Promise((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe("resource loader", () => {
	test("loads at creation: the seed while loading, then what it returns", async () => {
		const d = deferred();
		const r = resource(0, () => d.promise);
		expect(r.get()).toBe(0);
		expect(r.is(LOADING)).toBe(true);
		d.resolve(5);
		await settle();
		expect(r.get()).toBe(5);
		expect(r.is(LOADING)).toBe(false);
	});

	test("a sync loader sets the value at once", () => {
		const r = resource(0, () => 3);
		expect(r.get()).toBe(3);
		expect(r.is(LOADING)).toBe(false);
	});

	test("refresh() runs the loader again, and readers see it load", async () => {
		let server = 1;
		const r = resource(0, async (c) => await c.suspend(Promise.resolve(server)));
		const seen = [];
		c.effect((c) => {
			const v = c.val(r);
			seen.push(c.pending() ? "loading" : v);
		});
		await settle();
		server = 2;
		r.refresh();
		await settle();
		expect(seen).toEqual(["loading", 1, "loading", 2]);
	});

	test("refresh() aborts the load it replaces, and drops its result", async () => {
		const aborted = [];
		const requests = [];
		const r = resource(0, (c) => {
			const n = requests.length + 1;
			const d = deferred();
			requests.push(d);
			c.controller().signal.addEventListener("abort", () => aborted.push(n));
			return c.suspend(d.promise);
		});
		r.refresh();
		requests[0].resolve(1);
		requests[1].resolve(2);
		await settle();
		expect(aborted).toEqual([1]);
		expect(r.get()).toBe(2);
	});

	test("a save aborts the load in flight", async () => {
		const aborted = [];
		const load = deferred();
		const r = resource(["a"], (c) => {
			c.controller().signal.addEventListener("abort", () => aborted.push("load"));
			return c.suspend(load.promise);
		});
		r.set((list) => [...list, "b"], async () => ["a", "b"]);
		load.resolve(["a"]);
		await settle();
		expect(aborted).toEqual(["load"]);
		expect(r.get()).toEqual(["a", "b"]);
	});

	test("refresh() on a resource without a loader is ignored", () => {
		const r = resource(1);
		r.refresh();
		expect(r.get()).toBe(1);
		expect(r.is(LOADING)).toBe(false);
	});

	test("a failed load is an error: reading throws, and a refresh recovers", async () => {
		let fail = true;
		const r = resource(0, async (c) => {
			await c.suspend(tick());
			if (fail) {
				throw new Error("down");
			}
			return 7;
		});
		await settle();
		expect(r.is(ERROR)).toBe(true);
		expect(() => c.effect((c) => c.val(r))).toThrow();
		fail = false;
		r.refresh();
		await settle();
		expect(r.is(ERROR)).toBe(false);
		expect(r.get()).toBe(7);
	});

	test("after a failed load, a loader that returns nothing keeps the server's value", () => {
		let fail = true;
		let prev;
		const r = resource(1, (c, current) => {
			prev = current;
			if (fail) {
				throw new Error("down");
			}
		});
		expect(r.is(ERROR)).toBe(true);
		fail = false;
		r.refresh();
		expect(prev).toBe(1);
		expect(r.is(ERROR)).toBe(false);
		expect(r.get()).toBe(1);
	});

	test("after a failed load, a save that returns nothing confirms the server's value", async () => {
		const r = resource(1, () => { throw new Error("down"); });
		let prev;
		r.set(async (c, current) => {
			prev = current;
		});
		await settle();
		expect(prev).toBe(1);
		expect(r.is(ERROR)).toBe(false);
		expect(r.get()).toBe(1);
	});

	test("refresh() in a batch loads when the batch ends", () => {
		let runs = 0;
		const r = resource(0, () => ++runs);
		batch(() => {
			r.refresh();
			expect(runs).toBe(1);
		});
		expect(runs).toBe(2);
		expect(r.get()).toBe(2);
	});

	test("a resource made in a root loads, and its readers see it loading", async () => {
		const seen = [];
		root((r) => {
			const data = resource(0, async (c) => await c.suspend(Promise.resolve(1)));
			r.effect((c) => {
				const v = c.val(data);
				seen.push(c.pending(data) ? "loading" : v);
			});
		});
		await settle();
		expect(seen[seen.length - 1]).toBe(1);
		expect(seen).toContain("loading");
	});

	test("false in place of a loader is ignored: a resource is never mutable", () => {
		const obj = { n: 1 };
		const r = resource(obj, false);
		expect(r.set(obj)).toBe(false);
	});
});

describe("resource saves", () => {
	test("a superseded save runs to completion", async () => {
		const log = [];
		const r = resource(0);
		const first = deferred();
		r.set(1, async (c) => {
			const v = await c.suspend(first.promise);
			log.push("first done " + c.version());
			return v;
		});
		r.set(2, async () => 2);
		first.resolve(1);
		await settle();
		expect(log).toEqual(["first done 1"]);
		expect(r.get()).toBe(2);
	});

	test("an older save that answers last doesn't overwrite the newer one", async () => {
		const r = resource(0);
		const slow = deferred();
		r.set(1, () => slow.promise);
		r.set(2, async () => 2);
		await settle();
		slow.resolve(1);
		await settle();
		expect(r.get()).toBe(2);
		/** Nor is it the server's value: a newer failure falls back to 2. */
		r.set(3, async () => { throw new Error("x"); });
		await settle();
		expect(r.get()).toBe(2);
	});

	test("overlapping saves: the first succeeds, the second fails, the value ends on the first", async () => {
		let server = 0;
		const r = resource(0);
		const a = deferred();
		const b = deferred();
		r.set((n) => n + 1, async (c) => await c.suspend(a.promise));
		r.set((n) => n + 1, async (c) => await c.suspend(b.promise));
		expect(r.get()).toBe(2);
		a.resolve(++server);
		await settle();
		expect(r.get()).toBe(2);
		b.reject(new Error("Server 500"));
		await settle();
		expect(r.get()).toBe(1);
		expect(r.is(ERROR)).toBe(true);
	});

	test("both saves fail: the value goes back to the server's, not to the first guess", async () => {
		const r = resource(1);
		r.set((n) => n + 1, async () => { await tick(); throw new Error("a"); });
		r.set((n) => n + 1, async () => { await tick(); throw new Error("b"); });
		expect(r.get()).toBe(3);
		await settle();
		expect(r.get()).toBe(1);
	});

	test("the newest fails first, then the older succeeds: the value follows the server", async () => {
		const r = resource(0);
		const older = deferred();
		const newer = deferred();
		r.set(1, () => older.promise);
		r.set(2, () => newer.promise);
		newer.reject(new Error("x"));
		await settle();
		expect(r.get()).toBe(0);
		expect(r.is(ERROR)).toBe(true);
		older.resolve(1);
		await settle();
		expect(r.get()).toBe(1);
		expect(r.is(ERROR)).toBe(false);
	});

	test("an older success while a newer save is in flight waits for it", async () => {
		const r = resource(0);
		const older = deferred();
		const newer = deferred();
		r.set(1, () => older.promise);
		r.set(2, () => newer.promise);
		older.resolve(1);
		await settle();
		expect(r.get()).toBe(2);
		expect(r.is(LOADING)).toBe(true);
		newer.reject(new Error("x"));
		await settle();
		expect(r.get()).toBe(1);
	});

	test("an older save that fails changes nothing, before or after the newer one settles", async () => {
		const r = resource(0);
		const older = deferred();
		const newer = deferred();
		r.set(1, () => older.promise);
		r.set(2, () => newer.promise);
		older.reject(new Error("x"));
		await settle();
		expect(r.get()).toBe(2);
		expect(r.is(LOADING)).toBe(true);
		newer.resolve(2);
		await settle();
		const late = deferred();
		r.set(3, () => late.promise);
		r.set(4, async () => 4);
		await settle();
		late.reject(new Error("y"));
		await settle();
		expect(r.get()).toBe(4);
		expect(r.is(ERROR)).toBe(false);
	});

	test("a save that returns nothing confirms the value it wrote", async () => {
		const r = resource(0);
		r.set(5, async () => {
			await tick();
		});
		await settle();
		expect(r.get()).toBe(5);
		r.set(6, async () => { throw new Error("x"); });
		await settle();
		expect(r.get()).toBe(5);
	});

	test("a plain write is the server's value too", async () => {
		const r = resource(0);
		r.set(5);
		r.set(6, async () => { throw new Error("x"); });
		await settle();
		expect(r.get()).toBe(5);
	});

	test("a loaded value is what a failed save falls back to", async () => {
		const r = resource(0, async (c) => await c.suspend(Promise.resolve(10)));
		await settle();
		r.set(11, async () => { throw new Error("x"); });
		await settle();
		expect(r.get()).toBe(10);
	});

	test("a failed save: is(ERROR) and c.rejected() report it, reads don't throw", async () => {
		const r = resource("a");
		const seen = [];
		c.effect((c) => {
			const err = c.rejected(r);
			seen.push(err ? `${c.val(r)} (${err.error.message})` : c.val(r));
		});
		r.set("b", async () => { throw new Error("denied"); });
		await settle();
		expect(r.get()).toBe("a");
		expect(r.is(ERROR)).toBe(true);
		expect(seen).toEqual(["a", "b", "a (denied)"]);
	});

	test("the next write clears a failed save: a plain one, or another save", async () => {
		const r = resource(0);
		r.set(1, () => { throw new Error("x"); });
		expect(r.is(ERROR)).toBe(true);
		r.set(2);
		expect(r.is(ERROR)).toBe(false);
		r.set(3, () => { throw new Error("x"); });
		expect(r.get()).toBe(2);
		const d = deferred();
		r.set(4, () => d.promise);
		expect(r.is(ERROR)).toBe(false);
		d.resolve(4);
		await settle();
		expect(r.get()).toBe(4);
	});

	test("a node awaiting a save that fails resumes with the value it fell back to", async () => {
		const r = resource(1);
		const d = deferred();
		r.set(2, () => d.promise);
		let got;
		c.spawn(async (c) => {
			got = await c.suspend(r);
		});
		d.reject(new Error("x"));
		await settle();
		expect(got).toBe(1);
	});

	test("the callback form: a late resolve still confirms the server's value", async () => {
		const r = resource(0);
		let done;
		r.set(1, (c) => {
			c.suspend((resolve) => { done = resolve; });
		});
		r.set(2, () => { throw new Error("x"); });
		expect(r.get()).toBe(0);
		done(1);
		await settle();
		expect(r.get()).toBe(1);
	});

	test("the callback form resolved while the fn runs settles once it returns", () => {
		const r = resource(0);
		r.set(1, (c) => {
			c.suspend((resolve) => resolve(9));
			expect(r.is(LOADING)).toBe(false);
		});
		expect(r.get()).toBe(9);
		expect(r.is(LOADING)).toBe(false);
	});

	test("the callback form: a save that throws ignores a later resolve", async () => {
		const r = resource(0);
		let done;
		r.set(1, (c) => {
			c.suspend((resolve) => { done = resolve; });
			throw new Error("x");
		});
		expect(r.get()).toBe(0);
		expect(r.is(ERROR)).toBe(true);
		done(1);
		await settle();
		expect(r.get()).toBe(0);
		expect(r.is(ERROR)).toBe(true);
	});

	test("a contextual save that fails reverts too", async () => {
		const r = resource(0);
		const go = resource(false);
		root((root) => {
			root.effect(go, (g, c) => {
				if (g) {
					c.set(r, 1, async () => { await tick(); throw new Error("x"); });
				}
			});
		});
		go.set(true);
		expect(r.get()).toBe(1);
		await settle();
		expect(r.get()).toBe(0);
		expect(r.is(ERROR)).toBe(true);
	});

	test("a save queued in a batch that fails reverts too", async () => {
		const r = resource(0);
		batch(() => {
			r.set(1, async () => { await tick(); throw new Error("x"); });
		});
		expect(r.get()).toBe(1);
		await settle();
		expect(r.get()).toBe(0);
	});
});

describe("resource DEFER", () => {
	test("the seed is the server's value until the first refresh()", async () => {
		let loads = 0;
		const r = resource(1, async (c) => {
			loads++;
			return await c.suspend(Promise.resolve(2));
		}, DEFER);
		expect(loads).toBe(0);
		expect(r.is(LOADING)).toBe(false);
		expect(r.is(DEFER)).toBe(true);
		r.set(5, async () => { throw new Error("x"); });
		await settle();
		expect(r.get()).toBe(1);
		r.refresh();
		expect(loads).toBe(1);
		await settle();
		expect(r.get()).toBe(2);
	});

	test("other options are ignored on a resource", () => {
		const r = resource(0, () => 1, STABLE);
		expect(r.get()).toBe(1);
		expect(r.is(STABLE)).toBe(false);
	});
});
