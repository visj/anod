# 05: A cycle between pending computes hangs the process

Branch `fix/05-cycle-hang`, based on `fix/04-weak-deps`. Chain D (graph).
Next in the chain: `fix/20-options`.

## What breaks

Two computes that read each other (each the other's `dep1`) hang `checkRun` forever when pulled after an upstream write. The test runs the scenario in a child process with a timeout so the suite still terminates.

```js
const a = c.compute((cx) => cx.val(b) + cx.val(y));
const b = c.compute((cx) => cx.val(a));
s.set(2); a.get(); // never returns
```

## Root cause

- `checkRun`'s fast descent follows `dep1` links while the dependency is pending, pushing onto `CSTACK` with no record of which nodes are already on the stack.

## What anod should do

- anod does not have to support cycles, but it must never hang. Pulling a cycle terminates, ideally by throwing (or settling the node into an error) that names a cycle, like the existing "Runaway cycle" error for writes.

## Tests (1)

- `test/explore/graph.test.js` › cycles › a cycle between pending computes does not hang checkRun

Run with `bun test --conditions=src test/explore/graph.test.js`.

## Fix

_Not fixed yet. The fix branch fills this in._
