# anod

anod is a reactive state management library. It has built-in support for both sync and async graphs. It's similar to many other signal libraries, but its architecture differs in several meaningful ways:

- No global/automatic dependency tracking, provides a context object to every callback
- Uses a hybrid push/pull model, where nodes can both eagerly and lazily send updates
- Async is built into the core, and is a first-hand member

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

- Root, which owns inner primitives and dispose them on request
- Context, a callback parameter that provides the current reactive context
- Signal, holds a value and notifies when it changes
- Relay, a signal that always notifies on every update
- Compute, a derived signal, updates and notifies when it's derived value changes
- Effect, a sink, that listens to signals and computes and performs actions
- Resource, an async signal that can optimistically update while letting server confirm changes
- Task, an async compute, for awaiting promises
- Spawn, an async effect, for doing async work

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

#### Signal & Relay

A signal stores a value and notifies subscribers when changed. You can read it to get its current value, and write to it to update anyone who depends on it.

```ts
import { root, signal, relay } from "anod";

root((c) => {
	const name = signal("Vilhelm");
	const shape = relay({ job: "dev", hobby: "fidology" });
	/**
	 * The .get() method only returns the current value.
	 * Unlike other libraries, this method by itself does
	 * not have any reactive capabilities. Instead, reactivity
	 * is controller through the context
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
	 * A relay is convenient when you work with mutable
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

	// Refresh - keep current value visible, replace when done
	name.set(async (c, current) => {
		return await c.suspend(save(current));
	});

	c.effect(name, (val) => {
		console.log(val, name.loading ? "(loading)" : "");
	});
});
```

The async callback receives the resource as `c` (with `suspend` for staleness protection) and the current/optimistic value. If the callback returns a sync value, it settles immediately with no loading state. If it returns a promise, `.loading` becomes true until it resolves.

When a new `set()` fires while a previous async callback is still in flight, the old promise still resolves normally, but `suspend()` detects that the resource has moved on and simply doesn't yield back into the callback. The continuation after `await` never runs, so the stale result never reaches the `return`. Only the latest activation's callback gets to settle the resource.

### Task

A Task is an async Compute. Just like compute, it runs eagerly, but after it has produced an initial value, it only updates when read by either other tasks, or spawns.

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
	 * Nothing happens in the spawn. If the task invalidates while spawn is waiting,
	 * it just keeps waiting for the task to produce value.
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

The suspend method is a critical part of anod's async infrastructure. It acts as a guard to prevent stale async callbacks on invalidation. It's strongly recommended to not await raw promises within the reactive graph. By using `c.suspend()` , it handles staleness guarantee, ensuring that disposed callbacks never yield back to do unexpected side effects.

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

#### Error handling

All errors in anod are `{ error, type }` objects with three type constants: `REFUSE` , `PANIC` , and `FATAL` . This lets you cleanly separate expected errors from unexpected crashes.

- **`c.refuse(val)`** — non-throwing expected error for computes. Usage: `return c.refuse("invalid")`.
- **`c.panic(val)`** — throwing expected error for computes and effects. Aborts the current run.
- **`FATAL`** — any unexpected throw is automatically wrapped as `{ error: thrownValue, type: FATAL }`.

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

#### Finalize

Effects and spawns support `c.finalize()` for guaranteed cleanup at the end of the current activation, regardless of whether it succeeded or threw. `cleanup` runs at the start of the _next_ run. `recover` handles errors, and `finalize` runs at the end of _this_ run. Together, `recover` and `finalize` behave just like a `try/catch/finally` clause.

The primary use case is async effects that acquire resources mid-activation and need guaranteed release. Without `finalize` , you'd have to duplicate cleanup logic in both the normal path and `recover` .

