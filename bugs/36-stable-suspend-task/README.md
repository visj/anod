# 36: `c.suspend(task)` after `c.stable()` drops the task

Tests on `fix/23-hardening`. Fixed on `fix/24-slim-cold`. Found during the simplification scan.

## What breaks

A node that calls `c.stable()` in a re-run and then awaits a settled task with `c.suspend(task)` loses that task as a dependency. It no longer re-runs when the task changes.

```js
const outer = c.task(async (cx) => {
  runs++;
  cx.val(trig);
  if (runs > 1) cx.stable();
  return await cx.suspend(t);
});
// after a re-run that called stable(), t is gone from outer's deps;
// t changing no longer re-runs outer
```

## Root cause

`c.stable()` sets FLAG_FREEZE on a dynamic run, so the reads in the rest of that run are still tracked and the deps freeze as they are at its end (`src/internal.js:1125`). `val()` (`:536`) and `rejected()` (`:1957`) test `FLAG_STABLE | FLAG_SETUP | FLAG_FREEZE`. `track()` (`:3387`), which `c.suspend(task)` uses on its fast path, and `_readAsync` (`:882`) test only `FLAG_STABLE | FLAG_SETUP`. With FLAG_STABLE already set, `track()` returns without stamping the task, so `patchDeps` treats it as unread and removes it.

## What anod should do

Every tracked read in a run honors FLAG_FREEZE the same way. Until the run that called `c.stable()` ends, `c.suspend(task)` tracks the task like `c.val(task)`.

## Tests (1)

- `test/explore/hardening.test.js` › 36 › a task that calls c.stable() keeps the task it suspends on afterwards

Run with `bun test --conditions=src test/explore/hardening.test.js`.

## Notes for the fix

Four places decide on their own whether a read tracks or subscribes, each with a slightly different mask: `val()`/`_readAsync`, `rejected()`, `track()`, and `subscribeArray`. One shared helper would fix this and give bug 24's fix a single place to land (see the simplification report).

## Fix

`track()` and `_readAsync` test `FLAG_STABLE | FLAG_SETUP | FLAG_FREEZE`, like `val()` and `rejected()`. Both are only reached from async paths. The shared tracking helper the notes suggest is part of the hot-path group 3 and is still open.

**Update (2026-11-08):** `c.stable()` was removed. `STABLE` is now a creation option and FLAG_FREEZE is gone, so a node can no longer turn stable partway through a run, and this bug can no longer happen. Its test in `test/explore/hardening.test.js` now checks that a `STABLE` task links the task it suspends on in its first run.
