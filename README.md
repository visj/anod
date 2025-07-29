# anod
anod is a reactive library based on [S.js](https://github.com/adamhaile/S) and [SArray](https://github.com/adamhaile/S-array), but with several changes inspired by [Solid](https://github.com/solidjs/solid), [ivi](https://github.com/localvoid/ivi) and [Signals](https://github.com/preactjs/signals) by PreactJS. It provides lightweight wrapper objects that turn regular values and arrays into reactive objects.
## Example
```js
import { value, batch, effect } from "anod";
import { array } from "anod/array";

function Member(age, name) {
    this.age = age;
    this.name = name;
}

const members = array([
    new Member(21, "Leif"),
    new Member(35, "Siv"),
    new Member(48, "Sonja")
]);

const eventPlanned = value(false);

const childExists = members.some(member => member.age < 18);
const memberNames = members.map(member => member.name).join(", ");

effect(() => {
    const childText = childExists.val() ? " (has children)" : "";
    const eventText = eventPlanned.val() ? " Event planned, stay tuned!" : "";
    console.log(`Member list${childText}: ${memberNames.val()}.${eventText}`);
});
// Prints "Member list: Leif, Siv, Sonja."

members.push(new Member(15, "Lars"));
// Prints "Member list (has children): Leif, Siv, Sonja, Lars."

members.unshift(new Member(28, "Astrid"));
// Prints "Member list (has children): Astrid, Leif, Siv, Sonja, Lars."

batch(function() {
    members.pop();
    eventPlanned.set(true);
});
// Prints "Member list: Astrid, Leif, Siv, Sonja. Event planned, stay tuned!"
```
## API
#### `root(fn: () => T): DisposableSignal`
Creates a root wrapper allowing to dispose any children computations created.
```js
import { root, value, effec } from "anod";
const r1 = root(function() {
    const v1 = value(1);
    effect(function() {
        console.log(v1.val());
    });
});
v1.set(2); // prints 2
r1.dispose();
v1.set(3); // nothing happens, effect is disposed
```
#### `data<T>(val: T): Signal<T>` / `value<T>(val: T, eq?: ((a: T, b: T) => boolean) | null): Signal<T>`
The basic data types are `data` and `value`. `data` changes whenever set is called, whereas `value` only updates when set to a different value.
```js
import { value, data, effect } from "anod";
const v1 = value(true);
const d1 = data(true);
effect(function() {
    if (v1.val()) {
        console.log("v1");
    }
    if (d1.val()) {
        console.log("d1");
    }
});
v1.set(true); // nothing happens
v1.set(false); // runs effect
d1.set(true); // runs effect
```
Both `data` and `value` expose `peek`, which allows reading the value without registering a dependency when called inside a computation or effect.
#### `compute<T>(fn: () => T, opts?: SignalOptions<T> | boolean): ReadonlySignal<T>`
`compute` allows for creating derived signals. The main purpose is to avoid unnecessary re-calculations.
```js
import { value, compute, effect } from "anod";
const $age = value(0);
const $stage = compute(function() {
    const age = $age.val();
    return age < 10 ? "child" : age < 18 ? "teenager" : "adult";
});
effect(function() {
    console.log($stage.val());
});
$age.set(5); // will not trigger effect
$age.set(14); // will trigger, value changed from child to teenager
```
`compute` is lazy, and only runs when any other compute or effect tracks its value.
#### `effect(fn: () => void, opts?: SignalOptions<void> | boolean ): DisposableSignal`
`effect` is for creating any functionality derived from signals. It runs upon creation, and whenever any of its dependencies trigger a change.
#### `batch(fn: () => void): void`
`batch` applies all changes before updating computes and effects.
#### `sample<T>(fn: () => T): T`
`sample` works like `peek`, but takes a callback, and does not register any dependency within it.
#### `cleanup(fn: (final: boolean) => void): void`
Registers a cleanup function that runs whenever a compute/effect updates. When final parameter is true, the caller is being disposed.
#### `array<T = any>(val?: T[]): SignalArray<T>`
`array` creates a reactive array object that shims native functions. Mutating functions (push, pop, shift etc) behave like calling set for `data`. It also exposes several derivations of `compute`, for non-mutating methods.

`ComputeReduce` and `ComputeArray` both derive from the core `Compute` class. `ComputeReduce` exposes a `compute` value for methods like reduce, every, some etc. `ComputeArray` inherits from the abstract base class `ReactiveIterator` that is shared with `array`. This is for methods that return an array, such as map and filter.

```js
import { effect } from "anod";
import { array } from "anod/array";
const a1 = array([1,2,3]);
const sum = a1.filter(v => v < 3).map(v => v * 2).reduce((acc, val) => acc + val);
effect(function() {
    console.log(sum.val()); // prints 6
});
a1.unshift(1, 2, 3); // prints 12
a1.push(4, 5, 6); // does not trigger, value has not changed
```