<!-- omit in toc -->
# anod

anod is a reactive state management library. It has built-in support for both sync and async graphs. It's similar to many other signal libraries, but its architecture differs in several meaningful ways:

* No global/automatic dependency tracking, provides a context object to every callback
* Uses a hybrid push/pull model, where nodes can both eagerly and lazily send updates
* Async is built into the core, and is a first-hand member
<!-- omit in toc -->
## Table of contents

- [Quick example](#quick-example)
- [Basic usage](#basic-usage)
	- [Sync reactivity](#sync-reactivity)
		- [Root](#root)
		- [Global `c` context](#global-c-context)
		- [Signal](#signal)
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
- [Bundling](#bundling)
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
	- [Async transactions with `c.lock()` / `c.unlock()`](#async-transactions-with-clock--cunlock)
	- [Stale activation safety](#stale-activation-safety)
	- [Manual versioning with `c.version()`](#manual-versioning-with-cversion)
- [Limitations](#limitations)
- [Benchmarks](#benchmarks)
	- [anod vs alien-signals by Stackblitz (Vue-js internal engine)](#anod-vs-alien-signals-by-stackblitz-vue-js-internal-engine)
	- [anod vs @solidjs/signals (Solid 2.0 beta)](#anod-vs-solidjssignals-solid-20-beta)
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

The following primitives exist in anod:

* Signal, holds a value and notifies when it changes. `signal(value, false)` creates a signal that always notifies.
* Compute, a derived signal, updates and notifies when its derived value changes
* Effect, a sink that listens to signals and computes and performs actions
* Resource, an async signal for optimistic updates with server confirmation
* Task, an async compute for awaiting promises
* Spawn, an async effect for doing async work
* Root, which owns inner primitives and disposes them on request
* Clock, the root clock on which the system operates and tick time
* Context, a callback parameter that provides the current reactive context

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

#### Resource

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

## Bundling

anod supports two JavaScript type systems: Typescript and Google's Closure Compiler. For those wondering why the source code is written in plain JavaScript: Closure Compiler had some experimental support for Typescript in the past, but it has since been discontinued. Closure operates on JSDoc style type safety. To my knowledge, no bundler except Closure Compiler can confidently tree-shake prototype based method dispatch. Since anod uses a context object, which internally is Compute/Effect node, it's impossible to tree-shake anod with normal bundlers.

anod is fully typed for Closure Compiler, meaning, it's safe to use with ADVANCED OPTIMIZATIONS. On npm, the package exposes the raw source code. Import those files directly and it will work out of the box.

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
	// Since compute has no subscribers, it nulls out its value and calls
	// the cleanup hook. It stays idle until someone reads it again

	parsed.get(); // re-parses the file on demand
});
```

#### `eager()`

Converts a compute from pull-based to push-based. An eager compute re-evaluates immediately when notified, rather than waiting to be pulled. Use sparingly: this removes the laziness optimization but guarantees the value is always fresh.

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

**`c.panic(val)`** is available on computes and effects. It throws, aborting the current run, but anod marks it as an expected error so recover handlers can distinguish it from crashes. anod uses it too: when a task or resource is disposed while a node waits on it, the waiter is rejected with a `PANIC` (see [Stale activation safety](#stale-activation-safety)).

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

#### 3. Callback (resolve, reject)

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

#### 4. Task callbacks with `c.suspend(task, onResolve, onReject)`

`c.suspend(task, onResolve, onReject)` reads a task, or an array of tasks, through callbacks instead of `await`. It works like `.then(onResolve, onReject)`, without the promise:

* **Settled task**: `onResolve(value)` is called right away, before `c.suspend()` returns. There is no microtask: the value is there, so you get it. Reads inside the callback are tracked like any other read in the run.
* **Loading task**: the callbacks are stored on the task, and the node is loading until one of them runs. When the task settles, the callback runs synchronously, in the same tick, after everything that depends on the task has been marked stale. So a read inside the callback sees the graph as it is after the settle.
* **Tasks settle with the result**: in a task, what the callback returns becomes the task's value, and what it throws becomes its error. In a spawn, the return value is ignored.
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
	const greeting = c.task((c) => {
		c.suspend(user, (u) => "Hello, " + u.name, () => "Hello, guest");
	});

	/** A sync spawn: no async keyword, no promise, no microtask. */
	c.spawn((c) => {
		c.suspend([user, greeting], ([u, text]) => {
			console.log(u.id, text);
		});
	});
});
```

Whether the callback runs now or later depends on whether the task has settled, so don't rely on code after `c.suspend()` running before or after it.

The node subscribes to the task, the same as with `await`. When the task settles again, the node re-runs and calls `c.suspend()` again.

Use one suspend per activation. A callback suspend can't be added while another suspend is pending, so an async spawn can't use it after an `await`. Either case throws.

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

The same holds for awaiting a task, and for the callback form: a node that has been disposed never resumes, whatever it waits on. When a task is disposed, the nodes waiting on it are rejected once the disposal has finished, with a `Defect` of type `PANIC` ("Awaited task was disposed"; "Awaited resource was disposed" for a resource). It is `PANIC`, not `FATAL`, because nothing crashed: what you waited on was ended by its owner, like an `AbortError` from `fetch`. Every waiter gets the same value, through `await` and `onReject` alike. A waiter that the same disposal tore down (a spawn and the task it awaits, owned by the same root) is not told; a waiter elsewhere is. A locked node (`c.lock()`) counts as alive until its activation finishes, so it is told, and is disposed once it completes.

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

Most reactivity benchmarks measure deep chains and synthetic propagation patterns that rarely occur in real apps. This benchmark (`bench/app`) instead models a typical list view: 1,000 rows, each with its own state signals, computes derived from them, and effects that write DOM values. It is the shape most application code has: many signals feeding many computes, with effects mostly writing to the DOM.

Per row, three signals (`label`, `count`, `done`) feed four computes: a text from label and count, a filter check, an "is selected" check against one id every row shares, and a class name from selection and theme. Five DOM writes follow, four with a single dependency and one with two. At app level, a count over all 1,000 rows feeds a footer, and one side effect persists the filter. DOM elements are plain objects, so the numbers measure the reactive engine, not a DOM.

Every suite builds the same graph, and checks at startup that each scenario runs exactly the same number of computes and effects. anod uses the bound API for single-dependency nodes, as a compiler like katode emits; alien-signals uses `computed` and `effect` with one `effectScope` per row; Solid uses `createMemo`, `createRenderEffect` for DOM writes and one `createRoot` per row, ending each scenario with `flush()` as its renderer does.

| Scenario | What happens | Work per iteration |
| :-- | :-- | :-- |
| Mount + unmount 1k rows | build every row and the app, then dispose them | 4,001 computes, 5,002 effects |
| Edit one row | change one row's label | 1 compute, 2 effects |
| Toggle one row | flip one row's `done` | 1 compute (the 1,000-dep count), 2 effects |
| Select a row | change the selected id | 1,002 computes, 4 effects |
| Edit 10 rows in a batch | bump 10 rows' counts in one batch | 10 computes, 20 effects |
| Change filter | cycle all → done → open | 1,000 computes, up to 1,001 effects |
| Change theme | toggle light/dark | 1,000 computes, 1,000 effects |
| Remount 100 rows | dispose and rebuild 100 row components | 400 computes, 500 effects |

Time is the average per iteration, the median of 8 rounds run in rotated order. Heap is what one iteration allocates, as measured by mitata. Negative Δ = anod is faster / allocates less. Ran on Apple M1 Pro, Node v26.11.1, macOS 26.6.

### anod vs [alien-signals](https://github.com/stackblitz/alien-signals) by Stackblitz (Vue-js internal engine)

| Scenario | alien | anod | Δ time | alien | anod | Δ heap |
| :-- | --: | --: | --: | --: | --: | --: |
| | **Time** | **Time** | | **Heap** | **Heap** | |
| Mount + unmount 1k rows | 984 µs | 822 µs | -16% | 4.0 MB | 3.3 MB | -16% |
| Edit one row | 177 ns | 149 ns | -16% | 176 B | 96 B | -45% |
| Toggle one row | 15.1 µs | 6,476 ns | -57% | 25 B | 24 B | -1% |
| Select a row | 108 µs | 61.3 µs | -43% | 40.8 kB | 570 B | -99% |
| Edit 10 rows in a batch | 2,033 ns | 1,837 ns | -10% | 2.1 kB | 1.4 kB | -34% |
| Change filter | 95.9 µs | 65.3 µs | -32% | 27.5 kB | 21.8 kB | -21% |
| Change theme | 105 µs | 70.5 µs | -33% | 28.6 kB | 28.4 kB | -1% |
| Remount 100 rows | 88.6 µs | 74.4 µs | -16% | 336.6 kB | 272.3 kB | -19% |

### anod vs [@solidjs/signals](https://github.com/solidjs/solid) (Solid 2.0 beta)

| Scenario | solid | anod | Δ time | solid | anod | Δ heap |
| :-- | --: | --: | --: | --: | --: | --: |
| | **Time** | **Time** | | **Heap** | **Heap** | |
| Mount + unmount 1k rows | 4.04 ms | 822 µs | -80% | 10.9 MB | 3.3 MB | -69% |
| Edit one row | 971 ns | 149 ns | -85% | 1.1 kB | 96 B | -91% |
| Toggle one row | 32.8 µs | 6,476 ns | -80% | 1.0 kB | 24 B | -98% |
| Select a row | 140 µs | 61.3 µs | -56% | 151.6 kB | 570 B | -100% |
| Edit 10 rows in a batch | 8,181 ns | 1,837 ns | -78% | 686 B | 1.4 kB | +97% |
| Change filter | 320 µs | 65.3 µs | -80% | 389.1 kB | 21.8 kB | -94% |
| Change theme | 432 µs | 70.5 µs | -84% | 520.7 kB | 28.4 kB | -95% |
| Remount 100 rows | 396 µs | 74.4 µs | -81% | 1.0 MB | 272.3 kB | -73% |

Run them with `node bench/app/anod.js`, `node bench/app/alien-signals.js` and `node bench/app/solid.js` after `npm run make`. `ANOD_API=unbound node bench/app/anod.js` builds every node with the unbound API (`c.compute(fn)`, `c.effect(fn)`) instead. See [bench/app/README.md](bench/app/README.md) for the full graph.

## Acknowledgements

I got the idea to build anod once I stumbled upon [S.js by Adam Haile](https://github.com/adamhaile/S). It has been around for a long time, and I think it has been heavily influential to the modern reactive signals space. For years I wanted to extend it, but it took almost 7 years until I finally took the time to fully implement my idea.

Then, I want to shout out to [ivi](https://github.com/localvoid/ivi), by Boris Kaul. The whole idea of the context in anod originates from ivi's elegant `component(c => {})` signature, that implements a two-phase state registration. Also, I think his library deserves more attention; it's an exceptionally well-built UI library.

## Contributing

Pull requests that are not preceded by a discussion will be closed. If you'd like to contribute a feature, bug fix, or improvement, please open a thread in the [Discussions](https://github.com/visj/anod/discussions) tab first. This ensures we align on the design before any implementation work begins.

Bug reports and questions are always welcome via [Issues](https://github.com/visj/anod/issues).

## License

MIT
