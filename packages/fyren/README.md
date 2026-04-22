# fyren

fyren is a reactive library to manage state. It has built-in support for both sync, async and array methods. It's similar to the concept of signals, but its architecture differs in several meaningful ways:

- No global/automatic dependency tracking, provides a context object to every callback
- Uses a hybrid push/pull model, where nodes can both eagerly and lazily send updates
- Async is built into the core, and is a first-hand member

## Quick example

Below demonstrates a crash course of most of the reactive primitives that fyren offers.

```ts
import { root, signal, list, batch } from "fyren";

const getData = async (url) => ({ url, items: ["First", "Second", "Third"] });

const app = root((c) => {
	const query = signal("");
	const filters = list(["js", "ts"]);
	const langs = filters.join(",");

	// Derived compute re-evaluates when query or langs change
	const params = c.compute((c) => `?q=${c.val(query)}&lang=${c.val(langs)}`);

	// Async task re-fetches whenever params update
	// Every reactive primitive take a short-hand signature for single dep
	const results = c.task(params, async (param, c) => {
		return await c.suspend(getData(`/api/search${param}`));
	});

	// spawn is an async effect, it awaits the task, suspends while task is loading.
	// When the task updates, it notifies the spawn
	c.spawn(async (c) => {
		c.cleanup(() => console.log("cleaning up"));
		const data = await c.suspend(results);
		console.log(data.url);
		for (const item of data.items) {
			console.log(`Received: ${item}`);
		}
	});

	batch(() => {
		query.set("fyren");
		filters.push("rust");
	});
});
// Clean up and dispose everything inside
setTimeout(() => app.dispose(), 100);
```

## Basic usage

Below is a quick introduction to each reactive primitive that exists in fyren. They are heavily inspired by several existing established libraries within the reactive ecosystem.

### Overview

The following primitives exist in fyren:

- Root, which owns inner primitives and dispose them on request
- Context, a callback parameter that provides the current reactive context
- Signal, holds a value and notifies when it changes
- Compute, a derived signal, updates and notifies when it's derived value changes
- Effect, a sink, that listens to signals and computes and performs actions
- Task, an async compute, for awaiting promises
- Spawn, an async effect, for doing async work
- List, a signal that mirrors native array methods, such as push, pop
- Collection, the readonly array methods like map, filter, for chaining .map().filter()

#### Root

The foundation is the root. It creates a top level reactive ownership space.

```ts
import { root, type RootContext } from "fyren";

const app = root((c: RootContext) => {
	// Add other reactive primitives here
});
// Later when you're done with the root
app.dispose();
```

#### Signal & basic reactivity

A signal stores a value and notifies subscribers when changed. You can read it to get its current value, and write to it to update anyone who depends on it.

```ts
import { signal, root } from "fyren";

root((c) => {
	const name = signal("Vilhelm");
	/**
	 * The .get() method only returns the current value.
	 * Unlike other libraries, this method in itself does nothing, regardless
	 * of being read in or outside a reactive context.
	 */
	console.log(name.get());
	c.effect((c) => {
		/**
		 * To read and subscribe to a signal,
		 * we use the `c.val()` function provided
		 * by the current reactive context.
		 */
		console.log(c.val(name));
	});
	/**
	 * Prints 'Leif' to console.
	 * The .set() method is immediate, it
	 * flushes the internal queue synchronously.
	 */
	name.set("Leif");
});
```

#### Compute

A compute is a derived signal. It can subscribe to signals or other computes, and updates whenever any of them change.

```ts
import { signal, root } from "fyren";
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

	temp.set(15); // feelsCold has no subscribers, nothing prints to the console

	c.effect((c) => {
		/**
		 * Here, feelsCold is out of date. When we try to get its value,
		 * it re-runs to get the latest value.
		 * The console prints 'Evaluating weather' before
		 * assessing whether it's cold today.
		 */
		console.log(c.val(feelsCold) ? "Feels cold" : "Not too bad");
	});
	temp.set(5); // Evaluating, but it's still warm, effect is not notified
	temp.set(-10); // Now we went from warm to cold, effect prints 'Feels cold'
});
```

All reactive receivers also accept a single dependency signature, `compute(dep: Sender<T>, (val: T, c: Context) => T)`. For single dependency, this is the preferred way of creating receivers, as it both greatly improves performance and simplifies callback logic.

```ts
import { root, signal } from "fyren";
root((c) => {
	const name = signal("Vilhelm");
	const isSelf = c.compute(name, (val) => val === "Vilhelm");
	c.effect(isSelf, (self) => console.log(`Is it me? ${self}`));
});
```

#### Effect

An effect is a receiver that listens to senders and performs actions.

