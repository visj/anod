# 15. What Katode asks of anod

Part of the [Katode design](README.md). Katode runs on anod in the browser ([§6.3](browser.md#63-anod)), and extends it from outside: it never changes anod's code, and anod's author decides what anod becomes. This file lists the changes to anod that would remove machinery from Katode or unblock what it can't build today. For each one, it gives what anod does now, the change, and Katode before and after: what Katode is forced to look like if anod stays as it is, and what it can look like if the change lands.

What anod does now was checked on 2026-11-08 against anod 0.9.1 (commit `7c83788`, with uncommitted work in `src/internal.js`), by small programs run with `bun test --conditions src`. A claim marked *probed* comes from one of them.

| | Change | What it unblocks in Katode |
|---|---|---|
| [§15.1](#151-steps-in-a-run) | A run is a chain of callback steps | Tasks that await what they compute, client fns that return futures, spawns with steps (async handlers); `future/await` goes away |
| [§15.2](#152-loading-when-an-async-set-starts) | A resource tells its readers when an async `set` starts | `x.is(LOADING)` for a resource a client fn refreshes |
| [§15.3](#153-owned-roots) | An owner that isn't an effect, in the public API | `katode/client` and `katode/dom` stop subclassing anod's `Root` and reading its private fields |
| [§15.4](#154-smaller-requests) | Ambient reads, a resource that starts failed, `c.signal`, promises in a `suspend` array | Smaller workarounds |

The first is the one that matters most: without it, the browser half of [§14](async.md#14-futures-and-streaming) stays where M43 left it.

## 15.1 Steps in a run

### What anod does now

A task or a spawn takes a `suspend` with callbacks once per run: `c.suspend(senders, onResolve, onReject)`. When the senders have settled, `onResolve` runs, and a task settles with what it returns. That's what Katode's tasks compile to today ([§14.9](async.md#149-whats-built)), and it's enough for a task whose awaits can all start when it does.

It isn't enough for anything that awaits a value it computed first. *Probed*:

- **A callback that returns a promise** settles the task with the promise itself, as its value. anod doesn't adopt it.
- **A callback that calls `suspend` again** settles the task twice, silently. The inner `suspend` settles it with its callback's result, then anod settles it again with the outer callback's return value, `undefined`, which wins. In `internal.js` both the held path (around line 2778) and the continuation in `suspendTo` (around line 1768) call `_settle(result)` as soon as the callback returns. If the inner senders were still loading, the task would settle with `undefined` first and with the inner result later. No error is thrown in either case, so this is a bug even if the feature below doesn't land: it should at least be `SUSPEND_TWICE`.
- **An array of promises** in `suspend` fails inside anod, with `TypeError: undefined is not an object (evaluating 'subs.length')`, and the task is rejected with that.

The promise form does chain: `c.task(async c => { const a = await c.suspend(x); return await c.suspend(f(a)); })` works, guarded at each `await`. But each step costs a microtask and a promise, even when what it waits for has settled. Katode needs a settled input to give a settled result in the same run (see below), so it uses only the callback form ([§14.6](async.md#146-the-browser)).

### The change

A run of a task or a spawn becomes a chain of steps, each one a callback `suspend`:

- **A callback that calls `suspend` again continues the run.** The new `suspend` is the next step, the outer callback's return value is ignored, and the run settles with the last step's result.
- **A callback that returns a promise, a task or a resource continues the run too.** The run stays loading, and settles with what that gives, or fails with its error.
- **A `suspend` array takes promises** beside tasks and resources, so one step can wait for two client fns' calls at once.
- **A step whose inputs have settled runs at once, in the same run**, as a single callback `suspend` does today. A chain whose futures have all settled runs synchronously from start to end, with no microtask.
- **Every step is guarded.** A run that's replaced or disposed drops the steps still to come, as it drops a callback today. A step's reads are tracked as reads after an `await` are.
- **Two `suspend`s in the same step stay an error.** Parallel waits are one array.
- **An error in a step** goes to that step's `onReject`, or fails the run as a throw would.

`startAsync`, which resources use for a returned promise, and the path that adopts the promise an `async` task fn returns, look reusable for the second point.

### Why the promise form isn't enough

Katode could write every multi-step task as an `async` function today. It doesn't, for three reasons:

- **Hydration.** The browser must reach the same arm as the server, in the same run as it attaches ([§5](browser.md#5-hydration)). The server's futures arrive settled in the page's state, so a task over them is settled at once with callbacks. With promises it's loading until a microtask later, so a `switch` on it shows `_` where the server rendered `Ok`, and the hydration doesn't match. The task `let t = task { (plan.await.fast ? quick : slow).await };` over three server futures shows this: it awaits a future it chose by a value, so it takes two steps, and both have settled.
- **Refreshing.** A task that only combines values that have settled would turn loading for a microtask every time it runs again, so `x.is(LOADING)` flickers, and every part that reads it runs twice.
- **Cost and style.** A promise and a closure per step per run, and two kinds of generated code: callbacks for one step, `async` functions for more. Katode's runtime has no promises of its own ([§14.6](async.md#146-the-browser)).

For a `spawn`, which is an action and is async anyway, the promise form is an acceptable stopgap. For a `task` it isn't.

### The example

The checkout from §14, in TypeScript client fns:

```ts
export function getShipping(to: Address, revision: number, c: Scope<Quote[]>): Promise<Quote[]> {
  return fetch(`/shipping?${query(to, revision)}`, { signal: c.signal }).then((r) => r.json());
}
export function getTax(quote: string, c: Scope<number>): Promise<number> { … }
export function getDiscount(quote: string, coupon: string, c: Scope<number>): Promise<number> { … }
```

#### After: what Katode can be with the change

A task reads as the computation it is: the compiler groups its awaits into steps by what each one needs, and each step's awaits start together.

```ktml
client fn getShipping(to: Address, revision: int): Future<Quote[]>;
client fn getTax(quote: string): Future<int>;
client fn getDiscount(quote: string, coupon: string): Future<int>;

template Checkout(mut order: Order) {
  let total = task {
    let quote = choose(getShipping(order.address, order.stockRevision).await, order.method);
    quote.total(getTax(quote.id).await, getDiscount(quote.id, order.coupon).await)
  };
  {switch (total) {
    Ok(t) => <button>Pay {money(t)}</button>,
    Err(_) => <p role="alert">We couldn't calculate your total.</p>,
    _ => <button disabled>Calculating…</button>,
  }}
}
```

It compiles to one anod task with two steps, and the `switch` to one branch on it:

```js
const total = c.task((c) => {
  const o = c.val(order);
  c.suspend([getShipping(o.address, o.stockRevision, c)], ([quotes]) => {
    const quote = choose(quotes, c.val(order).method);
    c.suspend(
      [getTax(quote.id, c), getDiscount(quote.id, c.val(order).coupon, c)],
      ([tax, discount]) => Quote.total(quote, tax, discount),
    );
  });
});
```

anod guards each step. A change to `order.address` runs the task again, aborts the requests in flight through `c.signal`, and drops the steps the old run hadn't reached. `total` is loading from the first request to the last answer, and `Ok` keeps its last value meanwhile ([§14.6](async.md#146-the-browser)).

A spawn with steps, such as one that saves an order as it's edited, is the same chain:

```ktml
spawn {
  let saved = save(order).await;
  receipt = fetchReceipt(saved.id).await;
}
```

```js
c.spawn((c) => {
  c.suspend([save(c.val(order), c)], ([saved]) => {
    c.suspend([fetchReceipt(saved.id, c)], ([r]) => receipt.set(r));
  });
});
```

What Katode drops or gains:

- **The language:** `future/await` and the rule that a task's awaits start together ([§14.9](async.md#149-whats-built)) go away. A client fn that returns a future stops being `future/position`.
- **The page's code:** `$k.task(c, deps, fn)`, which takes one array today, takes one array per step. Nothing else changes in `katode/client`. There are no extra nodes and no version checks of Katode's own.
- **Async handlers** (M26) are spawns with steps, each step guarded, so removing a row drops what its save would have done next.
- **The server:** its backends would need tasks with steps too: the IR's `Derive`, `KatodeFuture.Derive` in C# and the derive closures in Rust each wait once today. That's Katode's own work, and doesn't depend on anod.

#### Before: what Katode is forced to look like without it

**The language keeps `future/await`.** Every future that needs a value the task computes is a task of its own, so the one task above is five:

```ktml
template Checkout(mut order: Order) {
  let quotes = task { getShipping(order.address, order.stockRevision).await };
  let quote = task { choose(quotes.await, order.method) };
  let tax = task { getTax(quote.await.id) };                         // a task whose value is a future
  let discount = task { getDiscount(quote.await.id, order.coupon) };
  let total = task { quote.await.total(tax.await, discount.await) };
  {switch (total) { … }}
}
```

Each `let` exists only so that each task waits once, not because the reader thinks of `quotes` or `tax` as values of their own.

**Three of the five can't be one anod task each.** `quote` and `total` combine values, so each is one callback `suspend`. But `quotes`, `tax` and `discount` each call a client fn and take its future as their value. With today's anod, returning `getTax(…)`'s promise from the callback would make the promise the task's value. So Katode would build each call itself, from a gate, a resource and an effect that drives it:

```js
// tax = task { getTax(quote.await.id) }, without steps in anod.
const taxInput = c.compute((c) => {
  if (c.pending(quote)) return WAITING;              // the gate: wait for quote
  const err = c.rejected(quote);
  return err !== null ? failure(err) : c.val(quote).id;
});
const tax = resource(undefined);                     // the call's future
c.effect(taxInput, (id, c) => {                      // runs the call each time its input changes
  if (id === WAITING) return;                        // tax isn't loading while quote is
  if (isFailure(id)) {                               // forward quote's error by hand
    tax.set(() => { throw id.error; });
    return;
  }
  const signal = c.controller().signal;              // the effect's run aborts the old call
  tax.set((r) => r.suspend(getTax(id, { signal, suspend: r.suspend.bind(r) })));
});
const taxLoading = (c) => c.pending(quote) || c.pending(tax);   // what is(LOADING) must read
```

That means Katode reimplements, for every call a task makes:

- **The gate:** waiting for the operands' state, which anod already does for a `suspend`.
- **Loading:** `tax` isn't loading while `quote` is, so `x.is(LOADING)`, the `switch`'s `_` arm and every later task must look at both, through a loading function per call.
- **Errors:** `quote`'s error doesn't reach `tax`, so it's forwarded by hand.
- **Aborting:** a `Scope<T>` stitched together from the effect's controller and the resource's `suspend`.
- **Ownership:** the resource isn't owned by anything, so a late answer after the branch is gone must be checked by hand.
- **Staleness:** the resource's own guard covers one call, but the step from `quote` to `tax` is Katode's.

It also meets [§15.2](#152-loading-when-an-async-set-starts): `tax.set(fn)` doesn't tell the parts reading `tax` that it's loading.

The alternative is the promise form for these three tasks, with the costs above. Spawns would use it too, until anod has steps.

## 15.2 Loading when an async set starts

### What anod does now

*Probed:*

- `c.set(r, optimistic, fn)` writes the optimistic value, which tells `r`'s readers, so a reader of `c.pending(r)` runs again and sees `true`.
- `r.set(fn)`, where `fn` returns a promise or suspends, makes `r` loading without telling anyone. A part reading `c.pending(r)` runs again only when `r` settles, so it never sees `true`.

`r.set(fn)` is the natural form for a TypeScript client fn that refreshes a `resource` field, so `x.is(LOADING)` ([§14.2](async.md#142-reading-a-future)) misses exactly the case it's for.

### The change

When an async `set` starts, `r` tells the readers that asked for its state, through `c.pending(r)` or `c.rejected(r)`. Readers of its value alone needn't run again, since the value hasn't changed. If anod can't tell the two apart, telling every reader is still correct, at the cost of value readers running once more.

### Before

`katode/client` keeps a signal beside each resource, which it sets around every async write it routes, and `$k.loading(x)` reads both:

```js
function setAsync(store, i, fn) {
  const r = store._v[i];
  const busy = loadingSignal(store, i);              // a signal(false) per resource field
  write(busy, true);
  r.set((c, prev) => {
    const p = fn(c, prev);
    p.then(() => write(busy, false), () => write(busy, false));   // and a stale run's answer?
    return c.suspend(p);
  });
}
const loading = (x) => TRACK.pending(x) || TRACK.val(loadingSignal(x));
```

It's a second source of truth for anod's own flag. It only covers writes that go through `katode/client`, so a client fn that calls `field(store, "shipping").set(fn)` itself bypasses it. And it needs its own staleness check, since an old run's answer would clear `busy` while a newer run is still loading.

### After

Nothing: `$k.loading(x)` stays `TRACK.pending(x)`, as M43 built it, and any `set` from anywhere shows.

## 15.3 Owned roots

### What anod does now

A page, a branch, a row and a client template instance each need an owner that isn't an effect: it owns the effects and computes made under it, is disposed with its owner, can be disposed alone when its row goes, and runs its effects after the effect that made it. anod's public API has roots, which have no owner, and effects, which have a function. So `katode/client` (`Owner`) and `katode/dom` (`Scope`) subclass `Root` from `anod/internal`:

```js
import { Root, addOwned } from "anod/internal";

function Owner(owner, level) {
  Root.call(this);
  this._owner = owner;                               // anod's private fields
  this._level = level;
}
Owner.prototype = Object.create(Root.prototype);
Owner.prototype._dispose = function () {             // overrides a private method
  let owned = this._owner !== null ? this._owner._owned : null;
  if (owned !== null && !this._owner.is(DISPOSED)) {
    owned.splice(owned.lastIndexOf(this), 1);        // leaves the owner's list by hand
  }
  disposeRoot.call(this);
};
function own(owner, level) {
  let child = new Owner(owner, level);
  if (owner !== null) addOwned(owner, child);
  return child;
}
```

- It reads and writes `_owner`, `_level`, `_owned` and `_dispose`. anod's `dist` build mangles these names (`_owned` becomes `l`, `_level` becomes `M`), so Katode works only against anod's sources (`--conditions src`), or in a build that applies anod's `mangle.json` to Katode too. This was easy to mistake for a bug while M43 was built: run without `--conditions src`, the tests fail inside `Owner._dispose`.
- Any change to these fields in anod breaks Katode without a type error, which is why [§6.3](browser.md#63-anod) pins the anod versions Katode's tests run against.
- anod now takes a disposed child effect out of its owner's list itself (*probed*). The gap is only an owner that isn't an effect.

### The change

An owned root in the public API, such as `c.root()`, on a root's or an effect's context:

- it belongs to the owner it's made under, and is disposed with it;
- disposed alone, it leaves its owner's list;
- its effects run after its owner's, as a child effect's do;
- it has the root context's `cleanup`, `recover` and factories.

### Before and after

Before: the code above, in both packages, plus the version pin. After:

```js
function own(owner) {
  return owner.root();
}
```

`katode/dom`'s `Scope` removes its event listeners in its `_dispose` override today. With an owned root, that becomes a `cleanup` on the root, and `Scope` stops being a subclass.

## 15.4 Smaller requests

**Ambient reads.** A store's fields are getters on plain objects ([§6.1](browser.md#61-stores)), so a part reading `cart.count` has no `c` to read through. `katode/client` keeps a global `TRACK`, set around every part by a wrapper:

```js
function tracked(fn) {
  return (c) => {
    let prev = TRACK;
    TRACK = c;
    try { return fn(); } finally { TRACK = prev; }
  };
}
function read(s, i) {                                // every field's getter
  return TRACK !== null ? TRACK.val(sig(s, i)) : peek(s, i);
}
```

That's a closure and a `try` per part, and a second notion of "the running node" beside anod's. If anod exposed the receiver that's running, such as `listener()`, the getter would read through it, and `tracked` would go. It goes against anod's explicit `c`, so it's the request Katode needs least.

**A resource that starts failed.** A future that failed on the server reaches the browser as `null`, and becomes a failed resource ([§14.6](async.md#146-the-browser)). Today that's `resource(undefined)` followed by `r.set(() => { throw … })`. An option to create a resource with an error would say what's meant.

**`c.signal`.** A getter for `c.controller().signal`, which creates the controller only when it's read. A client fn takes the context as `Scope<T>`, whose type has only `signal` and `suspend` ([§14.6](async.md#146-the-browser)). It's sugar: `c.controller().signal` works today.

**Promises in a `suspend` array.** This is part of [§15.1](#151-steps-in-a-run), but it stands on its own too. Today an array of promises fails inside anod with a `TypeError`. It should either work or throw an error that says what's wrong.

**Tasks that own nodes.** A compute or a task has no factories, so it can't make a node of its own. Without [§15.1](#151-steps-in-a-run), that's what a task calling a client fn would want. With steps, Katode doesn't need it.

## 15.5 Order

1. **Steps in a run ([§15.1](#151-steps-in-a-run)).** It unblocks client futures and async handlers, removes `future/await` from the language, and fixes the silent double settle that exists today.
2. **Loading when an async set starts ([§15.2](#152-loading-when-an-async-set-starts)).** Small in anod, and without it `x.is(LOADING)` needs a second flag in Katode.
3. **Owned roots ([§15.3](#153-owned-roots)).** Nothing is blocked, but it ends Katode's dependence on anod's private fields and mangled names.
4. **The rest ([§15.4](#154-smaller-requests))**, as convenient.

When one lands, the section it changes in [§14.6](async.md#146-the-browser), [§14.9](async.md#149-whats-built) or [§6.3](browser.md#63-anod) is updated, and the request moves to a note of what anod version provides it.
