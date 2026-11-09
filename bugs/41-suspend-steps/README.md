# 41: Callback suspends can't chain, adopt, or wait on promises, and an async write hides its loading

Tests and fix on `feat/suspend-all`. Found by probes for [design/katode.md](../design/katode.md) §15.1, §15.2 and §15.4.

## What breaks

**A suspend in a callback settles the run twice.** `c.suspend(a, (x) => { c.suspend(b, (y) => x + y); })` should settle with `x + y`.

- With `b` settled, the inner callback ran at once (the "continuation" branch of `suspendTo`) and settled the task with `x + y`. Then the outer callback returned `undefined`, which settled it again and won. No error.
- With `b` loading, the outer callback's `undefined` was held on the `HELD` stack, because the inner suspend had set FLAG_SUSPEND, and `_update` then cleared FLAG_CALLBACK without taking it. The entry stayed on the stack.
- With `a` loading, the callback ran from `relay()`, while FLAG_SUSPEND and FLAG_LOADING were still set, so the inner suspend threw `SUSPEND_TWICE` and failed the task.

**A callback's promise becomes the value.** A task whose callback returns a promise settles with the promise object, where `.then` would adopt it.

**Promises and plain values in `suspend` break.**

| Call | Before |
| --- | --- |
| `await c.suspend([p1, p2])` | fails with `TypeError: … 'length'` |
| `await c.suspend([loadingTask, p])` | never settles, no error |
| `c.suspend([p], onResolve, onReject)` | `onReject` gets the `TypeError` |
| `c.suspend(p, onResolve, onReject)` | treats the promise as a settled task with no value |
| `await c.suspend(5)` | returns `undefined` |

`_suspendArray` and `_suspendTask` treat every input as a node: a promise has no `_flag`, so it looks settled with no value, and subscribing to it fails.

**An async write doesn't say it's loading.** `r.set(fn)`, where `fn` returns a promise or suspends, makes `r` loading without notifying anyone. A reader of `c.pending(r)` runs again only when `r` settles, so it never sees `true`. `c.set(r, value, fn)` notified only because the optimistic value changed.

## What anod should do

A run is a chain of steps, each one a callback suspend:

- A suspend made in a callback is the run's next step. The callback's return value is ignored, and the run settles with the last step's result.
- A promise that a task's or spawn's callback returns is adopted, as one its fn returns is: the run stays loading and settles with what it gives. A sync node keeps it as its value. A returned task or resource is the value, as it is from the fn: a callback that wants to wait for one suspends on it, so nothing is waited on that isn't named in a suspend.
- A step whose input has settled runs at once, in the same run. A chain of settled steps runs in constant stack.
- Each step is guarded: a re-run or dispose drops the steps not reached. A step that throws fails the run and drops what it had started.
- Two suspends in the same fn or callback still throw.

`suspend` takes a promise, a task, a resource, or an array of any of them, in both forms. A plain value passes through. A promise is waited on as a task would be, so an array with one always takes at least a microtask.

An async write that makes a resource loading notifies its readers, unless it was already loading.

## Tests (39)

`test/suspend-step.test.js`:

- **steps (15):** settled and loading steps in each order, a 20000-step chain, re-run and dispose mid-chain, errors with and without `onReject`, a step that throws after suspending, two suspends in one step, reads in a later step, a re-run after a chain with a loading step (the leaked `HELD` entry), and a spawn's steps with `finalize`.
- **adoption (8):** a returned promise, a rejecting one, an async callback, a stale run's promise, a spawn, a sync compute that keeps the promise, a returned task or resource that is the value (from a callback and from the fn), and a callback that follows the task it picks by suspending on it.
- **promises and values (11):** each row of the table above, rejection as a `Defect`, the microtask limit, a stale run, and that the caller's array is left as it was.
- **resource loading (5):** `set(fn)` with a promise and with a callback suspend, a write while already loading, a write in a batch, and a sync result.

`test/resource.test.js` › "resource with custom equality skips notification when equal" now expects the loading notice.

`test/types.ts` (checked by `tsc -p .`, not run): the inferred value of a task built from steps, one step and two, a branch that returns a value or suspends, `onReject`, an async callback, an array, the setup-fn form, a step not returned, a bound task, and spawns in each form.

## Fix

- **`runStep(node, fn, value)`** runs a callback as `STEP` (a module variable), loading, with FLAG_CALLBACK set, so a suspend in it is held like one made in the fn. After the callback returns, it loops: a held step runs next, a loading one returns `REGRET` (the run waits, and `relay()` resumes it), and a returned promise or async iterator goes through `startAsync`, as the fn's does. The three places that ran callbacks (the held paths of both `_update`s and `relay`) call it. The held paths moved into `settleHeld` and `settleHeldEffect`, so `_update` got shorter.
- **`dropStep(node)`** clears what a throwing step started: its held entry and its waits.
- **`suspendTo`** always holds a settled input, in the fn or in a step. The branch that ran the callback at once is gone; a callback suspend while loading outside a step (after an `await`) throws `SUSPEND_TWICE`.
- **`suspend()`** doesn't set FLAG_SUSPEND for a promise-form suspend inside a step, so an async callback's awaits are its own, and returns a plain value as it is.
- **`toSender` / `toSenders`** turn a promise into a loading resource that no one owns, settled through `resolvePromise`, and a plain value into a settled one. `_suspendArray` converts the array up front (it is returned as it is when it has neither), and `suspendTo` converts a single input. Everything after that is the existing node path: the rescans, guards and error delivery.
- **`startLoading(node)`**: `_runAsync` calls it when an async write leaves a resource loading that wasn't. It notifies the readers and flushes. They can't be told apart from the readers of the value, which run again too.

**Types:** a callback-form suspend returns `Step<T>`, a type with no members that is `undefined` at run time. `T` is `Outcome` of what the callbacks return: a returned step's value, what a promise gives, or the value. `task()` infers its value from a returned `Step<U>` as from a `Promise<U>`; a fn that returns nothing takes the value as `task<U>`. `spawn()` takes a fn in either form. `Settled`, `Step` and `Outcome` are exported.

No new flags and no node fields. All of it is on cold paths: the suspend calls, the async tails of `_update`, `relay` and `_runAsync`.