```ts
import { root, signal } from "fyren";
root((c) => {
	const counter = signal(0);
	c.effect(counter, (val) => {
		console.log(`Val is ${val}`);
	});
	/**
	 * Signals drain synchronously.
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
import { root, signal } from "fyren";
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

fyren aims to bridge the gap between sync and async signal reactivity. `compute` and `effect` have become the standard primitives within the signal community; here, we suggest that they are complemented by `task` and `spawn` for their async counterparts. Async reactive graphs are still experimental. fyren has not yet reached 1.0, and there may still be bugs and edge cases that are not covered yet.

### Task

A Task is an async Compute. Just like compute, it runs eagerly, but after it has produced an initial value, it only updates when read by either other tasks, or spawns.

```ts
import { root, signal } from "fyren";
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
import { root, signal } from "fyren";
root((c) => {
	const url = signal("/api/data");
	c.spawn(async (c) => {
		const endpoint = c.val(url);
		c.cleanup(() => console.log("previous run cleaned up"));
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

#### Error handling

Effects and spawns support `c.recover()` to intercept errors. If the recover callback returns `true`, the error is swallowed and the effect stays alive. If it returns `false`, the error propagates and the effect is disposed.

```ts
import { root, signal } from "fyren";
root((c) => {
	const url = signal("/api/data");
	c.spawn(async (c) => {
		c.recover((err) => {
			console.error("Fetch failed:", err.message);
			return true; // swallow, try again next time url changes
		});
		const res = await c.suspend(fetch(c.val(url)));
		console.log(await c.suspend(res.json()));
	});
});
```

#### Batching

`batch()` groups multiple signal writes into a single notification pass. Without batch, each `.set()` immediately flushes the reactive graph. Inside a batch, writes are coalesced and the graph flushes once at the end.

```ts
import { root, signal, batch } from "fyren";
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

Signals also expose `.post()` which writes the value immediately but defers the flush to a microtask. Multiple `.post()` calls within the same tick coalesce into a single flush automatically.

```ts
import { signal } from "fyren";
const counter = signal(0);
counter.post(1); // write now, flush on microtask
counter.post(2); // same tick, overwrites, still one flush
counter.post((prev) => prev + 1); // updater form
```

Both `.set()` and `.post()` accept an updater function `(prev) => next` as a shorthand for reading and transforming the current value.

## The reactive graph in depth

This section covers the internal evaluation model and the context helper methods that control it.

### Eager creation, lazy pull

When a compute or task is created, it runs immediately to establish its initial value and subscribe to its dependencies. After that first run, it becomes lazy: it only re-evaluates when something reads it. This means a compute with no subscribers accumulates staleness markers but does no actual work until someone calls `.get()` or reads it through `c.val()`.

Effects and spawns are different: they are always push-based. When their dependencies change, they are enqueued into the flush loop and re-run automatically, without anyone needing to pull them.

This hybrid model avoids unnecessary computation (computes that nobody reads are skipped) while guaranteeing side effects always run (effects never go stale silently).

### Dependency tracking

Dependencies are tracked dynamically at runtime. When your callback calls `c.val(sender)`, a bidirectional link is created between the sender and the receiver. On re-run, fyren reconciles the dependency list: new deps are added, stale deps are removed, reused deps are kept in place. This all happens in a single pass.

The bound signature `compute(dep, fn)` skips dependency tracking entirely. The single dependency is fixed at creation time. This is significantly faster for the common single-dep case and avoids all reconciliation overhead.

### Evaluation helpers

#### `c.stable()`

Marks the current node as stable: after this call, any further `c.val()` reads do not register new dependencies. Useful when you want to read a value without subscribing to it for future updates.

```ts
import { root, signal } from "fyren";
root((c) => {
	const config = signal("dark");
	const data = signal([1, 2, 3]);
	let runs = 0;
	const formatted = c.compute((c) => {
		runs++;
		const d = c.val(data); // subscribes to data
		c.stable();
		const cfg = c.val(config); // reads config but does NOT subscribe
		return `${cfg}: ${d.join(",")}`;
	});
	console.log(formatted.get()); // "dark: 1,2,3"

	config.set("light");
	console.log(formatted.get()); // still "dark: 1,2,3" — config is not a dep
	console.log(runs); // 1 — did not re-evaluate

	data.set([4, 5]);
	console.log(formatted.get()); // "light: 4,5" — picks up config on re-run
	console.log(runs); // 2
});
```

#### `c.equal()`

Controls whether the node suppresses downstream notifications when its value hasn't changed. By default, fyren uses `!==` comparison. Calling `c.equal(true)` enables deep equality suppression: if the new value is deeply equal to the old one, subscribers are not notified.

```ts
import { root, signal } from "fyren";
root((c) => {
	const x = signal(5);
	let runs = 0;
	const clamped = c.compute(x, (val, c) => {
		c.equal(true);
		return Math.min(val, 10);
	});
	c.effect(clamped, (val) => {
		runs++;
		console.log("clamped:", val);
	});
	console.log(runs); // 1 — initial run

	x.set(15); // clamped returns 10, same as before
	console.log(runs); // 1 — effect did NOT re-run

	x.set(3); // clamped returns 3, different
	console.log(runs); // 2 — effect re-ran
});
```

#### `c.weak()`

A weak compute releases its cached value when it loses all subscribers. The next read triggers a fresh recompute. This is useful for expensive computations that should not retain memory when nobody is listening.

```ts
import { root, signal, OPT_WEAK } from "fyren";
root((c) => {
	const raw = signal(100);
	let runs = 0;
	const processed = c.compute((c) => {
		runs++;
		c.weak();
		return c.val(raw) * 2;
	});
	const e = c.effect(processed, (val) => {});
	console.log(runs); // 1 — computed once

	e.dispose();
	console.log(processed.get()); // 200 — recomputed fresh
	console.log(runs); // 2 — value was released, had to recompute
});
```

#### `c.eager()`

Converts a compute from pull-based to push-based. An eager compute re-evaluates immediately when notified, rather than waiting to be pulled. Use sparingly: this removes the laziness optimization but guarantees the value is always fresh.

### Error recovery in depth

When an error occurs inside an effect or spawn, the default behavior is to dispose the node. `c.recover()` intercepts this by registering a handler that can inspect the error and decide whether to swallow or propagate it.

Recovery follows the ownership chain. If a child effect doesn't handle an error, it bubbles to the parent. A root's `recover()` is the last line of defense before the error escapes to the caller.

```ts
import { root, signal } from "fyren";
root((c) => {
	c.recover((err) => {
		console.error("Root caught:", err.message);
		return true; // swallow all errors at root level
	});
	const count = signal(0);
	c.effect(count, (val, c) => {
		c.recover((err) => {
			if (err.message === "expected") {
				return true; // swallow, retry on next update
			}
			return false; // bubble anything else to root
		});
		if (val === 1) {
			throw new Error("expected");
		}
		if (val === 2) {
			throw new Error("unexpected");
		}
		console.log("ok:", val);
	});
	count.set(1); // recover swallows "expected"
	count.set(0); // effect runs again, prints "ok: 0"
	count.set(2); // recover returns false, bubbles to root
});
```

## Async reactivity in depth

fyren provides three ways to consume async values, each suited to a different use case.

### The three delivery paths

#### 1. Sync check with `c.pending()`

`c.pending(task)` returns `true` if the task is still loading. This lets you branch synchronously without awaiting. The current node subscribes to the task for future updates but does not block.

```ts
import { root, signal } from "fyren";
const fetchData = () => new Promise((r) => setTimeout(() => r({ name: "fyren" }), 50));

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
// Prints "Loading..." then after 50ms "Ready: { name: 'fyren' }"
```

#### 2. Await with `c.suspend()`

`c.suspend()` is the primary async delivery mechanism. It accepts a promise, a task, or an array of tasks.

**Promise path**: wraps the promise so that if the node is disposed or re-run before it resolves, the continuation is silently dropped.

```ts
import { root, signal } from "fyren";
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

**Task path**: if the task is already settled, returns the value synchronously. If the task is loading, creates a two-way channel binding: the spawn suspends until the task settles, then resumes with the value.

```ts
import { root, signal } from "fyren";
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

**Array path**: awaits multiple tasks concurrently. Returns when all tasks have settled.

```ts
import { root } from "fyren";
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

#### 3. Setup function path

`c.suspend(setupFn)` accepts a setup function that receives `resolve` and `reject` callbacks. This avoids promise allocation entirely and enables natural integration with callback-based APIs like WebSockets, event emitters, and timers. The node enters a loading state and settles when `resolve` or `reject` is called.

The callbacks are guarded with the same staleness protection as promises: if the node is disposed or re-run before `resolve` fires, the call is silently ignored.

```ts
import { root, signal } from 'fyren';
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

### Stale activation safety

Every call to `c.suspend()` captures the current activation timestamp. When the promise resolves, fyren checks whether the node has been re-run or disposed since the suspend was issued. If it has, the resolution is silently discarded. This guarantees that stale async results never pollute the current activation, even across complex chains of awaits.

This applies to both resolve and reject: if a promise rejects after the node was invalidated, the error is also discarded. You are never notified about errors from stale activations.

### Deferred dependencies with `c.defer()`

`c.defer()` reads a signal's value without subscribing during the sync body. Instead, the dependency is registered at settle time after the async work completes. This is useful when you need a value for async work but don't want changes to that value to cancel your in-flight operation.

```ts
import { root, signal } from "fyren";
const fetchWithAuth = (token) => new Promise((r) => setTimeout(() => r({ token, data: "ok" }), 50));

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
import { root, signal } from "fyren";
root((c) => {
	const url = signal("/api/data");
	c.spawn(async (c) => {
		const endpoint = c.val(url);
		const ctrl = c.controller();
		try {
			const res = await c.suspend(
				fetch(endpoint, { signal: ctrl.signal })
			);
			console.log(await c.suspend(res.json()));
		} catch (e) {
			if (e.name === "AbortError") {
				console.log("Request aborted");
			}
		}
	});
	// Changing url re-runs the spawn, which aborts the old fetch
	url.set("/api/other");
});
```

### Async transactions with `c.lock()` / `c.unlock()`

By default, when a task or spawn's dependencies change during async work, the node is re-run: the old activation is abandoned and a new one starts. Sometimes this is wrong. If you are iterating over an array and saving each element to a database, you need the entire iteration to finish before processing the next update.

`c.lock()` prevents the node from re-running until the current activation completes (or `c.unlock()` is called). The node is still marked stale by its dependencies, but the re-run is deferred until the lock releases. On completion, if the node was marked stale during the lock, it automatically re-runs with the fresh values.

```ts
import { root, signal } from "fyren";
const saveToDb = (item) => new Promise((r) => setTimeout(() => {
	console.log("saved:", item);
	r();
}, 10));

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

## Reactive arrays

fyren provides reactive array support through the `list` package. A list is a signal that holds an array and exposes native array methods on its prototype. Import `list` from `fyren` alongside the side-effect import that patches the array methods.

```ts
import { list } from "fyren";

const items = list([1, 2, 3]);
items.push(4); // notifies subscribers
items.get(); // [1, 2, 3, 4]
```

### Collections

Calling a read method on a list (or any signal/compute holding an array) returns a Collection: a reactive derived array that updates when the source changes.

```ts
import { root, list } from "fyren";
root((c) => {
	const items = list([1, 2, 3, 4, 5]);
	const even = items.filter((val) => val % 2 === 0);
	const doubled = even.map((val) => val * 2);
	c.effect(doubled, (arr) => {
		console.log(arr); // [4, 8]
	});
	items.push(6); // effect re-runs, prints [4, 8, 12]
});
```

Collections chain naturally. Each step creates a new reactive compute that re-evaluates when its source changes.

### Array method callbacks

Every callback-based array method receives the reactive context as the last argument. This gives you access to `c.cleanup()`, `c.peek()`, `c.stable()`, and other context helpers inside array callbacks.

```ts
import { list } from "fyren";
const items = list([1, 2, 3]);
const rendered = items.map((val, index, array, c) => {
	c.cleanup(() => console.log("re-rendering"));
	return `<li>${val}</li>`;
});
console.log(rendered.get()); // ["<li>1</li>", "<li>2</li>", "<li>3</li>"]
items.push(4); // prints "re-rendering", then updates
console.log(rendered.get()); // ["<li>1</li>", ..., "<li>4</li>"]
```

`forEach` creates an effect rather than a compute. The callback can return a cleanup function that runs before each re-evaluation.

### Batching array mutations

Mutation methods like `push`, `pop`, `splice`, `sort` notify subscribers immediately by default. To group multiple mutations into a single update, use `batch()`.

```ts
import { list, batch } from "fyren";
const items = list([1, 2, 3]);
batch(() => {
	items.push(4);
	items.push(5);
	items.shift();
});
// Subscribers are notified once, seeing [2, 3, 4, 5]
```

Inside a batch, each mutation sees the array in its updated state from the previous mutation. The subscriber only runs once at the end, with the final result.

### Mutation tracking

When a list is mutated through methods like `push`, `splice`, or `sort`, fyren encodes the type of mutation (add, delete, sort) along with the position and length into the signal's internal flag bits. Downstream computes can read this mutation descriptor to shortcircuit unnecessary work.

For example, when you `push` a new element onto a list, a downstream `includes` check that previously returned `true` knows the matching element is still there. It doesn't need to re-scan the array. A downstream `find` can check only the newly added region instead of the full array.

This optimization is automatic for the built-in array methods. The mutation descriptor propagates through the reactive graph and is consumed by any compute that knows how to interpret it. Methods that can't be optimized (like `sort`) fall back to full recomputation.

```ts
import { list } from "fyren";
const items = list([1, 2, 3]);
const hasTwo = items.includes(2);
console.log(hasTwo.get()); // true, scans full array

items.push(4);
console.log(hasTwo.get()); // true, skips scan: add at end doesn't affect existing match

items.splice(1, 1); // remove element at index 1
console.log(hasTwo.get()); // false, deletion overlaps match position: re-scans
```
