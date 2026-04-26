# anod

anod is a reactive state management library. It has built-in support for both sync and async graphs. It's similar to many other signal libraries, but its architecture differs in several meaningful ways:

* No global/automatic dependency tracking, provides a context object to every callback
* Uses a hybrid push/pull model, where nodes can both eagerly and lazily send updates
* Async is built into the core, and is a first-hand member

## Table of contents

- [anod](#anod)
	- [Table of contents](#table-of-contents)
	- [Quick example](#quick-example)
	- [Basic usage](#basic-usage)
		- [Overview](#overview)
			- [Root](#root)
			- [Global `c` context](#global-c-context)
			- [Signal \& Mutable](#signal--mutable)
			- [Compute](#compute)
			- [Effect](#effect)
		- [Async reactivity](#async-reactivity)
		- [Resource](#resource)
		- [Task](#task)
		- [Spawn](#spawn)
		- [`c.suspend()`](#csuspend)
		- [Error handling](#error-handling)
			- [c.recover(), REFUSE, PANIC, FATAL](#crecover-refuse-panic-fatal)
			- [c.finalize()](#cfinalize)
			- [Batching](#batching)
	- [The reactive graph in depth](#the-reactive-graph-in-depth)
		- [Eager creation, lazy pull](#eager-creation-lazy-pull)
		- [Dependency tracking](#dependency-tracking)
		- [Contextual helpers](#contextual-helpers)
			- [`c.equal()`](#cequal)
			- [`c.cleanup()`](#ccleanup)
			- [`c.recover()` , `c.refuse()` , `c.panic()`](#crecover--crefuse--cpanic)
		- [Contextual writes: `c.set()` / `c.post()`](#contextual-writes-cset--cpost)
		- [Async state checks: `c.pending()` / `c.rejected()`](#async-state-checks-cpending--crejected)
		- [Evaluation helpers](#evaluation-helpers)
			- [`stable()`](#stable)
			- [`weak()`](#weak)
			- [`eager()`](#eager)
		- [Error recovery in depth](#error-recovery-in-depth)
			- [Recovery](#recovery)
	- [Async reactivity in depth](#async-reactivity-in-depth)
		- [The three delivery paths](#the-three-delivery-paths)
			- [1. Sync check with `c.pending()`](#1-sync-check-with-cpending)
			- [2. Await with `c.suspend()`](#2-await-with-csuspend)
		- [Deferred dependencies with `c.defer()`](#deferred-dependencies-with-cdefer)
		- [Abort controller with `c.controller()`](#abort-controller-with-ccontroller)
		- [Async transactions with `c.lock()` / `c.unlock()`](#async-transactions-with-clock--cunlock)
		- [Stale activation safety](#stale-activation-safety)
		- [Manual versioning with `c.version()`](#manual-versioning-with-cversion)
	- [Limitations](#limitations)
	- [Benchmarks](#benchmarks)
		- [anod vs alien-signals by Stackblitz (Vue-js internal engine)](#anod-vs-alien-signals-by-stackblitz-vue-js-internal-engine)
		- [anod vs @solidjs/signals (Solid 2.0 beta)](#anod-vs-solidjssignals-solid-20-beta)
		- [anod vs @preact/signals-core](#anod-vs-preactsignals-core)
		- [Chromium (browser)](#chromium-browser)
			- [anod vs alien-signals (Chromium)](#anod-vs-alien-signals-chromium)
			- [anod vs solid (Chromium)](#anod-vs-solid-chromium)
		- [anod with bound-dep optimization vs alien-signals](#anod-with-bound-dep-optimization-vs-alien-signals)
	- [Acknowledgements](#acknowledgements)
	- [Contributing](#contributing)
	- [License](#license)

## Quick example

```ts
import { root, resource } from "anod";

const saveBatch = (todos) => new Promise((r) => setTimeout(() => r(todos), 1000));

const app = root((c) => {
	const todos = resource([]);

	// Add a todo: appears instantly with saved: false, settles when server confirms
	function addTodo(text) {
		todos.set([...todos.get(), { text, saved: false }], async (c, optimistic) => {
			// suspend() guards the await: if a newer set() fires while this
			// request is still in flight, this callback silently stops here -
			// the stale response is discarded, only the latest write settles.
			await c.suspend(saveBatch(optimistic));
			return optimistic.map((t) => ({ ...t, saved: true }));
		});
	}

	// Derived: count of items still saving
	const pending = c.compute(todos, (list) => list.filter((t) => !t.saved).length);

	// Render on every change
	c.effect((c) => {
		const list = c.val(todos);
		const n = c.val(pending);
		const items = list.map((t) => `${t.saved ? "✓" : "⏳"} ${t.text}`).join("  ");
		console.log(items || "(empty)", n > 0 ? `| ${n} saving...` : list.length ? "| all saved" : "");
	});

	// Simulate clicking on addTodo button twice with some delay in between
	addTodo("Build anod");
	setTimeout(() => addTodo("Ship it"), 500);
});
```

## Basic usage

### Overview

The following primitives exist in anod:

* Signal, holds a value and notifies when it changes. `mutable()` creates a signal that always notifies.
* Compute, a derived signal, updates and notifies when its derived value changes
* Effect, a sink that listens to signals and computes and performs actions
* Resource, an async signal for optimistic updates with server confirmation
* Task, an async compute for awaiting promises
* Spawn, an async effect for doing async work
* Root, which owns inner primitives and disposes them on request
* Clock, the root clock on which the system operates and tick time
* Context, a callback parameter that provides the current reactive context

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

#### Signal & Mutable

A signal stores a value and notifies subscribers when changed. You can read it to get its current value, and write to it to update anyone who depends on it.

Signals accept an optional equality function to customize when subscribers are notified: `signal(value, (prev, next) => boolean)` . When provided, the function is called on every write — return `true` to skip notification. Mutable signals are useful for objects that you want to change in place and notify about changes. They notify always, without checking equality.

```ts
import { root, signal, mutable } from "anod";

root((c) => {
	const name = signal("Vilhelm");
	const shape = mutable({ job: "dev", hobby: "fidology" });
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
	 * A mutable signal is convenient when you work with mutable
	 * data structures. It takes a callback where you can make
	 * modifications, and just return the same value.
	 */
	shape.set((s) => {
		s.job = "self-employed";
		return s;
	});
});
```

#### Compute

A compute is a derived signal. It can subscribe to signals or other computes, and updates whenever any of them change.

```ts
import { root, signal, OPT_DEFER } from "anod";
root((c) => {
	const temp = signal(10);
	/**
	 * Computes are eager when created and run immediately.
	 * After they have produced an initial value, they update only if they are read.
	 * Below, it immediately prints to console.
	 */
	const feelsCold = c.compute((c) => {
		console.log("Evaluating weather");
		return c.val(temp) < 0; // Warm weather today
	});

	// Create a compute node, but defer its initial run with the OPT_DEFER.
	const shiver = c.compute(
		(c) => (c.val(feelsCold) ? "Brr" : ""),
		"",
		OPT_DEFER
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

### Async reactivity

anod aims to bridge the gap between sync and async signal reactivity. Each sync primitive has an async counterpart:

| Sync | Async | Role |
| --- | --- | --- |
| Signal | Resource | Writable value |
| Compute | Task | Derived value |
| Effect | Spawn | Side effect |

### Resource

A resource is an async Signal. It supports writing changes through async functions, that later resolve to update it. There are three ways to write to a resource:

```ts
import { root, resource } from "anod";

const save = (val) => new Promise((r) => setTimeout(() => r(val), 50));

root((c) => {
	const name = resource("alice");

	// Plain set - identical to signal, no async work
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
		console.log(val, name.loading ? "(loading)" : "");
	});
});
```

The async callback receives the resource as `c` (with `suspend` for staleness protection) and the current/optimistic value. If the callback returns a sync value, it settles immediately with no loading state. If it returns a promise, `.loading` becomes true until it resolves.

When a new `set()` fires while a previous async callback is still in flight, the old promise still resolves normally, but `suspend()` detects that the resource has moved on and simply doesn't yield back into the callback. The continuation after `await` never runs, so the stale result never reaches the `return` . Only the latest activation's callback gets to settle the resource.

### Task

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

### Spawn

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

### `c.suspend()`

`c.suspend()` is the easiest way to handle async staleness in anod. It guards the `await` boundary: if the node has been re-run or disposed since the suspend was issued, the continuation silently stops. This prevents stale async results from writing to state that has moved on.

However, `c.suspend()` is not the only way. For cases where you need more control — like attaching sequence numbers to requests for server-side ordering, you can use `c.version()` and manage staleness yourself (see [Manual versioning](#manual-versioning-with-cversion) below).

```ts
import { root, signal } from "anod";

function sideEffect(source, data) {
	console.log(`Side effect from ${source} with data ${data}`);
}

let time = 0;

function load(url) {
	// Simulate network call
	return new Promise((resolve) => setTimeout(() => resolve(time++), 200));
}

root((c) => {
	const url = signal("vilhelm.se");
	c.spawn(async (c) => {
		// Here we load a raw promise
		const data = await load(c.val(url));
		/**
		 * This is going to log twice, first upon creation,
		 * and then again after the value updates. There is nothing
		 * blocking re-entry after the promise resolves.
		 */
		sideEffect("raw promise", data);
	});

	c.spawn(async (c) => {
		/**
		 * Here, by guarding the load inside a suspend,
		 * when setting the url value the first spawn is disposed and never yields.
		 * This only runs the sideEffect once.
		 */
		const data = await c.suspend(load(c.val(url)));
		sideEffect("suspended promise", data);
	});

	/**
	 * This will invalidate the spawn and trigger it to re-run
	 * But we cannot stop the existing promise that is still mid-flight
	 * This causes a leak, where both promises resolve, despite the first one
	 * being disposed.
	 */
	url.set("github.com");
});
```

### Error handling

#### c.recover(), REFUSE, PANIC, FATAL

All errors in anod are `{ error, type }` objects with three type constants: `REFUSE` , `PANIC` , and `FATAL` . This lets you cleanly separate expected errors from unexpected crashes.

* **`c.refuse(val)`** — non-throwing expected error for computes. Usage: `return c.refuse("invalid")`.
* **`c.panic(val)`** — throwing expected error for computes and effects. Aborts the current run.
* **`FATAL`** — any unexpected throw is automatically wrapped as `{ error: thrownValue, type: FATAL }`.

Effects and spawns support `c.recover()` to intercept errors. The handler receives the `{ error, type }` object and can branch on the type. Return `true` to swallow, `false` to propagate.

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
		c.lock(); // Acquire transactional lock to block incoming updates until we commit
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
* Errors inside finalizers are swallowed, matching JS `finally` semantics
* `finalize` does not bubble to parent effects, it's scoped to the activation it was registered in
* On re-run, any leftover finalize from the previous activation is cleared before the new run starts
* This differs from `cleanup`, which runs in reverse order (stack unwinding). Finalize is sequential post-completion work, not resource teardown

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

#### `c.recover()` , `c.refuse()` , `c.panic()`

See dedicated error lifecycle section.

### Contextual writes: `c.set()` / `c.post()`

Inside a compute or effect callback, `c.set(signal, value)` writes to a signal while preventing the current node from re-triggering itself. This enables the interceptor pattern — a node that reads a signal and writes back to the same signal without causing an infinite loop.

```ts
import { root, signal } from "anod";
root((c) => {
	const count = signal(0);
	c.effect(count, (val, c) => {
		// Write back to count without re-triggering this effect
		c.set(count, val + 1);
	});
	// Effect ran once, count is now 1
	count.set(10); // Effect runs again, count becomes 11
});
```

`c.post(signal, value)` is the deferred variant — schedules the write for the next microtask flush, with the same self-notification guard.

Both `c.set()` and `c.post()` also support writing to resources with an async callback: `c.set(resource, value, asyncFn)` .

### Async state checks: `c.pending()` / `c.rejected()`

`c.pending(sender)` subscribes to a sender and returns `true` if it has `FLAG_LOADING` set. Works with tasks, resources, or any sender. Accepts an array of senders — returns `true` if any is loading.

`c.rejected(sender)` subscribes to a sender and safely returns its error value if `FLAG_ERROR` is set, or `null` otherwise. Unlike `c.val()` , it does not throw on error — this is the safe way to check error state reactively.

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

Anod allows you to modify the behaviour of nodes in different ways. These methods can be called on the context itself, but typically, it makes more sense to set it outside, once, upon creation.

#### `stable()`

Marks the current node as stable, and freezes the dependencies in place. This is useful if you have a compute/effect that subscribe to a long array of signals, but the signals never change. By marking the node stable(), you can skip the overhead of the reconcile machinery that handles dynamic cases.

```ts
import { root, signal } from "anod";
root((c) => {
	const signals = [];
	for (let i = 0; i < 100; i++) {
		signals[i] = signal(i);
	}
	const formatted = c.compute((c) => {
		return signals.map((i) => `Item: ${c.val(i)}`);
	});
	/**
	 * We know this node only reads the same dependencies
	 * It always reads the same 100 signals every time
	 * mark it stable and avoid subscription overhead
	 */
	formatted.stable();

	const first = signal(false);
	const second = signal(2);
	const wrong = c.compute((c) => {
		if (c.val(first)) {
			return c.val(second);
		}
	});
	wrong.stable();

	/**
	 * Since we marked the node stable,
	 * it doesn't automatically track any new
	 * dependencies on update. Even though we
	 * read through c.val(), because we marked the
	 * node stable, it doesn't listen to changes from second.
	 */
	first.set(true);
});
```

#### `weak()`

A weak compute releases its cached value and runs its cleanups when it loses all subscribers. The next read triggers a fresh recompute. This is useful for derived data that retains significant memory — parsed documents, decoded images, materialized query results — that can be safely dropped and recomputed on demand.

```ts
import { root, signal } from "anod";
root((c) => {
	const path = signal("/data/large-dataset.csv");
	const parsed = c.compute((c) => {
		const raw = readFileSync(c.val(path));
		const rows = parseCSV(raw); // large allocation
		c.cleanup(() => {
			console.log("released parsed data");
		});
		return rows;
	});
	parsed.weak();

	const view = c.effect(parsed, (rows) => render(rows));
	// parsed holds the full row array in memory

	view.dispose();
	// "released parsed data" — weak compute drops its value and runs cleanup
	// parsed is now dormant, no memory retained

	parsed.get(); // re-parses the file on demand
});
```

#### `eager()`

Converts a compute from pull-based to push-based. An eager compute re-evaluates immediately when notified, rather than waiting to be pulled. Use sparingly: this removes the laziness optimization but guarantees the value is always fresh.

### Error recovery in depth

anod provides a structured error model where every error is a `{ error, type }` object. The `type` field distinguishes three categories:

| Constant | Value | Meaning                      | How it's created       |
| -------- | ----- | ---------------------------- | ---------------------- |
| `REFUSE` | 1     | Expected error, non-throwing | `return c.refuse(val)` |
| `PANIC` | 2     | Expected error, throwing     | `c.panic(val)` |
| `FATAL` | 3     | Unexpected crash             | Any uncaught `throw` |

**`c.refuse(val)`** is available on computes only. It sets the compute into an error state without throwing — the caller returns the error value. This is useful for validation: the compute can't produce a valid result, but it's not a crash.

**`c.panic(val)`** is available on computes and effects. It throws, aborting the current run, but anod marks it as an expected error so recover handlers can distinguish it from crashes.

**`FATAL`** is what you get when something throws unexpectedly — a null dereference, a network error, a bug. anod wraps the thrown value as `{ error: thrownValue, type: FATAL }` .

#### Recovery

`c.recover()` intercepts errors before they dispose the node. The handler receives the `{ error, type }` object and returns `true` to swallow or `false` to propagate. When multiple handlers are registered, they run forward in registration order — the first handler that returns `true` wins. Recovery follows the ownership chain — if a child doesn't handle it, it bubbles to the parent. A root's `recover()` is the last line of defense.

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

	// Compute uses refuse() for validation — no throw, no crash
	const price = signal(100);
	const discount = c.compute(price, (val, c) => {
		if (val <= 0) {
			return c.refuse("Price must be positive");
		}
		return val * 0.9;
	});

	// Spawn uses panic() when data is stale — throws, but expected
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

anod provides three ways to consume async values, each suited to a different use case.

### The three delivery paths

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

`c.suspend()` is the primary async delivery mechanism. It accepts a promise, a task, or an array of tasks.

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

**Task**: if the task is already settled, returns the value synchronously. If the task is loading, creates a two-way channel binding: the spawn suspends until the task settles, then resumes with the value.

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

**Array of tasks**: awaits multiple tasks concurrently. Returns when all tasks have settled.

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

**Callback**: old-school callbacks.

`c.suspend(setupFn)` accepts a setup function that receives `resolve` and `reject` callbacks. This avoids promise allocation entirely and enables natural integration with callback-based APIs like WebSockets, event emitters, and timers. The node enters a loading state and settles when `resolve` or `reject` is called.

The callbacks are guarded with the same staleness protection as promises: if the node is disposed or re-run before `resolve` fires, the call is silently ignored.

```ts
import { root, signal, OPT_DEFER } from "anod";
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
				 * outgoing messages. OPT_DEFER skips the initial run,
				 * so it only fires when outgoing actually changes.
				 * Because anod passes context explicitly, you can freely
				 * create owned effects beyond the async boundary.
				 */
				c.effect(outgoing, (msg) => ws.send(msg), OPT_DEFER);
				resolve();
			});
			ws.addEventListener("error", reject);
		});
	});

	c.effect(incoming, (msg) => console.log("received:", msg));
	outgoing.set("hello server");
});
```

Note the spawn body is sync — no `async` keyword, no promise allocation. The setup function controls when the node settles. If `url` changes, the spawn re-runs: `cleanup` closes the old websocket, the child effect is disposed, and the old `resolve` becomes stale and is silently ignored.

You can only call `c.suspend()` with a setup function once per activation. Calling it again throws an error. This prevents ambiguous double-settlement.

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

### Async transactions with `c.lock()` / `c.unlock()`

By default, when a task or spawn's dependencies change during async work, the node is re-run: the old activation is abandoned and a new one starts. Sometimes this is wrong. If you are iterating over an array and saving each element to a database, you need the entire iteration to finish before processing the next update.

`c.lock()` prevents the node from re-running until the current activation completes (or `c.unlock()` is called). The node is still marked stale by its dependencies, but the re-run is deferred until the lock releases. On completion, if the node was marked stale during the lock, it automatically re-runs with the fresh values, or disposes if its parent flagged it for disposal.

```ts
import { root, signal } from "anod";
const saveToDb = (item) =>
	new Promise((r) =>
		setTimeout(() => {
			console.log("saved:", item);
			r();
		}, 10)
	);

root((c) => {
	const todoList = signal(["buy milk", "write docs"]);
	c.spawn(async (c) => {
		const items = c.val(todoList);
		c.lock();
		for (const item of items) {
			await c.suspend(saveToDb(item));
		}
		// Lock releases implicitly when the spawn completes.
		// If todoList changed during the loop, the spawn
		// re-runs now with the updated list.
		console.log("batch complete");
	});
	// This update is deferred until the current batch finishes
	todoList.set(["deploy", "celebrate"]);
});
```

### Stale activation safety

Every call to `c.suspend()` captures the current activation timestamp. When the promise resolves, anod checks whether the node has been re-run or disposed since the suspend was issued. If it has, the resolution is silently discarded. This guarantees that stale async results never pollute the current activation, even across complex chains of awaits.

This applies to both resolve and reject: if a promise rejects after the node was invalidated, the error is also discarded. You are never notified about errors from stale activations.

Instead, you must rely on the builtin lifecycle helpers. If you await a promise, and create some state that needs cleaning up, use c.cleanup(). If you must run the async function to completion, run c.lock(). The idea about anod's async correctness guarantee is that we do not want promises firing all over the place, writing state in an unpredictable way. The sync reactive graph is always consistent. When you write a value, every reader is guaranteed to see a consistent state of that signal. This idea extends to async, but with a different guarantee: every async primitive is guaranteed a consistent snapshot in time, but there is no guarantee exactly which time that is. This means: if you await and suspend 10 tasks, we will block until all 10 tasks have settled at some point in time, and all produce a valid value.

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

I have gone back and forth between global listeners, and a dedicated context object. After some turns, I finally settled on context over globals. The reason is that there is no way to truly support the async reactive graph without persisting the context beyond async boundaries. The awkward trade-off is that the `c` variable has to be passed as an argument through the system, and that it's a real footgun if you use the wrong context. Likely, this can be alleviated by an ESLint rule, or in the future, some stronger compile-time guarantee that protects you against shooting yourself in the foot.

Alternatively, library authors can extend anod and expose the global listener as the default, sync mode, and only provide it when truly needed in the async callback.

anod has chosen to drop the O(1) two-way slot binding that S.js uses. This rests on an assumption: most graphs dispose consistently. Everything is wrapped inside an Effect or Root node. When it disposes, everything inside disposes. Therefore, anod doesn't unlink the `_subs` array inside a Signal immediately when an Effect disposes, or when its dropped as a dep from a dynamic receiver. Instead, it implements a *tombstones* garbage collection concept, where it leaves disposed receivers until some certain threshold where it sweeps and compacts its subs array. The upside of this approach is faster performance and lower overall memory allocation, as the length of the `_subs` and `_deps` arrays are halved. The downside is degradation in the `notify()` path on highly dynamic graphs (where Computes/Effects constantly branch different Senders on every update), and slightly more retained memory during updates. Right now, anod uses a constant factor, but might expose a GC Sweep configuration that the end user can tweak to their needs. 

## Benchmarks

The benchmarks used here are copied from [Milo M's](https://github.com/milomg) repository [JS Reactivity Benchmark](https://github.com/milomg/js-reactivity-benchmark), with some inspiration from [Cause Effect](https://github.com/zeixcom/cause-effect) by Zeix, who modified them to use [mitata](https://github.com/evanwashere/mitata).

Running fair benchmarks against other frameworks is no easy task. Therefore, I want to preface these benchmarks with a disclaimer: performance of a UI library will be completely different depending on which runtime environment it runs in. I have ran these benchmarks both on Node, Bun, and in different browser environments (Chrome, Safari, Firefox, Linux, Mac, Windows). Each environment has its own quirks, and frameworks perform differently depending on which environment they run in. The JS Reactivity Benchmark run all frameworks at the same time. This can introduce noise and garbage collection, where one framework affects another. anod took the tedious and maybe not so clean approach to just copy every benchmark file, and spend some evenings going through them together with AI to make sure there are no inconsistencies in any way that would favour one framework over the other.

### anod vs [alien-signals](https://github.com/stackblitz/alien-signals) by Stackblitz (Vue-js internal engine)

Compared using the unbound API ( `c.compute(fn)` , `c.effect(fn)` ) which is the equivalent of alien-signals' `computed(fn)` , `effect(fn)` . Both use dynamic dependency tracking with full reconciliation — no bound-dep fast paths.

| Benchmark | alien | anod | Δ time | alien | anod | Δ heap ⚠️ |
| :-- | --: | --: | --: | --: | --: | --: |
| | **Time** | **Time** | | **Heap** | **Heap** | |
| **Kairo** | | | | | | |
| Deep propagation | 991 ns | 923 ns | -7% | 17 B | 18 B | +6% |
| Broad propagation | 2, 951 ns | 2, 698 ns | -9% | 800 B | 800 B | 0% |
| Diamond | 169 ns | 184 ns | +9% | 73 B | 113 B | +55% |
| Triangle | 299 ns | 311 ns | +4% | 393 B | 113 B | -71% |
| Mux | 4, 787 ns | 3, 465 ns | -28% | 1.0 kB | 961 B | -4% |
| Unstable | 390 ns | 195 ns | -50% | 256 B | 17 B | -93% |
| Avoidable | 66 ns | 60 ns | -9% | 1 B | 1 B | 0% |
| Repeated observers | 196 ns | 115 ns | -41% | 17 B | 17 B | 0% |
| **CellX** | | | | | | |
| 10 layers | 2, 983 ns | 3, 347 ns | +12% | 3.0 kB | 1.3 kB | -56% |
| **$mol_wire** | 30.9 µs | 31.5 µs | +2% | 1.7 kB | 869 B | -49% |
| **Creation** | | | | | | |
| 1k signals | 10.9 µs | 8.6 µs | -21% | 10.2 kB | 2.6 kB | -75% |
| 1k computations | 43.5 µs | 53.6 µs | +23% | 529 kB | 472 kB | -11% |
| **Dynamic graph** | | | | | | |
| Build: simple | 2.4 µs | 2.6 µs | +8% | 4.7 kB | 2.8 kB | -40% |
| Build: large web app | 996 µs | 1, 166 µs | +17% | 7.4 MB | 7.2 MB | -3% |
| Build: wide dense | 1, 442 µs | 1, 380 µs | -4% | 10.2 MB | 5.5 MB | -46% |
| Update: simple | 230 ns | 218 ns | -5% | 329 B | 33 B | -90% |
| Update: dynamic | 6.2 µs | 6.3 µs | +2% | 4.1 kB | 733 B | -82% |
| Update: large web app | 23.0 µs | 17.4 µs | -24% | 8.7 kB | 1.3 kB | -85% |
| Update: wide dense | 80.4 µs | 50.7 µs | -37% | 23.4 kB | 2.5 kB | -89% |
| Update: deep | 115 µs | 134 µs | +17% | 159 kB | 39.9 kB | -75% |
| Update: very dynamic | 57.7 µs | 53.3 µs | -8% | 40.1 kB | 4.4 kB | -89% |

Negative Δ = anod is faster / uses less. Benchmarks ran on Intel i7-14700, Node v25.9.0, Linux 6.19.13.

In general, anod performs better than alien-signals on wide graphs (Signal -> Many Receivers), whereas alien-signals outperforms anod on deep graphs (Signal -> Compute -> Compute .... -> Effect). The key architectural difference is how dependency links are stored. alien-signals uses a doubly-linked list of Link nodes. Every dependency relationship allocates a Link object. anod stores deps and subs in flat arrays, with the first dep/sub inlined directly on the node.

This means anod's `notify()` iterates sequential memory when walking subscribers, which is cache-line friendly and scales well on wide fan-out (mux -27%, repeated observers -42%). alien's propagation walks `link.nextSub` pointers, which is pointer chasing and incurs more cache misses as graphs widen.

On deep chains, alien's `checkDirty()` is a stack-based walk that descends through dep links and can skip entire unchanged subtrees with minimal overhead per hop. anod's `needsUpdate()` does similar work but the array-based dep storage involves more index arithmetic per step, which adds up across long chains.

⚠️ The memory benchmarks here must be taken with a grain of salt. The 1k signals, which just creates 1000 signals, adds them to an array and returns, reports ~10kb for alien, 2.6kb for anod. I've experimented with this a lot, and my theory is possibly V8 reuses allocations from existing registry. So even though in theory, since a Signal has 6 fields, making it about 36 byte, the benchmark should show 36kb, but instead shows 2.55 kb. The weird thing is, if I add a 7th field to the Signal class, the memory spikes, from 2.55 to 11kb. My theory is this might have to do something with how V8 allocate structs into capacity categories. Going from field 6 -> 7 bumps the class from one size class to the next, which makes each region of memory allocate more space. I'm not 100% this is how it works, but benchmarks with mitata consistently shows this, so the Signal class is deliberately frozen at 6 fields in anod to maintain this memory profile.

### anod vs [@solidjs/signals](https://github.com/solidjs/solid) (Solid 2.0 beta)

Both use deferred writes: anod uses `.post()` + `flush()` , Solid uses `setSignal()` + `flush()` . Both run inside owned roots. Solid's unstable and molWire counters differ slightly (4 vs 3 and 14 vs 13) due to dynamic dep handling differences.

| Benchmark | solid | anod | Δ time | solid | anod | Δ heap |
| :-- | --: | --: | --: | --: | --: | --: |
| | **Time** | **Time** | | **Heap** | **Heap** | |
| **Kairo** | | | | | | |
| Deep propagation | 6, 016 ns | 936 ns | -84% | 7.7 kB | 21 B | -100% |
| Broad propagation | 18.7 µs | 2, 717 ns | -85% | 10.3 kB | 800 B | -92% |
| Diamond | 1, 258 ns | 201 ns | -84% | 1.3 kB | 113 B | -91% |
| Triangle | 1, 790 ns | 345 ns | -81% | 1.8 kB | 114 B | -94% |
| Mux | 13.5 µs | 3, 485 ns | -74% | 8.2 kB | 961 B | -88% |
| Unstable | 1, 698 ns | 212 ns | -88% | 1.1 kB | 18 B | -98% |
| Avoidable | 449 ns | 69 ns | -85% | 425 B | 1 B | -100% |
| Repeated observers | 1, 029 ns | 124 ns | -88% | 672 B | 17 B | -97% |
| **CellX** | | | | | | |
| 10 layers | 18.4 µs | 3, 349 ns | -82% | 6.8 kB | 1.3 kB | -81% |
| **$mol_wire** | 40.1 µs | 31.4 µs | -22% | 3.9 kB | 756 B | -81% |
| **Creation** | | | | | | |
| 1k signals | 46.8 µs | 8, 151 ns | -83% | 90.4 kB | 2.6 kB | -97% |
| 1k computations | 776 µs | 282 µs | -64% | 2.1 MB | 542 kB | -74% |
| **Dynamic graph** | | | | | | |
| Build: simple | 17.3 µs | 10.5 µs | -39% | 27.3 kB | 18.0 kB | -34% |
| Build: large web app | 5, 888 µs | 4, 235 µs | -28% | 12.9 MB | 6.9 MB | -47% |
| Build: wide dense | 5, 490 µs | 3, 594 µs | -35% | 10.9 MB | 5.4 MB | -50% |
| Update: simple | 2, 470 ns | 262 ns | -89% | 1.9 kB | 33 B | -98% |
| Update: dynamic | 23.9 µs | 6, 586 ns | -72% | 13.4 kB | 719 B | -95% |
| Update: large web app | 64.7 µs | 19.7 µs | -70% | 13.9 kB | 1.7 kB | -88% |
| Update: wide dense | 184 µs | 52.9 µs | -71% | 53.7 kB | 1.9 kB | -96% |
| Update: deep | 490 µs | 146 µs | -70% | 407 kB | 39.9 kB | -90% |
| Update: very dynamic | 155 µs | 59.3 µs | -62% | 96.6 kB | 20.4 kB | -79% |

Negative Δ = anod is faster / uses less. Benchmarks ran on Intel i7-14700, Node v25.9.0, Linux 6.19.13.

Earlier, I think (?) solid was largely built upon [S.js](https://github.com/adamhaile/S), like anod. The libraries have since diverged, where solid has adopted the linked list approach used by alien-signals. anod has instead refined the array-based approach from S.

### anod vs [@preact/signals-core](https://github.com/preactjs/signals)

| Benchmark | preact | anod | Δ time | preact | anod | Δ heap |
| :-- | --: | --: | --: | --: | --: | --: |
| | **Time** | **Time** | | **Heap** | **Heap** | |
| **Kairo** | | | | | | |
| Deep propagation | 1, 439 ns | 923 ns | -36% | 148 B | 18 B | -88% |
| Broad propagation | 3, 844 ns | 2, 698 ns | -30% | 928 B | 800 B | -14% |
| Diamond | 232 ns | 184 ns | -21% | 201 B | 113 B | -44% |
| Triangle | 430 ns | 311 ns | -28% | 202 B | 113 B | -44% |
| Mux | 4, 355 ns | 3, 465 ns | -20% | 1.0 kB | 961 B | -4% |
| Unstable | 300 ns | 195 ns | -35% | 234 B | 17 B | -93% |
| Avoidable | 78 ns | 60 ns | -23% | 128 B | 1 B | -99% |
| Repeated observers | 128 ns | 115 ns | -10% | 144 B | 17 B | -88% |
| **CellX** | | | | | | |
| 10 layers | 4, 182 ns | 3, 347 ns | -20% | 1.9 kB | 1.3 kB | -29% |
| **$mol_wire** | 31.0 µs | 31.5 µs | +2% | 1.5 kB | 869 B | -42% |
| **Creation** | | | | | | |
| 1k signals | 10.1 µs | 8.6 µs | -15% | 2.2 kB | 2.6 kB | +18% |
| 1k computations | 78.0 µs | 53.6 µs | -31% | 602 kB | 472 kB | -22% |
| **Dynamic graph** | | | | | | |
| Build: simple | 2.9 µs | 2.6 µs | -10% | 4.9 kB | 2.8 kB | -43% |
| Build: large web app | 1, 199 µs | 1, 166 µs | -3% | 7.7 MB | 7.2 MB | -6% |
| Build: wide dense | 1, 502 µs | 1, 380 µs | -8% | 10.9 MB | 5.5 MB | -50% |
| Update: simple | 375 ns | 218 ns | -42% | 161 B | 33 B | -80% |
| Update: dynamic | 8.4 µs | 6.3 µs | -25% | 813 B | 733 B | -10% |
| Update: large web app | 298 µs | 17.4 µs | -94% | 18.4 kB | 1.3 kB | -93% |
| Update: wide dense | 426 µs | 50.7 µs | -88% | 16.6 kB | 2.5 kB | -85% |
| Update: deep | 140 µs | 134 µs | -4% | 40.1 kB | 39.9 kB | 0% |
| Update: very dynamic | 88.6 µs | 53.3 µs | -40% | 20.1 kB | 4.4 kB | -78% |

preact-signals perform well on tight graphs, and decent on deep graphs, but struggle on wide graphs.

### Chromium (browser)

Same benchmarks run in Chromium with `--disable-hang-monitor` . No memory counters available in the browser. Some creation/deep benchmarks show high variance.

#### anod vs alien-signals (Chromium)

| Benchmark | alien | anod | Δ |
| :-- | --: | --: | --: |
| **Kairo** | | | |
| Deep propagation | 1, 015 ns | 974 ns | -4% |
| Broad propagation | 2, 936 ns | 2, 899 ns | -1% |
| Diamond | 174 ns | 205 ns | +18% |
| Triangle | 296 ns | 341 ns | +15% |
| Mux | 3, 657 ns | 3, 525 ns | -4% |
| Unstable | 381 ns | 197 ns | -48% |
| Avoidable | 89 ns | 67 ns | -25% |
| Repeated observers | 205 ns | 117 ns | -43% |
| **CellX** | | | |
| 10 layers | 2, 984 ns | 3, 452 ns | +16% |
| **$mol_wire** | 28.7 µs | 28.8 µs | 0% |
| **Creation** | | | |
| 1k signals | 5, 972 ns | 4, 185 ns | -30% |
| 1k computations* | 135 µs | 43 µs | -68% |
| **Dynamic graph** | | | |
| Build: simple | 6.2 µs | 2.5 µs | -60% |
| Build: large web app* | 2, 336 µs | 1, 148 µs | -51% |
| Build: wide dense* | 2, 885 µs | 1, 492 µs | -48% |
| Update: simple | 235 ns | 224 ns | -5% |
| Update: dynamic | 6, 130 ns | 6, 288 ns | +3% |
| Update: large web app | 22.6 µs | 18.7 µs | -17% |
| Update: wide dense | 72.4 µs | 51.1 µs | -29% |
| Update: deep* | 110 µs | 135 µs | +23% |
| Update: very dynamic | 54.8 µs | 54.0 µs | -1% |

\* High variance

#### anod vs solid (Chromium)

Both use deferred writes ( `post()` + `flush()` / `setSignal()` + `flush()` ).

| Benchmark | solid | anod | Δ |
| :-- | --: | --: | --: |
| **Kairo** | | | |
| Deep propagation* | 6, 393 ns | 948 ns | -85% |
| Broad propagation | 19.0 µs | 2, 799 ns | -85% |
| Diamond | 1, 623 ns | 211 ns | -87% |
| Triangle | 2, 113 ns | 333 ns | -84% |
| Mux* | 13.1 µs | 3, 473 ns | -74% |
| Unstable | 1, 805 ns | 212 ns | -88% |
| Avoidable | 738 ns | 75 ns | -90% |
| Repeated observers | 1, 283 ns | 121 ns | -91% |
| **CellX** | | | |
| 10 layers | 17.9 µs | 3, 390 ns | -81% |
| **$mol_wire** | 37.5 µs | 28.2 µs | -25% |
| **Creation** | | | |
| 1k signals | 23.5 µs | 4, 057 ns | -83% |
| 1k computations* | 496 µs | 198 µs | -60% |
| **Dynamic graph** | | | |
| Build: simple | 13.5 µs | 7.9 µs | -41% |
| Build: large web app* | 4, 634 µs | 3, 946 µs | -15% |
| Build: wide dense* | 4, 594 µs | 3, 984 µs | -13% |
| Update: simple | 2, 676 ns | 314 ns | -88% |
| Update: dynamic | 23.4 µs | 8.7 µs | -63% |
| Update: large web app | 58.4 µs | 25.5 µs | -56% |
| Update: wide dense* | 170 µs | 58.4 µs | -66% |
| Update: deep* | 447 µs | 286 µs | -36% |
| Update: very dynamic* | 148 µs | 82.8 µs | -44% |

\* High variance

These benchmarks are mostly here to supplement the general findings, which they confirm. alien performs well on deep graphs, anod on wide graphs. This is expected from the internal architecture of both libraries. Solid is an established, feature rich library. anod is a small reactive core. So they are not fully comparable. One of the reasons behind building anod was to offer a fast, feature-complete async native signals implementation that matches what solid has. The position for anod is not to write yet another javascript library to compete with Solid, but to offer a strong reactive core for those who don't need the entire framework.

### anod with bound-dep optimization vs alien-signals

The benchmarks above use the unbound API for fair comparison. But anod also supports a bound single-dep signature `compute(dep, fn)` that skips all dependency tracking and reconciliation. This is not an apples-to-apples comparison, alien-signals has no equivalent fast path, but it shows anod's maximum throughput when the graph structure is known at creation time. alien-signals has been chosen here as baseline, because based on my own measurement, it seems to be the fastest signal implementation out there to date.

| Benchmark | alien | anod (bound) | Δ time | alien | anod (bound) | Δ heap |
| :-- | --: | --: | --: | --: | --: | --: |
| | **Time** | **Time** | | **Heap** | **Heap** | |
| **Kairo** | | | | | | |
| Deep propagation | 991 ns | 624 ns | -37% | 17 B | 18 B | +6% |
| Broad propagation | 2, 951 ns | 1, 813 ns | -39% | 800 B | 800 B | 0% |
| Diamond | 169 ns | 137 ns | -19% | 73 B | 113 B | +55% |
| Triangle | 299 ns | 218 ns | -27% | 393 B | 113 B | -71% |
| Mux | 4, 787 ns | 2, 815 ns | -41% | 1.0 kB | 961 B | -4% |
| Unstable | 390 ns | 164 ns | -58% | 256 B | 17 B | -93% |
| Avoidable | 66 ns | 48 ns | -27% | 1 B | 0 B | — |
| Repeated observers | 196 ns | 43 ns | -78% | 17 B | 16 B | -6% |
| **CellX** | | | | | | |
| 10 layers | 2, 983 ns | 2, 529 ns | -15% | 3.0 kB | 1.3 kB | -57% |
| **$mol_wire** | 30.9 µs | 30.2 µs | -2% | 1.7 kB | 868 B | -49% |
| **Creation** | | | | | | |
| 1k signals | 10.9 µs | 7.8 µs | -28% | 10.2 kB | 2.6 kB | -75% |
| 1k computations | 43.5 µs | 44.3 µs | +2% | 529 kB | 431 kB | -19% |
| **Dynamic graph** | | | | | | |
| Build: simple | 2.4 µs | 2.5 µs | +4% | 4.7 kB | 2.7 kB | -43% |
| Build: large web app | 996 µs | 1, 073 µs | +8% | 7.4 MB | 7.2 MB | -3% |
| Build: wide dense | 1, 442 µs | 1, 326 µs | -8% | 10.2 MB | 5.5 MB | -46% |
| Update: simple | 230 ns | 221 ns | -4% | 329 B | 33 B | -90% |
| Update: dynamic | 6.2 µs | 6.1 µs | -2% | 4.1 kB | 738 B | -82% |
| Update: large web app | 23.0 µs | 17.5 µs | -24% | 8.7 kB | 1.3 kB | -85% |
| Update: wide dense | 80.4 µs | 48.6 µs | -40% | 23.4 kB | 2.5 kB | -89% |
| Update: deep | 115 µs | 135 µs | +17% | 159 kB | 39.9 kB | -75% |
| Update: very dynamic | 57.7 µs | 53.0 µs | -8% | 40.1 kB | 4.4 kB | -89% |

The single dep is pretty much useless in contexts where you cannot control the input. You'd have to build a dedicated layer on top of anod that exposes that overload to the end user. But, consider a typical web app. Almost every reactive binding with signals is sender -> dom.

## Acknowledgements

I got the idea to build anod once I stumbled upon [S.js by Adam Haile](https://github.com/adamhaile/S). It has been around for a long time, and I think it has been heavily influential to the modern reactive signals space. For years I wanted to extend it, but it took almost 7 years until I finally took the time to fully implement my idea.

Then, I want to shout out to [ivi](https://github.com/localvoid/ivi), by Boris Kaul. The whole idea of the context in anod originates from ivi's elegant `component(c => {})` signature, that implements a two-phase state registration. Also, I think his library deserves more attention; it's an exceptionally well-built UI library.

## Contributing

Pull requests that are not preceded by a discussion will be closed. If you'd like to contribute a feature, bug fix, or improvement, please open a thread in the [Discussions](https://github.com/visj/anod/discussions) tab first. This ensures we align on the design before any implementation work begins.

Bug reports and questions are always welcome via [Issues](https://github.com/visj/anod/issues).

## License

MIT
