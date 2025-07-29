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
const r1 = root(function() {
    const v1 = value(1);
    effect(function() {
        console.log(v1.val());
    });
});
v1.set(2);
r1.dispose();
v1.set(3); // nothing happens
```
#### `data<T>(val: T): Signal<T>` / `value<T>(val: T, eq?: ((a: T, b: T) => boolean) | null): Signal<T>`


#### 