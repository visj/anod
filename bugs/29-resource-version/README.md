# 29: `c.version()` in a resource callback throws

Tests on `fix/23-hardening`. Fixed on `fix/24-slim-cold`.

## What breaks

The README's "Manual versioning with `c.version()`" section shows `c.version()` inside a resource callback, where `c` is the resource:

```js
const likes = resource(0);
likes.set(likes.get() + 1, async (c, optimistic) => {
  const version = c.version(); // TypeError: c.version is not a function
  ...
});
```

The call throws a TypeError, and the resource settles with a FATAL error.

## Root cause

`version()` is defined on ComputeProto and EffectProto only (`src/internal.js:1985`). CellProto has none, and `ResourceContext` in `types/internal.d.ts` only declares `suspend`.

## What anod should do

This is the README's own example, so either the code or the README is wrong:

- **Add it (recommended):** `CellProto.version` returns `_time`, the token that resource supersession already bumps for each activation. That is exactly "the current activation's sequence number", and the server-ordering use case in the README is a resource write. Declare it in `ResourceContext`.
- **Change the README:** move the example to a task or spawn.

## Tests (1)

- `test/explore/hardening.test.js` › 29 › c.version() is available in a resource callback, as the README shows

Run with `bun test --conditions=src test/explore/hardening.test.js`.

## Notes

If bug 26 is fixed by bumping `_time` on every plain write, `rc.version()` also tells an activation whether a plain write superseded it. That suits the README's "check if we've been invalidated" pattern.

## Fix

`CellProto.version` shares the `version()` of computes and effects and returns `_time`, the token each async write bumps. `ResourceContext` in `types/internal.d.ts` declares it.
