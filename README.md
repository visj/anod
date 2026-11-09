<!-- omit in toc -->
# anod

anod is a fast signal library where async is part of the reactive graph, not bolted onto it.

```sh
npm install anod
```

* **Async without races.** Tasks, resources and spawns are the async versions of computes, signals and effects. When a dependency changes while one is in flight, the old run is dropped: its late response never lands, and its `AbortController` is aborted.
* **Tracking that survives `await`.** Every callback gets a context `c`, and `c.val()` reads and subscribes. Since tracking goes through `c` rather than a global listener, a read after an `await` is tracked like any other.
* **Fast and lean.** A hybrid push/pull graph that reconciles dependencies without allocating. In a benchmark shaped like a real list view, anod is 12–65% faster than alien-signals and 69–93% faster than Solid 2.0's signals (see [Benchmarks](#benchmarks)).
* **Errors and lifecycles you can reason about.** Every error is a typed `Defect`. `c.recover()` and `c.finalize()` work like `catch` and `finally` for a reactive run, `c.cleanup()` runs before the next one, and `c.shield()` lets an async side effect run to completion.

<!-- omit in toc -->
## Quick example

A search box. Each keystroke starts a request, and only the latest one is ever shown:

```ts
import { root, signal } from "anod";

const query = signal("an");

root((c) => {
	/**
	 * A task is an async compute. When query changes, it runs again:
	 * anod aborts the previous request through c.controller(), and
	 * c.suspend() drops its response if it arrives anyway.
	 */
	const results = c.task(query, async (q, c) => {
		const res = await c.suspend(
			fetch(`/api/search?q=${q}`, { signal: c.controller().signal })
		);
		return await c.suspend(res.json());
	});

	const count = c.compute(results, (list) => list.length);

	c.effect((c) => {
		if (c.pending(results)) {
			console.log("Searching...");
		} else {
			console.log(`${c.val(count)} results:`, c.val(results));
		}
	});
});

query.set("ant");
query.set("anod");
// Searching...
// 1 results: ["anod"]
```

There is no request id to compare and no `isMounted` flag to check. The requests for `"an"` and `"ant"` are aborted, and even a response that arrived after the abort would be dropped.

The same guard covers writes. A resource is a signal that can be written optimistically and confirmed later:

```ts
import { root, resource, LOADING } from "anod";

const save = (todos) => new Promise((r) => setTimeout(() => r(todos), 100));

root((c) => {
	const todos = resource([]);

	function add(text) {
		/**
		 * Shows the todo at once, then settles with what the server
		 * confirms. If add() runs again before this save returns,
		 * this save is dropped: only the latest write settles.
		 */
		todos.set([...todos.get(), { text, saved: false }], async (c, optimistic) => {
			const saved = await c.suspend(save(optimistic));
			return saved.map((t) => ({ ...t, saved: true }));
		});
	}

	c.effect(todos, (list) => {
		const items = list.map((t) => (t.saved ? "✓ " : "… ") + t.text);
		console.log(items.join(", ") || "(empty)", todos.is(LOADING) ? "(saving)" : "");
	});

	add("Write docs");
	setTimeout(() => add("Ship it"), 50);
});
// (empty)
// … Write docs (saving)
// … Write docs, … Ship it (saving)
// ✓ Write docs, ✓ Ship it
```

<!-- omit in toc -->
## Table of contents

