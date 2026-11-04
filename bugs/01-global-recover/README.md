# 01: Throwing in a global `c` effect becomes a TypeError

Branch `fix/01-global-recover`, based on `fix/base`. Chain C (errors).
Next in the chain: `fix/07-error-wrapping`.

## What breaks

Any error thrown by an effect created on the global `c` is replaced by an engine TypeError, and the effect is never disposed. In async code (a spawn or an effect reacting to a task settling) the TypeError escapes from a promise callback as an uncaught exception, which can take the process down.

```js
c.effect(() => { throw new Error("boom"); });
// TypeError: Cannot read properties of undefined (reading 'length')
```

## Root cause

- `effect()` and `spawn()` on the global `c` give the node the Clock as its `_owner`.
- `Clock.prototype` defines `_flag`, `_level` and `_owner`, but not `_recover`.
- `_checkRecover` walks the owner chain and treats `_recover !== null` as "has handlers", so it reads `undefined.length`.

## What anod should do

- An unowned effect has no recover handlers. An error it throws is wrapped as `{ error, type: FATAL }`, the effect is disposed, and the error is rethrown to whoever triggered the run (the creator or the writer), exactly as for an effect under a root with no handlers.
- The Clock must look like an owner with no handlers to every walker of the owner chain.

## Tests (2)

- `test/explore/ownership.test.js` › error propagation › an unowned effect that throws on creation surfaces a FATAL error
- `test/explore/ownership.test.js` › error propagation › an unowned effect that throws on re-run is disposed

Run with `bun test --conditions=src test/explore/ownership.test.js`.

## Fix

_Not fixed yet. The fix branch fills this in._
