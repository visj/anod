# fyren

fyren is a fast reactive library to manage state. It has builtin support for both sync, async and array methods. It's similar to the concept of signals, but its architecture differs in several meaningful ways:

- No global/automatic dependency tracking, provides a context object to every callback
- Uses a hybrid push/pull model, where nodes can both eagerly and lazily send updates
- Async is built into the core, and is a first-hand member

## Quick example

Below demonstrates a crash course of most of the reactive primitives that fyren offers.

```ts
import { c } from "fyren";

const getData = async (url) => ({ url, items: ["First", "Second", "Third"] });

c.root((c) => {
	const query = c.signal("");
	const filters = c.list(["js", "ts"]);
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

	c.batch(() => {
		query.set("fyren");
		filters.push("rust");
	});
});
// Clean up and dispose everything inside
setTimeout(() => root.dispose(), 100);
```

## Reactive primitives

Below is a quick introduction to each reactive primitive that exists in fyren. They are heavily inspired by several existing established libraries within the reactive ecosystem.

### Signal & basic reactivity

A signal stores a value and notifies subscribers when changed. You can read it to get its current value, and write to it to update anyone who depends on it.

```ts
import { c } from "fyren";

const name = c.signal("Vilhelm");
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
```

### Compute

A compute is a derived signal. It can subscribe to signals or other computes, and updates whenever any of them change.

```ts
import { c } from "fyren";
const temp = c.signal(10);
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
```
All reactive receivers also accept a single dependency signature, `compute(dep: Sender<T>, (val: T, c: Context) => T)`. For single dependency, this is the preferred way of creating receivers, as it both greatly improves performance and simplifies callback logic.
```ts
const name = c.signal("Vilhelm");
const isSelf = c.compute(name, (val) => val === "Vilhelm");
effect(isSelf, (self) => console.log(`Is it me? ${self}`));
```
### Effect
An effect is a receiver that listens to senders and performs actions.
```ts
import { c } from 'fyren';
const counter = c.signal(0);
c.effect(counter, val => {
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
```
Effects can be nested, each effect managing ownership of any effect node created below it.
```ts
import { c } from 'fyren';
const toggle = c.signal(0);
const channel = c.signal('');
c.effect(toggle, (toggle, c) => {
	if (toggle) {
		c.effect()
	}
});
```