- [Basic usage](#basic-usage)
	- [Sync reactivity](#sync-reactivity)
		- [Root](#root)
		- [Global `c` context](#global-c-context)
		- [Signal](#signal)
		- [Compute](#compute)
		- [Effect](#effect)
		- [Action](#action)
		- [Batching](#batching)
	- [Async reactivity](#async-reactivity)
		- [Resource](#resource)
		- [Task](#task)
		- [Spawn](#spawn)
		- [`c.suspend()`](#csuspend)
	- [Error handling](#error-handling)
		- [c.recover(), REFUSE, PANIC, FATAL](#crecover-refuse-panic-fatal)
		- [c.finalize()](#cfinalize)
- [Bundling](#bundling)
- [The reactive graph in depth](#the-reactive-graph-in-depth)
	- [Eager creation, lazy pull](#eager-creation-lazy-pull)
	- [Dependency tracking](#dependency-tracking)
	- [Contextual helpers](#contextual-helpers)
		- [`c.equal()`](#cequal)
		- [`c.cleanup()`](#ccleanup)
	- [Contextual writes: `c.set()` / `c.post()`](#contextual-writes-cset--cpost)
	- [Async state checks: `c.pending()` / `c.rejected()`](#async-state-checks-cpending--crejected)
	- [Evaluation helpers](#evaluation-helpers)
		- [`STABLE`](#stable)
		- [`WEAK`](#weak)
		- [`EAGER`](#eager)
		- [`is()`](#is)
		- [`pause()` / `resume()`](#pause--resume)
	- [Error recovery in depth](#error-recovery-in-depth)
		- [Recovery](#recovery)
- [Async reactivity in depth](#async-reactivity-in-depth)
	- [The four delivery paths](#the-four-delivery-paths)
		- [1. Sync check with `c.pending()`](#1-sync-check-with-cpending)
		- [2. Await with `c.suspend()`](#2-await-with-csuspend)
		- [3. Callback (resolve, reject)](#3-callback-resolve-reject)
		- [4. Task callbacks with `c.suspend(task, onResolve, onReject)`](#4-task-callbacks-with-csuspendtask-onresolve-onreject)
	- [Deferred dependencies with `c.defer()`](#deferred-dependencies-with-cdefer)
	- [Abort controller with `c.controller()`](#abort-controller-with-ccontroller)
	- [Running to completion with `c.shield()`](#running-to-completion-with-cshield)
	- [Stale activation safety](#stale-activation-safety)
	- [Manual versioning with `c.version()`](#manual-versioning-with-cversion)
- [Limitations](#limitations)
- [Benchmarks](#benchmarks)
	- [anod vs alien-signals by Stackblitz (Vue-js internal engine)](#anod-vs-alien-signals-by-stackblitz-vue-js-internal-engine)
	- [anod vs @solidjs/signals (Solid 2.0 beta)](#anod-vs-solidjssignals-solid-20-beta)
- [Acknowledgements](#acknowledgements)
- [Contributing](#contributing)
- [License](#license)

## Basic usage

anod has these primitives:

| Sync | Async | Role |
| --- | --- | --- |
| Signal | Resource | A writable value. A resource can also be written by an async function, optimistically or not. |
| Compute | Task | A derived value. It runs when created, then only when read after a dependency changed. |
| Effect | Spawn | A side effect. It runs again whenever what it reads changes, and owns the nodes it creates. |
| Action | | A slim effect with no cleanups or children, for small writes like setting a DOM property. |

A **root** owns the nodes created inside it and disposes them together. Every callback gets a **context** `c`, through which it reads (`c.val()`), writes (`c.set()`) and creates owned nodes (`c.compute()`, `c.effect()`, ...).

### Sync reactivity

#### Root

The foundation is the root. It creates a top level reactive ownership space.

```ts
import { root, type RootContext } from "anod";

const app = root((c: RootContext) => {
	// Add other reactive primitives here
});
// Later when you're done with the root
app.dispose();
```

#### Global `c` context

For simple use cases where you don't need ownership or disposal, anod exports a global `c` that creates unowned nodes: `import { c } from "anod"` . Nodes created through `c` live until GC collects them.

#### Signal

A signal stores a value and notifies subscribers when changed. You can read it to get its current value, and write to it to update anyone who depends on it.

Signals accept an optional equality function to customize when subscribers are notified: `signal(value, (prev, next) => boolean)` . When provided, the function is called on every write — return `true` to skip notification. Pass `false` instead, `signal(value, false)` , for objects that you want to change in place and notify about changes. Such a signal notifies always, without checking equality.

```ts
import { root, signal } from "anod";

root((c) => {
	const name = signal("Vilhelm");
	const shape = signal({ job: "dev", hobby: "fidology" }, false);
	/**
	 * The .get() method only returns the current value.
	 * Unlike other libraries, this method by itself does
	 * not have any reactive capabilities. Instead, reactivity
	 * is controlled through the context
	 */
	console.log(name.get());
	c.effect((c) => {
		/**
		 * To read and subscribe to a signal,
		 * we use the `c.val()` function provided
		 * by the current reactive context.
		 */
		console.log(c.val(name), c.val(shape));
	});
	/**
	 * Prints 'Leif' to console.
	 * The .set() method is immediate, it
	 * flushes the internal queue synchronously.
	 */
	name.set("Leif");

	/**
	 * A signal without equality is convenient when you work with mutable
	 * data structures. It takes a callback where you can mutate
	 * the value in place. Returning void keeps the current value
	 * and still notifies all subscribers.
	 */
	shape.set((s) => {
		s.job = "self-employed";
	});
});
```

#### Compute

A compute is a derived signal. It can subscribe to signals or other computes, and updates whenever any of them change.

```ts
import { root, signal, DEFER } from "anod";
root((c) => {
	const temp = signal(10);
	/**
	 * Computes are eager when created and run immediately.
	 * After they have produced an initial value, they update only if they are read.
	 * Below, it immediately prints to console.
	 */
	const feelsCold = c.compute((c) => {
		console.log("Evaluating weather");
		return c.val(temp) < 0;
	});

	// Create a compute node, but defer its initial run with DEFER.
	const shiver = c.compute(
		(c) => (c.val(feelsCold) ? "Brr" : ""),
		"",
		DEFER
	);

	temp.set(15); // feelsCold has no subscribers, nothing prints to the console

	c.effect((c) => {
		/**
		 * Here, feelsCold is out of date. When we try to get its value,
		 * it re-runs to get the latest value.
		 * The console prints 'Evaluating weather' before
		 * assessing whether it's cold today.
		 */
		console.log(c.val(feelsCold) ? "Feels cold" : "Not too bad", c.val(shiver));
	});
	temp.set(5); // Evaluating, but it's still warm, effect is not notified
	temp.set(-10); // Now we went from warm to cold, effect prints 'Feels cold'
});
```

All reactive receivers also accept a single dependency signature, `compute(dep: Sender<T>, (val: T, c: Context) => T)` . For single dependency, this is the preferred way of creating receivers, as it both greatly improves performance and simplifies callback logic.

```ts
import { root, signal } from "anod";
root((c) => {
	const name = signal("Vilhelm");
	const isSelf = c.compute(name, (val) => val === "Vilhelm");
	c.effect(isSelf, (self) => console.log(`Is it me? ${self}`));
});
```

#### Effect

An effect is a receiver that listens to senders and performs actions.

```ts
import { root, signal } from "anod";
root((c) => {
	const counter = signal(0);
	c.effect(counter, (val) => {
		console.log(`Val is ${val}`);
	});
	/**
	 * Signals flush synchronously.
	 * This will print 10 times to console,
	 * once for each counter.
	 */
	for (let i = 0; i < 10; i++) {
		counter.set(counter.get() + 1);
	}
});
```

Effects can be nested, each effect managing ownership of any effect node created below it.

```ts
import { root, signal } from "anod";
root((c) => {
	const allow = signal(false);
	const message = signal("hello");
	c.effect(allow, (allowed, c) => {
		if (allowed) {
			c.cleanup(() => {
				console.log("disposing logger");
			});
			c.effect(message, (mess) => {
				console.log(mess);
			});
		}
	});
	allow.set(true); // inner effect created, prints "hello"
	message.set("world"); // inner effect re-runs, prints "world"
	allow.set(false); // prints "disposing logger", inner effect disposed
	message.set("ignored"); // nothing happens, no inner effect exists
});
```

#### Action

An action is a slim effect for the common case of a function that runs when its dependencies change and does nothing else, like writing a value to the DOM. It takes the same arguments and options as `c.effect()`, and its context keeps `c.val()`, `c.pending()`, `c.rejected()`, `c.set()`, `c.post()` and `c.is()`.

```ts
import { root, signal } from "anod";
root((c) => {
	const name = signal("anod");
	const el = document.createElement("span");
	c.action(name, (val) => {
		el.textContent = val;
	});
	c.action((c) => {
		el.title = `Hello ${c.val(name)}`;
	});
});
```

An action owns nothing, and has no `c.cleanup()`, `c.recover()`, `c.finalize()`, async variant or child nodes. That makes it about half the size of an effect: 8 fields instead of 14. It still tracks dynamic dependencies, as an effect does, and takes `STABLE`, `SETUP` and `DEFER`. The root or effect that creates it disposes it, pauses it with `pause()`, and recovers its errors: an error in an action, or in a compute it reads, goes to its owner's `c.recover()` handlers, and the action is disposed, as an effect would be.

Use an effect for anything that needs cleanups, children of its own or async work.

#### Batching

`batch()` groups multiple signal writes into a single notification pass. Without batch, each `.set()` immediately flushes the reactive graph. Inside a batch, writes are coalesced and the graph flushes once at the end.

```ts
import { root, signal, batch } from "anod";
root((c) => {
	const first = signal("Ada");
	const last = signal("Lovelace");
	c.effect((c) => {
		console.log(`${c.val(first)} ${c.val(last)}`);
	});
	/**
	 * Without batch: two separate flushes, effect runs twice.
	 * With batch: one flush, effect runs once with both values updated.
	 */
	batch(() => {
		first.set("Grace");
		last.set("Hopper");
	});
});
```

Signals also expose `.post()` which defers the write to a microtask. Nothing is written immediately, instead, the value is scheduled and applied when the microtask flush runs. Multiple `.post()` calls are run in sequence, and applied one by one during the microtask flush.

```ts
import { signal } from "anod";
const counter = signal(0);
counter.post(1); // scheduled, not written yet
counter.post(2); // same tick, both scheduled, one flush
counter.post((prev) => prev + 1); // updater resolved at flush time
console.log(counter.get()); // still 0 — flush hasn't run
// after microtask: counter is 3
```

Both `.set()` and `.post()` accept an updater function `(prev) => next` . For `.set()` , the updater is called immediately when idle, or deferred to drain time when inside a flush cycle. For `.post()` , the updater is always deferred to flush time, so it sees the latest value at that point.

When you mix the two, a later `.set()` takes precedence over earlier posts to the same signal. It cancels them, so their updaters never run, then writes and flushes. Posts to other signals stay queued and flush along with it. A `.post()` after the `.set()` is a new write, applied on the next microtask.

```ts
import { signal } from "anod";
const count = signal(0);
count.post(1); // scheduled
count.set(2); // cancels the post, count is 2
count.post(3); // scheduled again
// after microtask: count is 3
```

An idle updater `.set(fn)` sees the committed value, since the posts it supersedes never run. If the updater throws, the posts stay queued. Inside a batch or a flush, `.set()` is queued as well, behind the earlier posts, so the last write wins.

### Async reactivity

Each sync primitive has an async counterpart: a resource is a signal, a task is a compute, and a spawn is an effect, each of which can wait on promises and on each other. They share one guard: when a node runs again or is disposed, whatever its previous run was waiting on is dropped.

#### Resource

A resource is an async Signal. It supports writing changes through async functions, that later resolve to update it. There are three ways to write to a resource:

```ts
import { root, resource, LOADING } from "anod";

const save = (val) => new Promise((r) => setTimeout(() => r(val), 50));

root((c) => {
	const name = resource("alice");

	// Plain set - writes like a signal, and ends any async work in flight
	name.set("bob");

	// Optimistic set - write immediately, confirm in background
	name.set("charlie", async (c, optimistic) => {
		await c.suspend(save(optimistic));
		return optimistic; // server confirmed
	});

	// Async set - keep current value visible, replace when done
	name.set(async (c) => {
		return await c.suspend(save("bosse"));
	});

	c.effect(name, (val) => {
		console.log(val, name.is(LOADING) ? "(loading)" : "");
	});
});
```

The async callback receives the resource as `c` (with `suspend` for staleness protection) and the current/optimistic value. If the callback returns a sync value, it settles immediately with no loading state. If it returns a promise or suspends, `is(LOADING)` is true until it settles, and its readers are told when it starts loading, so a reader of `c.pending(resource)` sees it. Readers of its value run again then too, and read the value it had.

When a new `set()` fires while a previous async callback is still in flight, the old promise still resolves normally, but `suspend()` detects that the resource has moved on and simply doesn't yield back into the callback. The continuation after `await` never runs, so the stale result never reaches the `return` . Only the latest activation's callback gets to settle the resource.

A plain write counts as a new `set()` too, however it is made: `.set()`, `.post()`, inside a batch, or `c.set()` from a node. It discards whatever the callback in flight produces later, including the next `yield` of a generator or a later `resolve`. A plain write to a resource that is loading or failed settles it with the written value, even an equal one, so `is(LOADING)` and `is(ERROR)` turn false and the nodes waiting on it resume. Since every plain write ends the work in flight, `.post()` queues one even when the value is unchanged.

#### Task

A Task is an async Compute. Just like compute, it runs eagerly, but after it has produced an initial value, it only re-evaluates when read.

```ts
import { root, signal } from "anod";
root((c) => {
	const userId = signal(1);
	/**
	 * A task returns a promise. While loading,
	 * .get() returns the previous value (or undefined on first run).
	 * When it resolves, subscribers are notified.
	 */
	const user = c.task(userId, async (id, c) => {
		const res = await c.suspend(fetch(`/api/users/${id}`));
		return res.json();
	});

	/**
	 * Spawns await tasks through c.suspend().
	 * While the task is loading, the spawn suspends.
	 * When the task settles, the spawn resumes.
	 */
	c.spawn(async (c) => {
		const data = await c.suspend(user);
		console.log(data.name);
	});

	/**
	 * Changing userId triggers the task to re-fetch.
	 * The old promise is discarded if still pending.
	 * When the new result arrives, the spawn re-runs.
	 * If the task invalidates while the spawn is waiting,
	 * the spawn stays suspended until the task settles.
	 */
	userId.set(2);
});
```

#### Spawn

A Spawn is an async Effect. It runs eagerly, re-runs when dependencies change, and can await promises and tasks. When a spawn re-runs, any in-flight async work from the previous run is silently dropped through the `c.suspend()` mechanism.

```ts
import { root, signal } from "anod";
root((c) => {
	const url = signal("/api/data");
	c.spawn(async (c) => {
		const endpoint = c.val(url);
		c.cleanup(() => {
			console.log("previous run cleaned up");
		});
		const res = await c.suspend(fetch(endpoint));
		const data = await c.suspend(res.json());
		console.log(data);
	});
	/**
	 * The first spawn is mid-flight, waiting for fetch.
	 * Setting url causes the spawn to re-run. The old
	 * fetch promise is abandoned: c.suspend() detects that
	 * the activation is stale and silently drops the continuation.
	 */
	url.set("/api/other");
});
```

#### `c.suspend()`

`c.suspend()` is the easiest way to handle async staleness in anod. It guards the `await` boundary: if the node has been re-run or disposed since the suspend was issued, the continuation silently stops. This prevents stale async results from writing to state that has moved on.

However, `c.suspend()` is not the only way. For cases where you need more control — like attaching sequence numbers to requests for server-side ordering, you can use `c.version()` and manage staleness yourself (see [Manual versioning](#manual-versioning-with-cversion) below).

```ts
import { root, signal } from "anod";

const load = (url) => new Promise((r) => setTimeout(() => r(`data from ${url}`), 100));

root((c) => {
	const url = signal("/a");

	/** A plain await: nothing stops the stale run once its promise resolves. */
	c.spawn(async (c) => {
		const data = await load(c.val(url));
		console.log("await:  ", data);
	});

	/** A suspended await: the stale run never continues past it. */
	c.spawn(async (c) => {
		const data = await c.suspend(load(c.val(url)));
		console.log("suspend:", data);
	});

	url.set("/b");
});
// await:   data from /a   <- the run that url.set() replaced still finishes
// await:   data from /b
// suspend: data from /b
```

### Error handling

#### c.recover(), REFUSE, PANIC, FATAL

Every error in anod is a `Defect`: an object with an `error` field (the value) and a `type` field, one of three constants: `REFUSE` , `PANIC` , and `FATAL` . This lets you cleanly separate expected errors from unexpected crashes.

* **`c.refuse(val)`** — non-throwing expected error for computes. Usage: `return c.refuse("invalid")`.
* **`c.panic(val)`** — throwing expected error for computes and effects. Aborts the current run.
* **`FATAL`** — any unexpected throw is automatically wrapped as a `Defect` with `type: FATAL`.

Effects and spawns support `c.recover()` to intercept errors. The handler receives the `Defect` and can branch on the type. Return `true` to swallow, `false` to propagate.

```ts
import { root, signal, REFUSE, PANIC, FATAL } from "anod";
root((c) => {
	// Root-level handler: only log truly unexpected crashes
	c.recover((err) => {
		if (err.type === FATAL) {
			console.error("Bug detected:", err.error);
		}
		return true;
	});

	const url = signal("/api/data");
	c.spawn(async (c) => {
		c.recover((err) => {
			if (err.type === FATAL) return false; // bubble FATAL to root
			console.warn("Stale data, retrying on next change");
			return true; // swallow, stay alive
		});
		const res = await c.suspend(fetch(c.val(url)));
		if (!res.ok) {
			c.panic("Server returned " + res.status);
		}
		console.log(await c.suspend(res.json()));
	});
});
```

#### c.finalize()

Effects and spawns support `c.finalize()` for guaranteed cleanup at the end of the current activation, regardless of whether it succeeded or threw. `cleanup` runs at the start of the _next_ run. `recover` handles errors, and `finalize` runs at the end of _this_ run. Together, `recover` and `finalize` behave just like a `try/catch/finally` clause.

The primary use case is async effects that acquire resources mid-activation and need guaranteed release. Without `finalize` , you'd have to duplicate cleanup logic in both the normal path and `recover` .

```ts
import { root, signal, FATAL } from "anod";
root((c) => {
	const record = signal({ id: 1, name: "Ada" });
	c.spawn(async (c) => {
		c.shield(); // Run to completion: updates and disposal wait until we commit
		const db = await c.suspend(indexedDB.open("mydb"));
		const tx = db.transaction("store", "readwrite");
		const store = tx.objectStore("store");
		/**
		 * try:     insert the record (may throw on duplicate key)
		 * catch:   recover aborts the transaction, keeps the effect alive
		 * finally: finalize always closes the database handle
		 */
		c.finalize(() => db.close());
		c.recover((err) => {
			tx.abort();
			console.warn("Write failed, rolled back:", err.error);
			return true;
		});
		await c.suspend(store.put(c.val(record)));
		tx.commit();
	});
});
```

A few things to note:

* Multiple `finalize` calls accumulate and run forward in registration order
* Errors inside finalizers are swallowed, so a finalizer never replaces the run's result or error, unlike a throw inside a JS `finally`
* `finalize` does not bubble to parent effects, it's scoped to the activation it was registered in
* On re-run, any leftover finalize from the previous activation is cleared before the new run starts
* This differs from `cleanup`, which runs in reverse order (stack unwinding). Finalize is sequential post-completion work, not resource teardown

## Bundling

anod is written in plain JavaScript with JSDoc types, so one source serves two type systems: TypeScript, through the shipped `.d.ts` files, and Google's Closure Compiler, with which it is safe to use ADVANCED_OPTIMIZATIONS. Closure once had experimental TypeScript support, but it was discontinued, and it reads JSDoc types only.

The npm package ships both the minified build, in `dist/`, and the raw source, in `src/`. Bundlers pick the build by default, and the `src` export condition picks the source.

The context `c` is the node itself, and its methods live on prototypes. Ordinary bundlers can't tree-shake methods out of a prototype, so they keep all of anod; to my knowledge, only Closure Compiler can drop the methods you don't call. The build mangles anod's internal property names, and the name map ships as `anod/mangle.json`, so a library that extends anod can minify its own code with the same names.

## The reactive graph in depth

This section covers the internal evaluation model and the context helper methods that control it.

### Eager creation, lazy pull

When a compute or task is created, it runs immediately to establish its initial value and subscribe to its dependencies. After that first run, it becomes lazy: it only re-evaluates when something reads it. This means a compute with no subscribers accumulates staleness markers but does no actual work until someone calls `.get()` or reads it through `c.val()` .

Effects and spawns are different: they are always push-based. When their dependencies change, they are enqueued into the flush loop and re-run automatically, without anyone needing to pull them.

### Dependency tracking

Dependencies are tracked dynamically at runtime. When your callback calls `c.val(sender)` , a bidirectional link is created between the sender and the receiver. On re-run, anod reconciles the dependency list: new deps are added, stale deps are removed, reused deps are kept in place. This all happens in a single pass.

The bound signature `compute(dep, fn)` skips dependency tracking entirely. The single dependency is fixed at creation time. This is significantly faster for the common single-dep case and avoids all reconciliation overhead.

Anod's internal dependency reconciliation algorithm is designed to avoid allocation pressure in the update path. For nodes that read the same dependencies every run, they are re-used, and no additional objects are allocated.

### Contextual helpers

#### `c.equal()`

Lets you control whether downstream subscribers are notified after a compute re-runs. By default, anod uses `!==` — if the new value is a different reference, subscribers are notified. `c.equal()` gives you full control: you perform the comparison yourself and tell anod the result.

* `c.equal()` or `c.equal(true)` — "my result is equal to the previous one, don't notify subscribers"
* `c.equal(false)` — "my result changed, always notify subscribers" (even if `===` would say otherwise)

```ts
import { root, signal } from "anod";
import { deepEqual } from "some-util";

root((c) => {
	const userId = signal(1);
	const profile = c.compute((c, prev) => {
		const data = fetchProfileSync(c.val(userId));
		c.equal(deepEqual(data, prev));
		return data;
	}, null);
});
```

#### `c.cleanup()`

Runs a cleanup method every time the node updates, and finally when it disposes. Multiple cleanups run in reverse registration order, mirroring how destructors and `defer` statements unwind a stack — resources acquired later are released first. To get an 'on disposed' callback, register the cleanup in the scope above.

The nodes an effect or root created are disposed before its own cleanups run, both on re-run and on dispose. A child was created after the parent acquired what it uses, so it lets go of it first. A cleanup that needs the value of a compute the node created keeps that value in a plain variable: by the time the cleanup runs, the compute is disposed, and reading it throws.

A cleanup that throws doesn't stop the rest: every other cleanup still runs, and every child is still disposed. On re-run, the error counts as an error of the node, and goes to the `recover` handler of the run being torn down.

```ts
import { root, signal } from "anod";
root((c) => {
	const url = signal("ws://localhost:8080");
	c.effect(url, (addr, c) => {
		const socket = new WebSocket(addr);
		/**
		 * Cleanup closes the old socket whenever the effect
		 * re-runs (url changed) or when the effect is disposed.
		 */
		c.cleanup(() => socket.close());
		socket.addEventListener("open", () => {
			socket.send("Hello from " + addr);
		});
	});
	/**
	 * The old socket is closed via cleanup,
	 * a new one opens to the updated url.
	 */
	url.set("ws://localhost:9090");
});
```

### Contextual writes: `c.set()` / `c.post()`

Inside a callback, `c.set(signal, value)` writes to a signal while preventing the current node from re-triggering itself. This enables the interceptor pattern: subscribe to a signal, observe writes from elsewhere in the app, persist or validate them asynchronously, and write back a correction if needed, without causing a circular dependency.

```ts
import { root, signal } from "anod";
const save = (val) => fetch("/api/name", { method: "POST", body: val });

root((c) => {
	const name = signal("alice");

	/**
	 * Persistence interceptor. Any part of the app can
	 * write to `name` optimistically. This spawn observes
	 * the write, tries to persist it, and rolls back on failure.
	 * c.set() writes back without re-triggering the spawn,
	 * which would otherwise cause an infinite loop.
	 *
	 * If multiple writes arrive while a save is in flight,
	 * c.suspend() drops the stale request and only the
	 * latest value is persisted (last-write-wins).
	 */
	c.spawn(async (c) => {
		const optimistic = c.val(name);
		const res = await c.suspend(save(optimistic));
		if (!res.ok) {
			c.set(name, (await c.suspend(res.json())).rollback);
		}
	});

	c.effect(name, (val) => render(val));

	/** UI code just writes, unaware of persistence. */
	name.set("bob");
});
```

`c.post(signal, value)` is the deferred variant — schedules the write for the next microtask flush, with the same self-notification guard.

Both `c.set()` and `c.post()` also support writing to resources with an async callback: `c.set(resource, value, asyncFn)` .

### Async state checks: `c.pending()` / `c.rejected()`

`c.pending(sender)` subscribes to a sender and returns `true` if it is loading. It works with tasks, resources, or any sender, and accepts an array of senders, returning `true` if any of them is loading.

`c.rejected(sender)` subscribes to a sender and returns its error if it has failed, or `null` otherwise. Unlike `c.val()` , it does not throw on error — this is the safe way to check error state reactively.

```ts
import { root } from "anod";
root((c) => {
	const data = c.task(async (c) => {
		return await c.suspend(fetch("/api/data").then((r) => r.json()));
	});
	c.effect((c) => {
		if (c.pending(data)) return console.log("Loading...");
		const err = c.rejected(data);
		if (err) return console.log("Error:", err.error);
		console.log("Data:", c.val(data));
	});
});
```

### Evaluation helpers

Options change how a node evaluates. They are passed in the `opts` argument of the factory that creates the node, and they are fixed from then on: a node cannot become stable, weak or eager later, or stop being one.

```ts
c.compute(fn, seed, opts, args);
c.task(fn, seed, opts, args);
c.effect(fn, opts, args);
c.spawn(fn, opts, args);
c.compute(dep, fn, seed, opts, args); // bound
c.effect(dep, fn, opts); // bound
```

The options are `STABLE`, `WEAK` and `EAGER` below, `DEFER`, which skips a node's first run (see [Compute](#compute)), and `SETUP`, which makes a bound node also track the `c.val()` reads of its first run. `WEAK` and `EAGER` only apply to computes and tasks. In TypeScript, `opts` takes one option, and an effect or spawn only takes `STABLE`, `DEFER` or `SETUP`. JavaScript can combine options with `|`.

#### `STABLE`

A stable node tracks its dependencies on its first run, and freezes them in place. Later runs read through `c.val()` without subscribing, so they skip the reconcile machinery that handles dynamic dependencies. This is useful for a compute or effect that reads a long array of signals that never changes. A bound node (`c.compute(dep, fn)`) is always stable.

```ts
import { root, signal, STABLE } from "anod";
root((c) => {
	const signals = [];
	for (let i = 0; i < 100; i++) {
		signals[i] = signal(i);
	}
	/**
	 * We know this node reads the same 100 signals
	 * every time, so we create it stable and avoid
	 * the subscription overhead.
	 */
	const formatted = c.compute(
		(c) => signals.map((i) => `Item: ${c.val(i)}`),
		void 0,
		STABLE
	);

	const first = signal(false);
	const second = signal(2);
	const wrong = c.compute(
		(c) => {
			if (c.val(first)) {
				return c.val(second);
			}
		},
		void 0,
		STABLE
	);

	/**
	 * Since the node is stable, it doesn't track new
	 * dependencies on update. Even though it reads
	 * second through c.val(), it doesn't listen to
	 * changes from second.
	 */
	first.set(true);
});
```

#### `WEAK`

A weak compute releases its cached value and runs its cleanups when it loses all subscribers. The next read triggers a fresh recompute. When the last reader drops it during an update, the cleanups run once that update has settled the readers' dependencies, before the write returns. An error thrown by one of them is the weak compute's, not the reader's, and it is rethrown to the writer. This is useful for derived data that retains significant memory — parsed documents, decoded images, materialized query results — that can be safely dropped and recomputed on demand.

```ts
import { root, signal, WEAK } from "anod";
root((c) => {
	const path = signal("/data/large-dataset.csv");
	const parsed = c.compute(
		(c) => {
			const raw = readFileSync(c.val(path));
			const rows = parseCSV(raw); // large allocation
			c.cleanup(() => {
				console.log("released parsed data");
			});
			return rows;
		},
		void 0,
		WEAK
	);

	const view = c.effect(parsed, (rows) => render(rows));
	// parsed holds the full row array in memory

	view.dispose();
	// Since compute has no subscribers, it releases its value and calls
	// the cleanup hook. It stays idle until someone reads it again

	parsed.get(); // re-parses the file on demand
});
```

Releasing keeps nothing from the compute's previous life, not even its seed. The seed is only the first `prev`, and a released compute has no `prev`, so the recompute receives `undefined`. A reducer that should restart from an initial value uses a default parameter, which applies on the first run and after every release:

```ts
const totals = c.compute((c, prev = []) => [...prev, c.val(entry)], void 0, WEAK);
```

State that must survive a release belongs in `args`, the last argument of `compute()`, which the compute keeps for its whole lifetime and passes to every run.

#### `EAGER`

Makes a compute push-based instead of pull-based. An eager compute re-evaluates immediately when notified, rather than waiting to be pulled. Use sparingly: this removes the laziness optimization but guarantees the value is always fresh.

#### `is()`

`node.is(flag)` tells whether a node has an option or a state set. The states are `DISPOSED`, `LOADING` and `ERROR`. It works on every node, and on `c` inside a node's callback.

```ts
import { root, signal, LOADING, ERROR, DISPOSED, STABLE } from "anod";
root((c) => {
	const user = c.task(async (c) => fetchUser(), void 0, STABLE);
	user.is(STABLE); // true
	user.is(LOADING); // true while the fetch is in flight
	user.is(ERROR); // true if the fetch failed
	user.dispose();
	user.is(DISPOSED); // true
});
```

Any flag that is not an option or a state reads as `false`. In TypeScript, each group of constants has its own type, so `is(REFUSE)`, or comparing `defect.type === ERROR`, is a compile error.

#### `pause()` / `resume()`

Temporarily suspends an effect or root from reacting to dependency changes. While paused, the node still tracks that it has gone stale, but defers all re-evaluation until `resume()` is called. `pause()` recursively pauses all owned child effects. Computes are not pausable — they are pull-based and inherently lazy, so pausing an owning effect already prevents them from being read.

```ts
import { root, signal, batch } from "anod";
root((c) => {
	const name = signal("Vilhelm");
	const age = signal(30);
	const logger = c.effect((c) => {
		console.log(c.val(name), c.val(age));
	});

	/**
	 * Pause the effect. While paused, signal writes
	 * still mark it stale, but it won't re-run.
	 */
	logger.pause();

	name.set("Leif");
	age.set(25);
	// Nothing prints — the effect is paused.

	/**
	 * Resume brings it back up to date. If the effect
	 * is stale, it re-runs. If it has owned children
	 * that are stale, they re-run too.
	 */
	logger.resume(); // Prints "Leif 25"
});
```

When you have multiple independent roots, you can resume them inside a `batch()` to coalesce everything into a single flush.

```ts
import { root, signal, batch } from "anod";
const counter = signal(0);
const r1 = root((c) => {
	c.effect(counter, (val) => console.log("r1:", val));
});
const r2 = root((c) => {
	c.effect(counter, (val) => console.log("r2:", val));
});

r1.pause();
r2.pause();
counter.set(42);

batch(() => {
	r1.resume();
	r2.resume();
}); // Both effects flush together
```

### Error recovery in depth

anod provides a structured error model where every error is a `Defect`, with the value in `error` and the category in `type`:

| Constant | Value | Meaning                      | How it's created       |
| -------- | ----- | ---------------------------- | ---------------------- |
| `REFUSE` | 1     | Expected error, non-throwing | `return c.refuse(val)`, or `throw refuse(val)` |
| `PANIC` | 2     | Expected error, throwing     | `c.panic(val)`, or `throw panic(val)` |
| `FATAL` | 3     | Unexpected crash             | Any uncaught `throw`, or `fatal(val)` |

**`c.refuse(val)`** is available on computes only. It sets the compute into an error state without throwing, the caller returns the error value. This is useful for validation: the compute can't produce a valid result, but it's not a crash.

**`c.panic(val)`** is available on computes and effects. It throws, aborting the current run, but anod marks it as an expected error so recover handlers can distinguish it from crashes. anod uses it too: when a task is disposed while a node waits on it, the waiter is rejected with a `PANIC` (see [Stale activation safety](#stale-activation-safety)).

**`FATAL`** is what you get when something throws unexpectedly, meaning, any thrown value that is not a `Defect`. anod wraps it once as a `Defect` with `type: FATAL`. A `Defect` keeps its type wherever it travels: through reads, awaits, owner chains, and your own `try/catch` that rethrows it.

**`refuse(val)`, `panic(val)` and `fatal(val)`** are exported factories that create a `Defect` without a context, so helpers and library code can join anod's error model. Throw the result from anywhere inside a compute, effect or task:

```ts
import { c, signal, refuse, panic, Defect } from "anod";

function parseAge(text: string): number {
	const age = Number(text);
	if (Number.isNaN(age)) throw refuse("not a number");
	if (age < 0) throw panic("negative age");
	return age;
}

const input = signal("42");
const age = c.compute((c) => parseAge(c.val(input)));
// age.get() is 42, or a Defect with type REFUSE or PANIC
```

Use `err instanceof Defect` to tell an anod error from any other value.

#### Recovery

`c.recover()` intercepts errors before they dispose the node. The handler receives the `Defect` and returns `true` to swallow or `false` to propagate. If you register multiple recover hooks, they run forward, breaking at the first hook that returns true, or bubbles to next owner if none. A root's `recover()` is the last line of defense.

This lets you build layered error handling: effects handle their own expected errors, and the root catches anything truly unexpected.

```ts
import { root, signal, REFUSE, PANIC, FATAL } from "anod";
root((c) => {
	// Root: catch unexpected crashes, report to error tracker
	c.recover((err) => {
		if (err.type === FATAL) {
			reportToSentry(err.error);
		}
		return true;
	});

	// Compute uses refuse() for validation, just return error
	const price = signal(100);
	const discount = c.compute(price, (val, c) => {
		if (val <= 0) {
			return c.refuse("Price must be positive");
		}
		return val * 0.9;
	});

	// Spawn uses panic() when data is stale, throws expected error
	const token = signal("abc123");
	c.spawn(async (c) => {
		c.recover((err) => {
			if (err.type === PANIC) {
				console.warn("Auth issue, will retry:", err.error);
				return true; // stay alive, retry on next token change
			}
			return false; // bubble FATAL to root
		});
		let res = await c.suspend(
			fetch("/api/me", {
				headers: { Authorization: c.val(token) }
			})
		);
		if (res.status === 401) {
			c.panic("Token expired");
		}
	});
});
```

## Async reactivity in depth

anod provides four ways to consume async values, each suited to a different use case.

### The four delivery paths

#### 1. Sync check with `c.pending()`

`c.pending(task)` returns `true` if the task is still loading. This lets you branch synchronously without awaiting. The current node subscribes to the task for future updates but does not block.

```ts
import { root, signal } from "anod";
const fetchData = () =>
	new Promise((r) => setTimeout(() => r({ name: "anod" }), 50));

root((c) => {
	const data = c.task(async (c) => {
		return await c.suspend(fetchData());
	});
	c.effect((c) => {
		if (c.pending(data)) {
			console.log("Loading...");
			return;
		}
		console.log("Ready:", c.val(data));
	});
});
// Prints "Loading..." then after 50ms "Ready: { name: 'anod' }"
```

#### 2. Await with `c.suspend()`

`c.suspend()` is the primary async delivery mechanism. It accepts a promise, a task or resource, or an array that mixes them. A plain value passes through, as `await value` would.

**Promise**: wraps the promise so that if the node is disposed or re-run before it resolves, the continuation is silently dropped.

```ts
import { root, signal } from "anod";
const fetchData = (url) => new Promise((r) => setTimeout(() => r({ url }), 50));

root((c) => {
	const url = signal("/api/data");
	c.spawn(async (c) => {
		// If the spawn re-runs while fetchData is pending,
		// the old promise's .then() never fires.
		const res = await c.suspend(fetchData(c.val(url)));
		console.log("Got:", res.url);
	});
	url.set("/api/other"); // old activation silently dropped
});
```

**Task**: if the task is already settled, returns the value synchronously. If the task is loading, creates a two-way channel binding: the spawn suspends until the task settles, then resumes with the value. To skip the promise and the microtask, pass callbacks instead (see [task callbacks](#4-task-callbacks-with-csuspendtask-onresolve-onreject)).

```ts
import { root, signal } from "anod";
root((c) => {
	const id = signal(1);
	const fetchTask = c.task(id, async (id, c) => {
		await c.suspend(new Promise((r) => setTimeout(r, 50)));
		return { id, name: "user_" + id };
	});
	c.spawn(async (c) => {
		// Suspends until fetchTask settles. If fetchTask re-runs,
		// the spawn is notified and re-runs too.
		const data = await c.suspend(fetchTask);
		console.log(data.name);
	});
});
```

A task that awaits a task which, directly or through other tasks, awaits it back would never settle. The await that closes such a cycle throws `"Cycle detected"` instead, so the tasks fail rather than stay loading.

**Array**: awaits multiple tasks, resources and promises concurrently. Returns when all of them have settled, with the values in the same order. A plain value in the array is returned as it is. A promise is waited on like a task, so a rejection reaches you as a `Defect`, and an array with a promise in it always takes at least a microtask, since a promise can't be read synchronously.

```ts
import { root } from "anod";
const delay = (val, ms) => new Promise((r) => setTimeout(() => r(val), ms));

root((c) => {
	const usersTask = c.task(async (c) => await c.suspend(delay(["Alice"], 50)));
	const postsTask = c.task(async (c) => await c.suspend(delay(["Hello"], 30)));

	c.spawn(async (c) => {
		const [users, posts] = await c.suspend([usersTask, postsTask]);
		console.log(users, posts); // ["Alice"] ["Hello"]
	});
});
```

#### 3. Callback (resolve, reject)

`c.suspend(setupFn)` accepts a setup function that receives `resolve` and `reject` callbacks. This avoids promise allocation entirely and enables natural integration with callback-based APIs like WebSockets, event emitters, and timers. The node enters a loading state when its fn returns, and settles when `resolve` or `reject` is called.

The setup function runs right away, but `resolve` and `reject` never act in the middle of your fn. Called before the fn returns, from inside the setup function or anywhere else in the body, they take effect as soon as it returns, still in the same run and without a microtask. So the code after `c.suspend()` always runs first, whether the result comes at once or later, and it reads and tracks dependencies like the code before it. A `reject` before the fn returns fails the run as a throw in the body would: in the first run the error reaches the code that created the node, in a re-run `c.recover()` gets it.

The callbacks are guarded with the same staleness protection as promises: if the node is disposed or re-run before `resolve` fires, the call is silently ignored. Like a promise, the pair settles once: the first call to `resolve` or `reject` wins, and later calls do nothing.

```ts
import { root, signal, DEFER } from "anod";
root((c) => {
	const url = signal("ws://localhost");
	const outgoing = signal("");
	const incoming = signal(null);

	c.spawn((c) => {
		const ws = new WebSocket(c.val(url));
		c.cleanup(() => ws.close());

		c.suspend((resolve, reject) => {
			ws.addEventListener("open", () => {
				ws.addEventListener("message", (e) => {
					incoming.set(JSON.parse(e.data));
				});
				/**
				 * Socket is open. Create a child effect that forwards
				 * outgoing messages. DEFER skips the initial run,
				 * so it only fires when outgoing actually changes.
				 * Because anod passes context explicitly, you can freely
				 * create owned effects beyond the async boundary.
				 */
				c.effect(outgoing, (msg) => ws.send(msg), DEFER);
				resolve();
			});
			ws.addEventListener("error", reject);
		});
	});

	c.effect(incoming, (msg) => console.log("received:", msg));
	outgoing.set("hello server");
});
```

Note the spawn body is sync — no `async` keyword, no promise allocation. The setup function controls when the node settles. If `url` changes, the spawn re-runs: the child effect is disposed, `cleanup` closes the old websocket, and the old `resolve` becomes stale and is silently ignored.

You can only call `c.suspend()` with a setup function or with callbacks once per step: once in the fn, and once in each callback that continues the run (see [task callbacks](#4-task-callbacks-with-csuspendtask-onresolve-onreject)). Calling it twice in the same place throws an error. This prevents ambiguous double-settlement.

#### 4. Task callbacks with `c.suspend(task, onResolve, onReject)`

`c.suspend(task, onResolve, onReject)` reads a task, a resource, a promise, or an array of them, through callbacks instead of `await`. It works like `.then(onResolve, onReject)`, without the promise:

* **Settled task**: `onResolve(value)` is called as soon as your fn returns, so the code after `c.suspend()` runs first, as it does for a loading task. There is still no microtask: the node finishes in the same run. Reads inside the callback are tracked like reads after an `await`.
* **Loading task**: the callbacks are stored on the task, and the node is loading until one of them runs. When the task settles, the callback runs synchronously, in the same tick, after everything that depends on the task has been marked stale. So a read inside the callback sees the graph as it is after the settle. A task that settles while your fn is still running is treated like a settled one.
* **Tasks settle with the result**: in a task, what the callback returns becomes the task's value, and what it throws becomes its error. In a spawn, the return value is ignored.
* **A callback continues the run**: a `c.suspend()` made inside a callback is the run's next step, and the run settles with the last step's result. A promise that a task's or spawn's callback returns is adopted, as when the fn returns one: the run stays loading and settles with what it gives. A returned task or resource is the value, as it would be from the fn; to wait for one, suspend on it. A step whose input has settled runs at once, in the same run, so a chain over settled tasks finishes without a microtask, in constant stack however long it is.
* **Promises**: a promise, alone or in an array, is waited on like a task that settles when it does. It always takes at least a microtask.
* **Errors**: a failing task calls `onReject(error)` with the anod error (a `Defect`). If `onReject` returns, a task settles with that value, as with `.then`. Without `onReject`, the error fails the node, as a throwing `await` would, so it reaches `c.recover()`.
* **Staleness**: if the node re-runs or is disposed before the task settles, the callbacks are dropped and never run.

```ts
import { root, signal } from "anod";
root((c) => {
	const id = signal(1);
	const user = c.task(id, async (id, c) => {
		const res = await c.suspend(fetch(`/api/users/${id}`));
		return await c.suspend(res.json());
	});

	/** A task built from another task: settles with what onResolve returns. */
	const greeting = c.task((c) =>
		c.suspend(user, (u) => "Hello, " + u.name, () => "Hello, guest")
	);

	/** A sync spawn: no async keyword, no promise, no microtask. */
	c.spawn((c) => {
		c.suspend([user, greeting], ([u, text]) => {
			console.log(u.id, text);
		});
	});
});
```

Whether the callback runs now or later depends on whether the task has settled, so don't rely on code after `c.suspend()` running before or after it.

A step waits for a value computed by the step before it, which `await` would do with a promise and a microtask per step:

```ts
import { root, signal } from "anod";
root((c) => {
	const order = signal({ address: "Main St 1", coupon: "SPRING" });
	const getShipping = (address) => Promise.resolve([{ id: "q1", price: 10 }]);
	const getTax = (quote) => Promise.resolve(2);
	const getDiscount = (quote, coupon) => Promise.resolve(1);

	const total = c.task((c) =>
		c.suspend(getShipping(c.val(order).address), (quotes) => {
			const quote = quotes[0];
			/** The next step: both requests start together. */
			return c.suspend(
				[getTax(quote.id), getDiscount(quote.id, c.val(order).coupon)],
				([tax, discount]) => quote.price + tax - discount
			);
		})
	);
});
```

If `order` changes, the task re-runs, and the steps the old run hadn't reached are dropped. Each step is guarded the way an `await` is: a dropped step never runs, and what it would have received is discarded.

In TypeScript, a callback-form `c.suspend()` returns a `Step<T>`, where `T` is what its callbacks settle with. It exists only for the type checker: at run time it is `undefined`, and anod ignores it. Return it from the fn and from each callback that continues the run, as above, and the task is typed from the last step: `total` is a `Task<number>`. A fn that doesn't return its step needs the type named, as in `c.task<number>((c) => { c.suspend(...); })`.

The node subscribes to the task, the same as with `await`. When the task settles again, the node re-runs and calls `c.suspend()` again.

Use one suspend per step: the fn makes the first, and each callback may make the next. A second suspend in the same fn or callback throws, and so does a callback suspend in an async fn after an `await`. Wait on several things at once with an array.

### Deferred dependencies with `c.defer()`

`c.defer()` reads a signal's value without subscribing during the sync body. Instead, the dependency is registered at settle time after the async work completes. This is useful when you need a value for async work but don't want changes to that value to cancel your in-flight operation.

```ts
import { root, signal } from "anod";
const fetchWithAuth = (token) =>
	new Promise((r) => setTimeout(() => r({ token, data: "ok" }), 50));

root((c) => {
	const authToken = signal("token_abc");
	const data = c.task(async (c) => {
		const token = c.defer(authToken); // read but don't subscribe yet
		const res = await c.suspend(fetchWithAuth(token));
		// At settle time, authToken is subscribed.
		// If it changed during the fetch, the task re-runs.
		return res;
	});
	c.spawn(async (c) => {
		const result = await c.suspend(data);
		console.log(result); // { token: "token_abc", data: "ok" }
	});
});
```

### Abort controller with `c.controller()`

`c.controller()` returns an `AbortController` that is automatically aborted when the node re-runs or is disposed. Useful for cancelling fetch requests or other abortable operations.

Every call within one activation returns the same controller, so several requests can share its signal. If you abort it yourself, the next call returns a fresh one.

```ts
import { root, signal, FATAL } from "anod";
root((c) => {
	const url = signal("/api/data");
	c.spawn(async (c) => {
		const endpoint = c.val(url);
		const ctrl = c.controller();
		// If the spawn re-runs, c.controller() aborts the old fetch
		// and c.suspend() silently drops the stale activation.
		// Use recover for errors in the current activation.
		c.recover((err) => {
			if (err.type === FATAL) {
				console.error("Fetch failed:", err.error);
			}
			return true;
		});
		const res = await c.suspend(fetch(endpoint, { signal: ctrl.signal }));
		console.log(await c.suspend(res.json()));
	});
	// Changing url re-runs the spawn, which aborts the old fetch
	url.set("/api/other");
});
```

### Running to completion with `c.shield()`

By default, when a spawn's dependencies change during async work, the spawn re-runs: the old activation is abandoned and a new one starts. Sometimes that is wrong. If you are iterating over an array and saving each element to a database, the whole iteration has to finish before the next update is processed.

`c.shield()` lets the current activation run to completion. Call it anywhere in the activation; it holds from then on, until the activation ends: when the function returns or throws, when its promise settles, or when a callback suspend delivers. There is no way to unshield.

- **Changes wait.** A change to a dependency still marks the node stale, but the re-run waits until the activation ends, then runs with the fresh values.
- **Owners wait.** An owner above the shielded node that would re-run (a route change, say) re-runs once the activation ends, so the old and the new run never overlap. Everything else keeps updating as usual, siblings included.
- **Disposal waits.** Disposing the node, or any owner above it, waits until the activation ends. Meanwhile, the disposed subtree is frozen: nothing in it starts a new run. The shielded activation keeps going, though. It can read and create children, and its controller is not aborted. Then the subtree is torn down, children first, so a cleanup on the root is the "shutdown finished" hook.

Only effects and spawns can shield, because they perform the side effects that must finish. A task only produces data, and a disposed task simply stops.

```ts
import { root, signal } from "anod";
const saveToDb = (item) =>
	new Promise((r) =>
		setTimeout(() => {
			console.log("saved:", item);
			r();
		}, 10)
	);

const app = root((c) => {
	const todoList = signal(["buy milk", "write docs"]);
	c.spawn(async (c) => {
		const items = c.val(todoList);
		c.shield();
		for (const item of items) {
			await c.suspend(saveToDb(item));
		}
		// The shield ends when the spawn completes. If todoList
		// changed during the loop, the spawn re-runs now with
		// the updated list.
		console.log("batch complete");
	});
	// This update waits until the current batch finishes
	todoList.set(["deploy", "celebrate"]);
});

app.dispose(); // Waits for the batch in flight, then tears down
```

`dispose(true)` doesn't wait. It ends every shield under the node, aborts their controllers, runs the cleanups, and drops each shielded continuation at its next `c.suspend()`. It also works on a disposal that is already waiting. You need it when a shielded activation waits on something that only its own teardown would deliver, such as its controller's abort, or a cleanup of its owner or of one of its children. Those waits never end on their own.

### Stale activation safety

Every call to `c.suspend()` captures the current activation timestamp. When the promise resolves, anod checks whether the node has been re-run or disposed since the suspend was issued. If it has, the resolution is silently discarded. This guarantees that stale async results never pollute the current activation, even across complex chains of awaits.

This applies to both resolve and reject: if a promise rejects after the node was invalidated, the error is also discarded. You are never notified about errors from stale activations.

The same holds for awaiting a task, and for the callback form: a node that has been disposed never resumes, whatever it waits on. When a task is disposed, the nodes waiting on it are rejected once the disposal has finished, with a `Defect` of type `PANIC` ("Awaited task was disposed"). Signals and resources are not owned, so they are never disposed. It is `PANIC`, not `FATAL`, because nothing crashed: what you waited on was ended by its owner, like an `AbortError` from `fetch`. Every waiter gets the same value, through `await` and `onReject` alike. A waiter that the same disposal tore down (a spawn and the task it awaits, owned by the same root) is not told; a waiter elsewhere is. A shielded node (`c.shield()`) is not disposed until its activation finishes, so it is told, and is disposed once it completes.

A dropped continuation never runs, so it can't clean up after itself either. Register what a run acquires with `c.cleanup()`, which runs when the node runs again or is disposed, and call `c.shield()` when the run must finish.

The point is that promises don't write state at unpredictable times. In the sync graph, every reader sees a consistent state the moment a write returns. The async guarantee is weaker, but of the same kind: an async run always sees a snapshot that was consistent at some point in time, though not necessarily the latest one. If a run suspends on 10 tasks, it continues once all 10 have settled, each with a valid value.

### Manual versioning with `c.version()`

`c.suspend()` handles client-side staleness automatically, but it doesn't control what happens on the server. If you fire 5 requests from a like button, the server may process them in any order. Request 3 might land after request 5. The server's final state could disagree with what the client settled.

`c.version()` returns the current activation's sequence number. It increments every time the node re-runs. You can attach it to requests so the server can enforce ordering:

```ts
root((c) => {
	const likes = resource(0);
	likes.set(likes.get() + 1, async (c, optimistic) => {
		const version = c.version();
		const res = await c.suspend(
			fetch("/api/likes", {
				method: "POST",
				headers: { "X-Version": String(version) },
				body: JSON.stringify({ count: optimistic })
			})
		);
		return (await res.json()).count;
	});
});
```

The server can reject or reorder writes based on the version header. This gives you end-to-end ordering guarantees that `c.suspend()` alone cannot provide.

You can also use `c.version()` without `c.suspend()` for full manual control over async flows:

```ts
c.spawn(async (c) => {
	const version = c.version();
	const data = await fetch(c.val(url));
	// Check if we've been invalidated since the fetch started
	if (c.version() !== version) return; // stale, bail out
	processData(data);
});
```

This is useful when you need the stale continuation to run (for cleanup, logging, or cancellation) rather than being silently dropped.

## Limitations

I went back and forth between a global listener and a context object, and settled on the context: a global can't follow a run across an `await`, and the async graph needs exactly that. The cost is that `c` has to be passed along, and reading through the wrong one, such as an outer `c` inside an inner callback, subscribes the wrong node. Naming the parameter `c` in every callback, as the examples here do, shadows the outer one. A lint rule, or a stronger compile-time check, could catch the rest.

A library built on anod can still offer a global listener for sync code, and hand out the context only where an async callback needs it.

anod uses the O(1) two-way slot binding that S.js uses: each link stores its index in the other node's list, so a receiver that is disposed, or that drops a dep on a re-run, is unlinked at once by moving the last entry into its slot. The cost is memory: `_subs` and `_deps` hold pairs, which doubles their length. Ownership lists are cheaper: a child disposed on its own stays in its owner's `_owned` list until the owner compacts the list, once the disposal has finished.

A write marks the computes downstream of it by recursion, one level per compute in a chain. A chain of computes that each read the previous one, deeper than about 3,500, overflows the call stack under V8 (Node, Chrome) with its default stack size; Bun handles about 20,000. Reading a deep chain is iterative and has no such limit. A real graph is rarely more than a few dozen computes deep: a list modeled as one compute per item, each reading the one before (running totals, layout offsets), is better written as one compute over the array.

## Benchmarks

Most reactivity benchmarks measure deep chains and synthetic propagation patterns that rarely occur in real apps. This benchmark (`bench/app`) instead models a typical list view: 1,000 rows, each with its own state signals, computes derived from them, and effects that write DOM values. It is the shape most application code has: many signals feeding many computes, with effects mostly writing to the DOM.

Per row, three signals (`label`, `count`, `done`) feed three computes: a text from label and count, a filter check, and a class name from selection and theme. Selection goes through each library's selector, which flips only the previous and the next row: Solid's `createProjection`, and the same small hand-written keyed selector in anod and alien-signals, which have no built-in one. Five DOM writes follow, four with a single dependency and one with two. At app level, a count over all 1,000 rows feeds a footer, and one side effect persists the filter. DOM elements are plain objects, so the numbers measure the reactive engine, not a DOM.

Every suite builds the same graph, and checks at startup that each scenario runs exactly the same number of computes and effects. Each uses its library as documented. anod builds every node with the unbound API, `c.compute(fn)` and `c.effect(fn)`, which tracks dependencies the way alien-signals and Solid do. These tables don't use the bound API for single-dependency nodes (`c.compute(dep, fn)`), which a compiler like katode emits, or the `STABLE` option, which the other libraries have no equivalent of. alien-signals uses `computed` and `effect` with one `effectScope` per row. Solid uses `createMemo`, `createRenderEffect` for DOM writes and one `createRoot` per row, ending each scenario with `flush()` as its renderer does.

| Scenario | What happens | Work per iteration |
| :-- | :-- | :-- |
| Mount + unmount 1k rows | build every row and the app, then dispose them | 3,001 computes, 5,002 effects |
| Edit one row | change one row's label | 1 compute, 2 effects |
| Toggle one row | flip one row's `done` | 1 compute (the 1,000-dep count), 2 effects |
| Select a row | change the selected id | 2 computes, 4 effects |
| Select a row, no selector | the same, with a compute per row over the selected id | 1,002 computes, 4 effects |
| Edit 10 rows in a batch | bump 10 rows' counts in one batch | 10 computes, 20 effects |
| Change filter | cycle all → done → open | 1,000 computes, up to 1,001 effects |
| Change theme | toggle light/dark | 1,000 computes, 1,000 effects |
| Remount 100 rows | dispose and rebuild 100 row components | 300 computes, 500 effects |

Time is the average per iteration, the median of 8 rounds run in rotated order. Alloc is the bytes one iteration allocates, the median across rounds, measured with V8's sampling heap profiler. It counts objects already collected, unlike mitata's heap column, which under-reports libraries that allocate a lot. Part of it is the benchmark's own strings, the same in every suite. Negative Δ = anod is faster / allocates less. Ran on Apple M1 Pro, Node v26.11.1, macOS 26.6.

### anod vs [alien-signals](https://github.com/stackblitz/alien-signals) by Stackblitz (Vue-js internal engine)

| Scenario | alien | anod | Δ time | alien | anod | Δ alloc |
| :-- | --: | --: | --: | --: | --: | --: |
| | **Time** | **Time** | | **Alloc** | **Alloc** | |
| Mount + unmount 1k rows | 1.07 ms | 779 µs | -27% | 3.8 MB | 3.2 MB | -16% |
| Edit one row | 184 ns | 154 ns | -16% | 177 B | 96 B | -46% |
| Toggle one row | 17.8 µs | 6,260 ns | -65% | 25 B | 25 B | +1% |
| Select a row | 425 ns | 374 ns | -12% | 97 B | 97 B | 0% |
| Select a row, no selector | 101 µs | 70.6 µs | -30% | 40.4 kB | 97 B | -100% |
| Edit 10 rows in a batch | 2,223 ns | 1,887 ns | -15% | 2.1 kB | 1.4 kB | -34% |
| Change filter | 98.4 µs | 75.9 µs | -23% | 26.9 kB | 21.4 kB | -20% |
| Change theme | 109 µs | 71.4 µs | -35% | 28.2 kB | 28.2 kB | 0% |
| Remount 100 rows | 106 µs | 67.4 µs | -36% | 303.4 kB | 246.2 kB | -19% |

### anod vs [@solidjs/signals](https://github.com/solidjs/solid) (Solid 2.0 beta)

| Scenario | solid | anod | Δ time | solid | anod | Δ alloc |
| :-- | --: | --: | --: | --: | --: | --: |
| | **Time** | **Time** | | **Alloc** | **Alloc** | |
| Mount + unmount 1k rows | 6.16 ms | 779 µs | -87% | 11.2 MB | 3.2 MB | -72% |
| Edit one row | 1,622 ns | 154 ns | -90% | 1.1 kB | 96 B | -91% |
| Toggle one row | 48.4 µs | 6,260 ns | -87% | 1.0 kB | 25 B | -98% |
| Select a row | 4,990 ns | 374 ns | -93% | 3.5 kB | 97 B | -97% |
| Select a row, no selector | 227 µs | 70.6 µs | -69% | 150.8 kB | 97 B | -100% |
| Edit 10 rows in a batch | 14.3 µs | 1,887 ns | -87% | 8.9 kB | 1.4 kB | -85% |
| Change filter | 548 µs | 75.9 µs | -86% | 390.6 kB | 21.4 kB | -95% |
| Change theme | 871 µs | 71.4 µs | -92% | 511.4 kB | 28.2 kB | -94% |
| Remount 100 rows | 599 µs | 67.4 µs | -89% | 990.5 kB | 246.2 kB | -75% |

Solid's projection also slows its scenarios that never touch the selection: in a run of just that scenario, a toggle takes about 34 µs without it and 44 µs with it. Real Solid apps use stores throughout, so the suite keeps it; see [bench/app/README.md](bench/app/README.md).

Run them with `ANOD_API=unbound node bench/app/anod.js`, `node bench/app/alien-signals.js` and `node bench/app/solid.js` after `npm run make`. Without `ANOD_API=unbound`, `bench/app/anod.js` uses the bound API for single-dependency nodes and creates the 1,000-signal count with `STABLE`. See [bench/app/README.md](bench/app/README.md) for the full graph.

## Acknowledgements

I got the idea to build anod once I stumbled upon [S.js by Adam Haile](https://github.com/adamhaile/S). It has been around for a long time, and I think it has been heavily influential to the modern reactive signals space. For years I wanted to extend it, but it took almost 7 years until I finally took the time to fully implement my idea.

Then, I want to shout out to [ivi](https://github.com/localvoid/ivi), by Boris Kaul. The whole idea of the context in anod originates from ivi's elegant `component(c => {})` signature, that implements a two-phase state registration. Also, I think his library deserves more attention; it's an exceptionally well-built UI library.

## Contributing

Pull requests that are not preceded by a discussion will be closed. If you'd like to contribute a feature, bug fix, or improvement, please open a thread in the [Discussions](https://github.com/visj/anod/discussions) tab first. This ensures we align on the design before any implementation work begins.

Bug reports and questions are always welcome via [Issues](https://github.com/visj/anod/issues).

## License

MIT
