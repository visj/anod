# 15: An absorbed upstream change still tears down async work

Branch `fix/15-absorbed-changes`, based on `fix/base`. Chain E (async settling).
Next in the chain: `fix/16-unchanged-settle`.

## What breaks

When a dependency is notified as *pending* but turns out not to have changed (a compute recomputes to the same value), an in-flight task or spawn is torn down anyway:

- A spawn waiting on a loading task loses its waiter and hangs forever.
- The node's `c.controller()` is aborted although it neither re-ran nor was disposed; the task settles as a FATAL AbortError.
- A loading task pulled through the absorbed change has its activation token moved, so its result is thrown away and it stays loading forever.

```js
const sign = c.compute(s, (v) => v > 0);
c.spawn(async (cx) => { cx.val(sign); await cx.suspend(loadingTask); log("done"); });
s.set(2); // sign stays true, yet the spawn never logs "done"
```

## Root cause

- `EffectProto._receive` and `ComputeProto._receive` call `resetChannel` on any PENDING notice, before anyone knows whether the dependency changed.
- `checkSingle` / `checkRun` set `node._time = time` on a loading task, which invalidates the live activation's time token.

## What anod should do

- In-flight async work is only cancelled when the node actually re-runs or is disposed. A pending notice that resolves to "nothing changed" leaves waiters, controllers, defer snapshots and activation tokens alone.

## Tests (3)

- `test/explore/async.test.js` › absorbed upstream change while awaiting › spawn awaiting a loading task survives an upstream change a compute absorbs
- `test/explore/async.test.js` › absorbed upstream change while awaiting › task controller is not aborted when an upstream compute absorbs the change
- `test/explore/async.test.js` › absorbed upstream change while awaiting › loading task can still settle after a subscriber pulls it through an absorbed change

Run with `bun test --conditions=src test/explore/async.test.js`.

## Fix

_Not fixed yet. The fix branch fills this in._
