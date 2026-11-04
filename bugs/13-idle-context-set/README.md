# 13: Idle `c.set` gaps

Branch `fix/13-idle-context-set`, based on `fix/12-queued-resource-writes`. Chain B (contextual and resource writes).

## What breaks

The idle path of `contextSet` (a contextual write from an async continuation) diverges from `signal.set`:

- A void updater on `signal(v, false)` sets the value to `undefined` instead of keeping the mutated object.
- Writing to a disposed signal is accepted and stores the value, while `signal.set` throws.

```js
c.spawn(async (cx) => {
    await cx.suspend(load());
    cx.set(list, (arr) => { arr.push(1); }); // list.get() is now undefined
});
```

## Root cause

- `contextSet`'s idle branch resolves the updater and writes without the `FLAG_MUTABLE` void-return handling and without the `FLAG_DISPOSED` check that `set` has.

## What anod should do

- A contextual write behaves exactly like `sender.set()`, plus the self-notification guard. Same updater semantics, same disposed check (throws).

## Tests (2)

- `test/explore/scheduling.test.js` › contextual writes (c.set / c.post) › idle c.set with a void updater on signal(v, false) keeps the mutated value
- `test/explore/scheduling.test.js` › contextual writes (c.set / c.post) › idle c.set does not write into a disposed signal

Run with `bun test --conditions=src test/explore/scheduling.test.js`.

## Fix

_Not fixed yet. The fix branch fills this in._
