# 23: A plain write leaves a resource errored

Tests on `fix/23-hardening`. Found on `master` after `fix/all` was merged. Fixed on `fix/24-slim-cold`, together with bug 26.

## What breaks

After an async write fails, a plain write to the resource stores the new value but keeps the error flag. `r.error` stays true, and a reader using `c.val(r)` gets the new value thrown at it: a raw number, not a `Defect`.

```js
const r = resource(1);
r.set(() => { throw new Error("boom"); });
r.set(5);
r.error;  // true, expected false
r.get();  // 5
c.effect((cx) => cx.val(r)); // throws 5
```

The same happens for `batch(() => r.set(v))` and `r.post(v)`.

The async form already clears the error (`resource.test.js` › "error cleared on next successful set"), so only the plain forms are affected.

## Root cause

FLAG_ERROR is cleared in `_runAsync` (`src/internal.js:677`), and nowhere on the plain write paths:

- `set` at idle, in the changed branch (`src/internal.js:619`), only writes `_value` and notifies.
- `assign` (`src/internal.js:724`), the drain handler for batched and posted writes, does the same.
- `contextSet` at idle (`src/internal.js:2396`) has the same gap. A `c.set(r, v)` from a node therefore leaves the error too.

`val()` throws `sender._value` whenever FLAG_ERROR is set. With the flag left behind, the thrown value is the user's plain value.

## What anod should do

Any successful write to a signal or resource replaces its error state. A plain write clears FLAG_ERROR and notifies, even when the new value equals the error value (the error state itself changed). The equality check should not decide this case: comparing a value with a `Defect` is meaningless.

## Tests (5)

- `test/explore/hardening.test.js` › 23 › plain set() after a failed async write clears the error
- `test/explore/hardening.test.js` › 23 › c.val() of a resource rewritten after an error returns the new value
- `test/explore/hardening.test.js` › 23 › a batched plain write clears the error
- `test/explore/hardening.test.js` › 23 › a posted plain write clears the error
- `test/explore/hardening.test.js` › 23 › a plain write to an errored resource does not call equal with the Defect (added with the fix)

Run with `bun test --conditions=src test/explore/hardening.test.js`.

## Notes for the fix

- Only `FLAG_ASYNC` nodes (resources) can be errored, so the extra test belongs inside a branch that plain signals skip. One option is to add FLAG_ERROR to the mask that already routes a loading resource to `_settle` in `set` (`this._flag & FLAG_LOADING`). Then a plain write to a loading or an errored resource goes through `_settle`, which clears both flags. A plain signal still does one AND and one branch.
- `assign` and `contextSet` need the same treatment. Bug 26 touches the same three paths for supersession, so the two fixes should be done together.

## Fix

The resource write paths were split out of `set()`, and every plain resource write now goes through one function, `writeResource()`. See bug 26 for the split itself; for this bug, the relevant rule is:

- A plain write that ends a load or an error is a change by itself. It clears `FLAG_LOADING | FLAG_ERROR`, writes the value, resumes the waiters (`settleNotify`) or notifies the subscribers, whatever the value. The equality function is not called, so it never sees the `Defect`.
- Otherwise the write compares as before: the equality function, or `!==`, or always changed for `resource(v, false)`.
- The async form `r.set(v, fn)` also treats an errored resource as changed without calling the equality function: the idle path in `CellProto.set`, and the batched path through `asyncAssign`, where `assign()`'s `FLAG_MUTABLE` test became `FLAG_MUTABLE | FLAG_ERROR`. The mask folds to one constant in dist, so plain signals pay nothing.
