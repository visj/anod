# 17: Async nodes that hang or lose their result

Branch `fix/17-lost-results`, based on `fix/16-unchanged-settle`. Chain E (async settling).

## What breaks

- A task whose async generator returns without yielding stays loading forever.
- A task whose `c.suspend(cb)` callback calls `resolve(42)` synchronously ends up with `undefined`; `reject(err)` synchronously sets the error flag but loses the error object.

```js
const t = c.task(async function* () { return 5; });   // loading forever
const u = c.task((cx) => { cx.suspend((res) => res(42)); }); // u.get() is undefined
```

## Root cause

- `resolveIterator` returns on `result.done` without settling the node.
- The ASYNC_SYNC tail of `ComputeProto._update` writes the function's return value (`undefined`) over the value the callback already settled.

## What anod should do

- A finished iterator settles the node: with the returned value if it has one, otherwise keeping the last yielded value (or the seed), and clears loading.
- A callback that settles synchronously wins over the function's `undefined` return; the node ends with the resolved value or the `{ error, type }` object.

## Tests (3)

- `test/explore/async.test.js` › async iterators › task whose async generator returns without yielding is not stuck loading
- `test/explore/async.test.js` › callback suspend › task: resolve() called synchronously in the setup fn keeps the resolved value
- `test/explore/async.test.js` › callback suspend › task: reject() called synchronously in the setup fn keeps the error object

Run with `bun test --conditions=src test/explore/async.test.js`.

## Fix

_Not fixed yet. The fix branch fills this in._
