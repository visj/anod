# Anod
Anod is a reactive Javascript library. It is based on research done by [Adam Haile](https://github.com/adamhaile) in his libraries S.js and S-Array.

# Getting started
Install with `npm install anod`.

You can also use it directly as a script tag by downloading `anod.min.js` from the dist folder and import methods from the global varible `anod`.

```js
const { data, run /* ... */ } = window.anod;
```

# Background
Anod started out as a research project looking at fine grain data binding with conditional branching. Related research was initated by S.js with [subclocks](https://github.com/adamhaile/S#ssubclock--code) as a proposed solution. For some related discussion, see [#1](https://github.com/adamhaile/S/issues/26), [#2](https://github.com/adamhaile/S/issues/32), [#3](https://github.com/ryansolid/solid/issues/55).

# Status
Anod is still a work in progress and some features - notably for some array operations - are still missing. The core reactive library with conditional branching logic is fully functional and tested.

# Documentation
Anod is based on [S](https://github.com/adamhaile/S#api) with a slightly different API.

## Quick start


## Data signals
Signals hold a current value that can be read by computations, and once set, will notify any dependent computation to trigger an update.

Data signals offer two parallell syntax modes: functional and object oriented. Behind the scenes anod uses object oriented signals. Functions are merely wrappers on top of objects with a function `get` and `set`.

### Functional signals

#### `data<T>(val: T): () => T`
`data` creates a basic data signal that can be read by computations. It returns a basic function that can be read or set by passing in a new value.
```js
import { data } from 'anod';
const ds = data(1);
console.log(ds()); // prints "1"
ds(2); // notifies about incoming value 
console.log(ds()); // prints "2"
ds(2); // always notifies about change regardless of whether value is equal
```

#### `value<T>(val: T, eq?: (T,T) => boolean): () => T`
`value` creates a data signal that only propagates changes when the value changes. It optionally accepts a predicate function to determine equality.
```js
import { value } from 'anod';
const ds = value(1);
ds(1); // nothing happens
ds(2); // notifies about change being made 
```

#### `list<T>(val: T[]): List<T>`
`list` creates an array signal which mirrors builtin Javascript array functions and adds a few more.
```js
import { list } from 'anod';
const ds = list([1,2,3]);
console.log(ds.get()); // prints "1,2,3"
ds.push(4); // builtins behave like normal functions
ds.removeAt(2); // see API section for a complete list of array functions
```

### Object oriented signals
Data signals can also be created by calling the constructor directly. Functional signals use object oriented ones internally, and basically wraps them in a functional getter/setter.


### `Data<T>`
Data is accessed using a simple api: `get()` to read a value, and `set(val)` to set a value.
```js
import { Data } from 'anod';
const ds = new Data(1);
console.log(ds.get()); // prints "1"
ds.set(2);
console.log(ds.get()); // prints "2"
```
### `Value<T>`
Value extends data and accepts a predicate function like `value`.
```js
import { Value } from 'anod';
const ds = new Value(1, (a,b) => a > b);
ds.set(0); // nothing happens
ds.set(2); // notifies about changes
```

### `List<T>`
The functional method `list` and the `List` constructor are identical as the `List` prototype holds methods. In other words, the two methods below are equal.
```js
import { list, List } from 'anod';
const ds1 = list([1,2,3]);
const ds2 = new List([1,2,3]);
```
## Computations

### `(fn|run)<T>(f: (seed: T) => T, seed?: T, flags?: number, disposer?: () => void): () => T`
`fn` and `run` creates a dynamic computation node. By default, it will create dependencies on any signal read when `f` is called, and each time the computation updates, it will rebuild the dependency graph.
```js
import { data, fn } from 'anod';
const ds1 = data(1);
const ds2 = data(2);
fn(() => {
	console.log(ds1() + ds2()); // prints "3"
});
ds1(3); // prints "5"
ds2(4); // prints "7"
```
Computations can also read other computations. `fn` is used when the resulting computation node is not needed to be read by others, whereas `run` returns a loggable computation that can be read by others.
```js
import { data, fn, run } from 'anod';
const ds = data(1);
const cs = run(() => ds() + 1); 
fn(() => { console.log(cs() + 1); }); // prints "3"
ds(2); // prints "4"
```
### `(on|tie)<T>(src: Computation | Computation[], f: (seed: T) => T, seed?: T, flags?: number, dispose?: () => void): () => T`
`on` and `tie` works like `fn` but accepts a static list of dependencies to track, and does not register dependencies during runtime. 
```js
import { data, on } from 'anod';
const ds1 = data(1);
const ds2 = data(2);
on(ds1, () => { console.log(ds2()); }); // prints "2"
ds1(3); // prints "3"
ds2(4); // does not print
```

## Ownership
Any computation created inside the scope of another is owned by that parent computation. Whenever the parent computation is updated or disposed, the child computation is automatically disposed.
### `root<T>(node: Computation<T> | () => T, f?: () => T): Computation<T>`


## Reactivity
Anod offers a few different flags contained by the enum `Flag` that modifies how computations behave.

### `Flag.Wait`
This is only meaningful when passed in to `on`/`tie`. It behaves as `onchanges` in `S.js`, i.e. computations will use provided `seed` value and update once any dependency change.

### `Flag.Trace`
One of the strongest features of Anod is tracing computations. When a computation is marked as tracing it will not notify changes to downstream computations unless its value has changed since last round.
```js
import { data, fn, Flag, run } from 'anod';
const ds = data(1);
const cs = run(() => ds() > 2, 0, Flag.Trace);
fn(() => { console.log(cs()); }); // prints "false"
ds(2); // does not print as value of cs has not changed
ds(3); // prints "true"
ds(4); // does not print as value is now stable again
```
Anod uses this functionality extensively for list operations. For instance, any method that returns a functional value traces its value.
```js
import { list, fn } from 'anod';
const ls = list([1,2,3]);
const es = ls.find(x => x === 5);
fn(() => { console.log(es()); }) // prints "undefined"
ls.push(4); // does not print, value is still not found
ls.push(5); // prints "5"
ls.unshift(5); // as value is unchanged even though at a new index, we do not trigger an update 
```
### `Flag.Static`
`tie` and `fn` will reconstruct the dependency tree each time they update. This means that if dependencies change during execution, it will correctly bind to only active dependencies each run. However, if we do not know exactly which dependencies will be triggered, but once run do not change, we can mark the computation as static. This means that once the computation node has registered the dependencies after its initial run, it stabilizes and does not recompute the values until disposed.
```js
import { data, fn, Flag } from 'anod';
const ds1 = data(1);
const ds2 = data(2);
const ds3 = data(3);
fn(() => {
	if (ds1() > 0) {
		if (ds2() < 0) {
			ds3();
		}
	}
	console.log('ran');
}, undefined, Flag.Static);  
ds2(-1); // prints "ran" 
ds3(4); // does not print as we did not bind it the initial round
```
### `Flag.Dynamic`
Per default, `tie` and `fn` creates a static dependency tree. If however the computations passed as `src` have branching logic inside them, we can override this behavior and rebuild the dependency tree on each run by passing in this flag.
```js
import { data, Flag, on } from 'anod';
const ds1 = data(1);
const ds2 = data(2);
/*
 * In order to correctly bind this computation, 
 * we pass in Flag.Dynamic which correctly binds
 * either data signal each cycle.
 */ 
const gt = () => Math.random() > 0.5 ? ds1() : ds2();
on(gt, () => { console.log('ran'); }, undefined, Flag.Dynamic); 
```