```ts
import { root, signal, FATAL } from "anod";
root((c) => {
	const record = signal({ id: 1, name: "Ada" });
	c.spawn(async (c) => {
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

- Multiple `finalize` calls accumulate and run forward in registration order
- Errors inside finalizers are swallowed, matching JS `finally` semantics
- `finalize` does not bubble to parent effects, it's scoped to the activation it was registered in
- On re-run, any leftover finalize from the previous activation is cleared before the new run starts
- This differs from `cleanup`, which runs in reverse order (stack unwinding). Finalize is sequential post-completion work, not resource teardown

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

Signals also expose `.post()` which defers the write to a microtask. Nothing is written immediately — the value is scheduled and applied when the microtask flush runs. Multiple `.post()` calls within the same tick coalesce into a single flush automatically.

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

Anod's interal dependency reconciliation algorithm is designed to avoid allocation pressure in the update path. For nodes that read the same dependencies every run, they are re-used, and no additional objects are allocated.

### Contextual helpers

#### `c.equal()`

Lets you control whether downstream subscribers are notified after a compute re-runs. By default, anod uses `!==` — if the new value is a different reference, subscribers are notified. `c.equal()` gives you full control: you perform the comparison yourself and tell anod the result.

- `c.equal()` or `c.equal(true)` — "my result is equal to the previous one, don't notify subscribers"
- `c.equal(false)` — "my result changed, always notify subscribers" (even if `===` would say otherwise)

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
import { root, signal, OPT_DEFER } from "anod";
root((c) => {
	const eventbus = signal("");
	const socketUrl = signal("ws://localhost:8080");
	c.effect(socketUrl, (url, c) => {
		const socket = new WebSocket(url);
		/**
		 * We register the cleanup to close the old socket if they
		 * change which url we are posting to
		 */
		c.cleanup(() => socket.close());
		c.suspend((resolve, reject) => {
			socket.addEventListener("open", (event) => {
				socket.send("Hello Server!");
				/**
				 * Websocket is open, register an effect
				 * that susbcribes to a signal and sends to socket.
				 * We set OPT_DEFER to not run initially, but instead
				 * wait for the first signal change to trigger.
				 * Unlike other libraries, in anod, you can freely create
				 * owned scopes throughout the async execution lifecycle.
				 * Since anod doesn' rely on global state, the context
				 * allows you to treat every async boundary as if it was
				 * called from the initial sync path.
				 */
				c.effect(
					eventbus,
					(message, c) => {
						socket.send(message);
					},
					OPT_DEFER
				);
				resolve();
			});
		});
	});
});
setTimeout(() => {
	eventbus.set("Hello");
	eventbus.set("World");
}, 100);
```

#### `c.recover()` , `c.refuse()` , `c.panic()`

See dedicated error lifecycle section.

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
| `PANIC`  | 2     | Expected error, throwing     | `c.panic(val)`         |
| `FATAL`  | 3     | Unexpected crash             | Any uncaught `throw`   |

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
import { root, signal } from "anod";
root((c) => {
	const url = signal("ws://localhost");
	const messageSignal = signal(null);
	c.spawn((c) => {
		const ws = new WebSocket(c.val(url));
		c.cleanup(() => ws.close());

		c.suspend((resolve, reject) => {
			ws.addEventListener("open", () => {
				ws.addEventListener("message", (e) => {
					messageSignal.set(JSON.parse(e.data));
				});
				resolve();
			});
			ws.addEventListener("error", reject);
		});
	});
});
```

Note the spawn body is sync — no `async` keyword, no promise allocation. The setup function controls when the node settles. If `url` changes, the spawn re-runs: `cleanup` closes the old websocket, a new one is created, the old `resolve` becomes stale and is silently ignored.

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

`c.lock()` prevents the node from re-running until the current activation completes (or `c.unlock()` is called). The node is still marked stale by its dependencies, but the re-run is deferred until the lock releases. On completion, if the node was marked stale during the lock, it automatically re-runs with the fresh values.

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

Instead, you must rely on the builtin lifecycle helpers. If you await a promise, and create some state that needs cleaning up, use c.cleanup(). If you must run the async function to completion, run c.lock(). The idea about anod's async correctness guarantee is that we do not want promises firing all over the place, writing state in an unpredictable way. The sync reactive graph is always consistent. When you write a value, every reader is guaranteed to see a consistent state of that signal. This idea extends to async, but with a different guarantee: every async primitive is guaranteed a consistent snapshot in time, but there is no guarantee exactly which time that is.
