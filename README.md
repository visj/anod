# fyren

fyren is a fast reactive library to manage state. It has builtin support for both sync, async and array methods. It's similar to the concept of signals, but its architecture differs in several meaningful ways:

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
	const allow = signal(0);
	const message = signal("");
	c.effect(allow, (allow, c) => {
		if (allow) {
			c.cleanup(() => {
				console.log("disposing logger");
			});
			c.effect(message, (mess, c) => {
				console.log(mess);
			});
		}
	});
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
root((c) => {
	const config = signal({ theme: "dark" });
	const data = signal([1, 2, 3]);
	c.compute((c) => {
		const d = c.val(data); // subscribes to data
		c.stable();
		const cfg = c.val(config); // reads config but does NOT subscribe
		return format(d, cfg);
	});
});
```

#### `c.equal()`

Controls whether the node suppresses downstream notifications when its value hasn't changed. By default, fyren uses `!==` comparison. Calling `c.equal(true)` enables deep equality suppression: if the new value is deeply equal to the old one, subscribers are not notified.

```ts
root((c) => {
	const items = signal([1, 2, 3]);
	const sorted = c.compute(items, (arr, c) => {
		c.equal(true);
		return [...arr].sort();
	});
	// Even though sorted produces a new array reference each time,
	// subscribers only update when the sorted contents actually differ.
});
```

#### `c.weak()`

A weak compute releases its cached value when it loses all subscribers. The next read triggers a fresh recompute. This is useful for expensive computations that should not retain memory when nobody is listening.

```ts
root((c) => {
	const raw = signal(largeDataset());
	const processed = c.compute((c) => {
		c.weak();
		return expensiveTransform(c.val(raw));
	});
	const e = c.effect(processed, (val) => render(val));
	// Later: disposing the effect means processed has no subscribers.
	// Its cached value is released, freeing memory.
	e.dispose();
});
```

#### `c.eager()`

Converts a compute from pull-based to push-based. An eager compute re-evaluates immediately when notified, rather than waiting to be pulled. Use sparingly: this removes the laziness optimization but guarantees the value is always fresh.

### Error recovery in depth

When an error occurs inside an effect or spawn, the default behavior is to dispose the node. `c.recover()` intercepts this by registering a handler that can inspect the error and decide whether to swallow or propagate it.

Recovery follows the ownership chain. If a child effect doesn't handle an error, it bubbles to the parent. A root's `recover()` is the last line of defense before the error escapes to the caller.

```ts
root((c) => {
	c.recover((err) => {
		console.error("Root caught:", err);
		return true; // swallow all errors at root level
	});
	c.effect((c) => {
		c.recover((err) => {
			if (err instanceof NetworkError) {
				return true; // retry on next update
			}
			return false; // bubble anything else to root
		});
		riskyOperation();
	});
});
```

## Async reactivity in depth

fyren provides three ways to consume async values, each suited to a different use case.

### The three delivery paths

#### 1. Sync check with `c.pending()`

`c.pending(task)` returns `true` if the task is still loading. This lets you branch synchronously without awaiting. The current node subscribes to the task for future updates but does not block.

```ts
root((c) => {
	const data = c.task(async (c) => {
		return await c.suspend(fetch("/api/data").then((r) => r.json()));
	});
	c.effect((c) => {
		if (c.pending(data)) {
			console.log("Loading...");
			return;
		}
		console.log("Ready:", c.val(data));
	});
});
```

#### 2. Await with `c.suspend()`

`c.suspend()` is the primary async delivery mechanism. It accepts a promise, a task, or an array of tasks.

**Promise path**: wraps the promise so that if the node is disposed or re-run before it resolves, the continuation is silently dropped.

```ts
c.spawn(async (c) => {
	// If the spawn re-runs while fetch is pending,
	// the old promise's .then() never fires.
	const res = await c.suspend(fetch("/api/data"));
});
```

**Task path**: if the task is already settled, returns the value synchronously. If the task is loading, creates a two-way channel binding: the spawn suspends until the task settles, then resumes with the value.

```ts
c.spawn(async (c) => {
	// Suspends until fetchTask settles. If fetchTask re-runs,
	// the spawn is notified and re-runs too.
	const data = await c.suspend(fetchTask);
});
```

**Array path**: awaits multiple tasks concurrently. Returns when all tasks have settled.

```ts
c.spawn(async (c) => {
	const [users, posts] = await c.suspend([usersTask, postsTask]);
});
```

#### 3. Callback path

`c.suspend(task, onResolve, onReject)` uses raw callbacks instead of returning a promise. This avoids promise allocation entirely. When the task settles, your callback is called directly.

```ts
c.spawn(async (c) => {
	c.suspend(fetchTask, (value) => {
		console.log("Got:", value);
	}, (err) => {
		console.error("Failed:", err);
	});
});
```

### Stale activation safety

Every call to `c.suspend()` captures the current activation timestamp. When the promise resolves, fyren checks whether the node has been re-run or disposed since the suspend was issued. If it has, the resolution is silently discarded. This guarantees that stale async results never pollute the current activation, even across complex chains of awaits.

This applies to both resolve and reject: if a promise rejects after the node was invalidated, the error is also discarded. You are never notified about errors from stale activations.

### Deferred dependencies with `c.defer()`

`c.defer()` reads a signal's value without subscribing during the sync body. Instead, the dependency is registered at settle time after the async work completes. This is useful when you need a value for async work but don't want changes to that value to cancel your in-flight operation.

```ts
c.task(async (c) => {
	const token = c.defer(authToken); // read but don't subscribe yet
	const res = await c.suspend(fetch("/api/data", {
		headers: { Authorization: token },
	}));
	// At settle time, authToken is subscribed.
	// If it changed during the fetch, the task re-runs.
	return res.json();
});
```

### Abort controller with `c.controller()`

`c.controller()` returns an `AbortController` that is automatically aborted when the node re-runs or is disposed. Useful for cancelling fetch requests or other abortable operations.

```ts
c.spawn(async (c) => {
	const ctrl = c.controller();
	const res = await c.suspend(
		fetch("/api/data", { signal: ctrl.signal })
	);
	console.log(await c.suspend(res.json()));
});
```

### Async transactions with `c.lock()` / `c.unlock()`

By default, when a task or spawn's dependencies change during async work, the node is re-run: the old activation is abandoned and a new one starts. Sometimes this is wrong. If you are iterating over an array and saving each element to a database, you need the entire iteration to finish before processing the next update.

`c.lock()` prevents the node from re-running until the current activation completes (or `c.unlock()` is called). The node is still marked stale by its dependencies, but the re-run is deferred until the lock releases. On completion, if the node was marked stale during the lock, it automatically re-runs with the fresh values.

```ts
c.spawn(async (c) => {
	const items = c.val(todoList);
	c.lock();
	for (const item of items) {
		await c.suspend(saveToDb(item));
	}
	// Lock releases implicitly when the spawn completes.
	// If todoList changed during the loop, the spawn
	// re-runs now with the updated list.
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
const items = list([1, 2, 3]);
const rendered = items.map((val, index, array, c) => {
	c.cleanup(() => console.log("re-rendering"));
	return `<li>${val}</li>`;
});
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
const items = list([1, 2, 3]);
const hasTwo = items.includes(2);
hasTwo.get(); // true, scans full array

items.push(4);
hasTwo.get(); // true, skips scan: add at end doesn't affect existing match

items.splice(1, 1); // remove element at index 1
hasTwo.get(); // false, deletion overlaps match position: re-scans
```
