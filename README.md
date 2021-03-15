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
Anod is built on top of [S](https://github.com/adamhaile/S#api) with a slightly different API.

## Data signals

Data signals offer two parallell API modes: functional and object oriented. Anod fully supports both systems.

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


#### `Data<T>`
Data is accessed using a simple api: `get()` to read a value, and `set(val)` to set a value.
```js
import { Data } from 'anod';
const ds = new Data(1);
console.log(ds.get()); // prints "1"
ds.set(2);
console.log(ds.get()); // prints "2"
```
#### `Value<T>`
Value extends data and accepts a predicate function like `value`.
```js
import { Value } from 'anod';
const ds = new Value(1, (a,b) => a > b);
ds.set(0); // nothing happens
ds.set(2); // notifies about changes
```

#### `List<T>`
The functional method `list` and the `List` constructor are identical as the `List` prototype holds methods. In other words, the two methods below are equal.
```js
import { list, List } from 'anod';
const ds1 = list([1,2,3]);
const ds2 = new List([1,2,3]);
```