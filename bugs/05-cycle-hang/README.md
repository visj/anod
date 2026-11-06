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

### What changed

- **`checkRun`**: each of its three push sites (fast descent, dep1 descent, `_deps[i]` descent) now reads `if (++CTOP === mark) { mark = checkCycle(base); }` instead of `CTOP++`. `mark` is a local, loaded once per call from `CMARK`.
- **`CMARK`** (new module-level number, starts at 1024): the stack depth at which the next cycle check runs. It is a high-water mark: after an acyclic check it doubles past the depth reached, so only a walk deeper than any before it, or a cycle, ever reaches it.
- **`checkCycle(base)`** (new, rare path): an acyclic walk never has a node on `CSTACK[base..CTOP)` twice, because that would be a path from the node back to itself. The function marks each node in that region with `FLAG_VISIT` (bit 29) and stops at the first node already marked, then clears the marks it set. It allocates nothing.
  - On a repeat, it nulls the stack region, restores `CTOP = base` and throws `new Error("Cycle detected")`.
  - Otherwise it raises `CMARK` to twice the current depth and returns it.
  - A walk that descends forever must reach the mark: it runs out of nodes it can finalize, so it only pushes. The marks double, so the region eventually holds more entries than there are distinct nodes, and a repeat is certain. Cycles longer than the first mark are therefore found too, at a later mark.

### Behavior decisions

- **Throw, rather than settle the nodes into an error.** This mirrors the "Runaway cycle" error for writes.
  - When the cycle is reached from inside a node's fn (`c.val()` → `_refresh` → `checkRun`), the existing catch in `_update` turns it into that node's FATAL error, so it flows through the normal error model.
  - From a top-level `.get()`, it reaches the caller.
  - The stacked nodes stay `PENDING`, so pulling the same cycle again throws again, and never hangs.
  - Settling every stacked node into an error by hand would bypass `_update`, cleanups and task settlement. That is a lot of new surface for a case anod does not support.
- **For maintainer review:** when the cycle is first hit by an effect's pre-run `needsUpdate` in `flushEffects`, or by the `COMPUTES` phase, the error is thrown outside those loops' `try`. It escapes the flush (`s.set()` throws) instead of reaching the effect's `recover`. Engine state after an error escapes a flush is bug 06's domain (chain A), and a hang was strictly worse.
- Only `checkRun` needed the check. The recursive paths (`checkSingle`, `needsUpdate` → `_update` → fn → `val`) always reach a node with more than one dep inside the cycle: the node through which the cycle is notified has an outside dep, so it is not `FLAG_SINGLE`. They then hand off to `checkRun`, or are bounded by the JS stack.
- No false positives: a repeat on the stack is a real dependency cycle. Deep acyclic chains of any length still work. The 5000-deep explore test passes, with three scans in total (at 1024, 2048 and 4096), after which `CMARK` is 8192 and later pulls scan nothing.
- `CMARK` and `checkCycle` are not exported from `anod/internal`, like the other internal helpers, so `types/internal.d.ts` is unchanged.

### Test expectations changed

None.

### Other groups

No other group's tests changed state. `test/explore` goes from 83 to 82 failures, exactly the cycle test. Extra probes (not committed):
- A cycle through `a._deps[0]` and `b._dep1` (main-loop descents, not the fast descent) hangs on `fix/04-weak-deps` and throws "Cycle detected" here.
- A 3000-node cycle (longer than the first mark) is detected.
- A cycle read by an effect, and a pull of a node downstream of a cycle, terminate.
- `CTOP` is back to 0 and `CSTACK` holds no references after every throw.

### Hot paths touched

- **`checkRun`**: one module-variable load (`CMARK`) per call, and `CTOP++` became `++CTOP === mark` at the three push sites: a compare of a register-held local per push, no extra memory write. `checkCycle` runs only when a walk is deeper than any walk before it (O(max depth) in total over the program's life) or on a cycle.
- `checkSingle`, `needsUpdate`, `notify`, `_update` and the flush loops are untouched.
- **Memory:** no node fields were added, and the scan allocates nothing. `FLAG_VISIT` is set only during a scan.
