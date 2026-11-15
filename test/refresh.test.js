import { describe, test, expect } from "#test-runner";
import { signal, root, c, batch } from "#anod";

const tick = () => Promise.resolve();
const settle = () => tick().then(tick).then(tick);

describe("refresh()", () => {
	describe("compute", () => {
		test("derives again from a source outside the graph", () => {
			const store = { theme: "light" };
			const theme = c.compute(() => store.theme);
			const seen = [];
			c.effect(theme, (t) => { seen.push(t); });
			store.theme = "dark";
			theme.refresh();
			expect(seen).toEqual(["light", "dark"]);
		});

		test("readers don't run when the value is the same", () => {
			const store = { theme: "light" };
			let runs = 0;
			const theme = c.compute(() => {
				runs++;
				return store.theme;
			});
			let effects = 0;
			c.effect(theme, () => { effects++; });
			theme.refresh();
			expect(runs).toBe(2);
			expect(effects).toBe(1);
		});

		test("re-runs only the node, unlike notify() on a dependency", () => {
			const s = signal(1);
			let runsA = 0;
			let runsB = 0;
			const a = c.compute((c) => { runsA++; return c.val(s); });
			const b = c.compute((c) => { runsB++; return c.val(s); });
			a.refresh();
			a.get();
			b.get();
			expect(runsA).toBe(2);
			expect(runsB).toBe(1);
		});

		test("a compute with no readers goes stale, and runs on its next read", () => {
			let runs = 0;
			const n = c.compute(() => ++runs);
			n.refresh();
			expect(runs).toBe(1);
			expect(n.get()).toBe(2);
		});

		test("c.refresh() during its own run runs it once more, after the run", () => {
			let runs = 0;
			const seen = [];
			const n = c.compute((c) => {
				runs++;
				if (runs === 1) {
					c.refresh();
				}
				return runs;
			});
			c.effect(n, (v) => { seen.push(v); });
			expect(runs).toBe(2);
			expect(seen).toEqual([2]);
		});

		test("a listener that refreshes keeps a compute in sync with an outside source", () => {
			const listeners = new Set();
			const store = {
				value: 1,
				set(v) {
					this.value = v;
					[...listeners].forEach((fn) => fn());
				}
			};
			const seen = [];
			const r = root((r) => {
				const value = r.compute((c) => {
					const onChange = () => c.refresh();
					listeners.add(onChange);
					c.cleanup(() => listeners.delete(onChange));
					return store.value;
				});
				r.effect(value, (v) => { seen.push(v); });
			});
			store.set(2);
			store.set(3);
			expect(seen).toEqual([1, 2, 3]);
			r.dispose();
			expect(listeners.size).toBe(0);
		});

		test("refreshes in a batch run once, when it ends", () => {
			let runs = 0;
			const n = c.compute(() => ++runs);
			c.effect(n, () => {});
			batch(() => {
				n.refresh();
				n.refresh();
				expect(runs).toBe(1);
			});
			expect(runs).toBe(2);
		});

		test("throws on a disposed compute, as notify() does", () => {
			const n = c.compute(() => 1);
			n.dispose();
			expect(() => n.refresh()).toThrow();
		});
	});

	describe("task", () => {
		test("loads again: the run in flight is aborted, and readers see it load", async () => {
			let calls = 0;
			const aborted = [];
			const t = c.task(async (c) => {
				const n = ++calls;
				c.controller().signal.addEventListener("abort", () => aborted.push(n));
				await c.suspend(Promise.resolve());
				return n;
			});
			const seen = [];
			c.effect((c) => {
				const v = c.val(t);
				seen.push(c.pending() ? "loading" : v);
			});
			await settle();
			t.refresh();
			t.refresh();
			await settle();
			expect(seen).toEqual(["loading", 1, "loading", 3]);
			expect(aborted).toEqual([1, 2]);
		});
	});

	describe("effect", () => {
		test("runs again, after its cleanups", () => {
			const log = [];
			let n = 0;
			const e = c.effect((c) => {
				const run = ++n;
				log.push("run " + run);
				c.cleanup(() => log.push("cleanup " + run));
			});
			e.refresh();
			expect(log).toEqual(["run 1", "cleanup 1", "run 2"]);
		});

		test("c.refresh() during its own run runs it once more, after the run", () => {
			let runs = 0;
			c.effect((c) => {
				runs++;
				if (runs === 1) {
					c.refresh();
				}
			});
			expect(runs).toBe(2);
		});

		test("refreshes in a batch run it once, when it ends", () => {
			let runs = 0;
			const e = c.effect(() => { runs++; });
			batch(() => {
				e.refresh();
				e.refresh();
			});
			expect(runs).toBe(2);
		});

		test("a paused effect runs on resume", () => {
			let runs = 0;
			let child;
			const r = root((r) => {
				child = r.effect(() => { runs++; });
			});
			r.pause();
			child.refresh();
			expect(runs).toBe(1);
			r.resume();
			expect(runs).toBe(2);
			r.dispose();
		});

		test("refreshed from another node's run, it runs in the same flush", () => {
			const go = signal(0);
			let target;
			const seen = [];
			root((r) => {
				target = r.effect(() => { seen.push("target"); });
				r.effect(go, (n) => {
					if (n > 0) {
						target.refresh();
					}
				});
			});
			go.set(1);
			expect(seen).toEqual(["target", "target"]);
		});
	});

	describe("action", () => {
		test("runs again, with nothing it reads changed", () => {
			const store = { title: "a" };
			const seen = [];
			const a = c.action(() => { seen.push(store.title); });
			store.title = "b";
			a.refresh();
			expect(seen).toEqual(["a", "b"]);
		});

		test("c.refresh() during its own run runs it once more, after the run", () => {
			let runs = 0;
			c.action((c) => {
				runs++;
				if (runs === 1) {
					c.refresh();
				}
			});
			expect(runs).toBe(2);
		});

		test("a bound action runs again with the same value", () => {
			const s = signal(1);
			const seen = [];
			const a = c.action(s, (v) => { seen.push(v); });
			a.refresh();
			expect(seen).toEqual([1, 1]);
		});

		test("a paused action runs on resume", () => {
			let runs = 0;
			let child;
			const r = root((r) => {
				child = r.action(() => { runs++; });
			});
			r.pause();
			child.refresh();
			expect(runs).toBe(1);
			r.resume();
			expect(runs).toBe(2);
			r.dispose();
		});

		test("throws on a disposed action", () => {
			const a = c.action(() => {});
			a.dispose();
			expect(() => a.refresh()).toThrow();
		});
	});

	describe("spawn", () => {
		test("runs again: the run in flight is aborted and dropped", async () => {
			const log = [];
			let n = 0;
			let resolve;
			const s = c.spawn(async (c) => {
				const run = ++n;
				c.controller().signal.addEventListener("abort", () => log.push("abort " + run));
				await c.suspend(new Promise((r) => { resolve = r; }));
				log.push("done " + run);
			});
			const first = resolve;
			s.refresh();
			first();
			resolve();
			await settle();
			expect(log).toEqual(["abort 1", "done 2"]);
		});

		test("a shielded spawn runs again once its run ends", async () => {
			const log = [];
			let n = 0;
			let resolve;
			const s = c.spawn(async (c) => {
				const run = ++n;
				c.shield();
				await c.suspend(new Promise((r) => { resolve = r; }));
				log.push("done " + run);
			});
			s.refresh();
			expect(n).toBe(1);
			resolve();
			await settle();
			expect(n).toBe(2);
			resolve();
			await settle();
			expect(log).toEqual(["done 1", "done 2"]);
		});
	});
});
