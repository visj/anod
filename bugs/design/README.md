# Design questions from the second hardening round

These are cases where anod behaves consistently, but the README either doesn't say what should happen or says something that conflicts with an existing test or with another part of the design. Each one needs a maintainer decision before it can count as a bug or as intended. Each section has a repro, the conflicting sources, the options, and a recommendation.

**Status (2026-11-08):** all nine are decided (see the **Decision** paragraph in each section). D1, D4, D5, D7, D8 and D9 are implemented on `fix/24-slim-cold`, and so is D2, except waiting for locked children. D3 (start paused) is not implemented yet. D6, including how a lock holds its owners (A) and force quit (`dispose(true)`), goes with the lock rework and bug 25.

The real bugs from the same round are 23–34 in the index (`bugs/README.md`), with tests in `test/explore/hardening.test.js`.

## D1: A sync effect's `c.controller()` is released, not aborted, on re-run

```js
let ctrl;
c.effect((cx) => {
  cx.val(s);
  ctrl = cx.controller();
  window.addEventListener("resize", onResize, { signal: ctrl.signal });
});
const first = ctrl;
s.set(1);
first.signal.aborted; // false: the first listener is never removed
```

- **README:** the controller "is automatically aborted when the node re-runs or is disposed".
- **Sync computes** follow the README (`sync-channel.test.js` › "controller is aborted on re-run").
- **Effects:** `EffectProto._update` drops a completed activation's controllers without aborting them. Bug 19 kept this deliberately, because `async.test.js` › controller › "controller works with spawn" pins it for spawns ("Abort only happens when the spawn is actively loading").

The `{ signal }` pattern for listeners is the main reason to use a controller in a sync effect, and with the current behavior it leaks one listener per re-run.

**Options:**
- **(a)** Abort on every re-run and on dispose, for effects too: call `resetChannel` from `EffectProto._update` and change the spawn test.
- **(b)** Keep the current behavior and document that an effect's controller is only aborted while its activation is in flight, or on dispose.

**Recommendation:** (a). It is what the README promises, it matches computes, and it is what `{ signal }` users expect.

**Decision:** (a). An effect's controllers are aborted on every re-run and on dispose, like a compute's. `async.test.js` › controller › "controller works with spawn" has to change.

**Implemented** on `fix/24-slim-cold`: `EffectProto._update` calls `resetChannel` in its existing FLAG_CHANNEL branch. The spawn test now expects the abort, and `hardening.test.js` › D1 covers the sync effect.

## D2: Cleanups run before owned children are disposed

```js
c.effect((cx) => {
  const conn = open();
  cx.cleanup(() => conn.close());
  cx.effect((cx2) => {
    cx2.cleanup(() => conn.send("bye")); // runs after conn.close()
  });
});
```

On re-run (`_update`) and on dispose (`_dispose`), the parent's cleanups run first, then its owned children are disposed. The README justifies the reverse order of cleanups by stack unwinding: "resources acquired later are released first". A child created after the cleanup was registered acquired its resources later, so by that rule it should be released first. Solid disposes owned children before running the owner's cleanups.

**Options:**
- **(a)** Dispose owned children first, then run the cleanups.
- **(b)** Keep the current order and document it.

**Recommendation:** (a). It follows the README's own rationale, and children can safely use the parent's resources in their cleanups.

**Decision:** (a), children first. A node's cleanups run once all its children are gone. That includes locked children, whose disposal is deferred (see D6). Strict LIFO, (c) below, was rejected: it needs the relative order of cleanups and children stored per node. A cleanup that needs an owned compute's value keeps it in a plain variable. Reading the compute itself throws, since it is already disposed (D4).

**Implemented** on `fix/24-slim-cold`, with bug 35. The children go first on re-run (`EffectProto._update`, through `clearRun` when a node has both) and on dispose (`EffectProto._dispose`, `RootProto._dispose`), and a throw in either step still runs the other. A teardown error on re-run reaches the recover handler of the run being torn down. **Not done:** waiting for locked children. A locked child is only marked by its parent's teardown, so the parent's cleanups still run while it finishes. That belongs to D6 and the lock work (bug 25), which are on hold.

### Analysis

- **Today:** anod runs the parent's cleanups (in reverse), then disposes the children (in reverse). That is the S.js order (`node_modules/s-js/dist/S.js:430` runs cleanups, then owned, both forward). Solid 2.0 reversed it (`disposeChildren` disposes the children, then `runDisposal` runs the node's own disposers).
- **What (a) breaks:** a parent cleanup that reads something the parent owns. This works today and would fail under (a):

  ```js
  c.effect((cx) => {
    const total = cx.compute((cx) => sum(cx.val(items)));
    cx.cleanup(() => saveDraft(total.get()));
  });
  ```

  Under (a), `total` is already disposed when the cleanup runs, and `.get()` on a disposed compute currently returns `null` silently.
- **(c) Strict LIFO:** treat cleanups and children as one stack in registration order, and unwind it in reverse. A resource can only be referenced after it exists, so registration order follows the dependencies, and its reverse always tears down dependents before what they depend on. This handles both examples: the connection cleanup was registered before the child that uses it, and the `saveDraft` cleanup after the compute it reads. Cost: the relative order has to be recorded. Only an owner that registers a cleanup after creating a child needs extra state. Nodes with only cleanups or only children keep today's fast path.
- **Locked children (with D6):** a locked child outlives its parent's teardown under every order, because disposing it only marks it. The parent's cleanups then release resources that the still-running child may use. Either the child has to own what it needs across the lock, or the parent's teardown waits for its locked children.
- **Errors:** whatever the order, a throw in one step must not skip the other. That is already a bug on the re-run path: bug 35.

## D3: Children created under a paused owner are not paused

```js
const r = root((r) => { /* ... */ });
r.pause();
r.effect((cx) => { cx.val(s); log.push("child"); }); // created while paused
s.set(1); // the child runs, although its owner is paused
```

The README says `pause()` "recursively pauses all owned child effects", which describes the children that exist at the time of the call. It doesn't say whether a child created later under the paused owner should start paused.

**Options:**
- **(a)** A child created under a paused owner starts paused and is resumed with it.
- **(b)** Only existing children are paused, as now. Document it.

**Recommendation:** (a). "This subtree is paused" is the more useful invariant, for example for an offscreen view that is still being built.

**Decision:** (a). A child created under a paused owner starts paused and is resumed with it.

## D4: A compute whose dependency was disposed

A dep is disposed while a compute that reads it stays alive (a different owner disposed it):

- **Bound compute:** `.get()` returns a FATAL ILLEGAL_READ `Defect` and switches the compute into an error state. `c.val()` from another node returns the cached value until someone calls `.get()`.
- **Unbound compute:** keeps its cached value forever and never re-runs, since the disposed dep never notifies.

So the same situation yields an error or a silent stale value, depending on how the compute was created and on who reads it first.

**Options:**
- **(a)** Disposing a sender marks its receivers stale. Their next run reads the disposed sender and fails with ILLEGAL_READ, consistently.
- **(b)** A disposed dep is just a constant: keep the last value and never error. Make the bound form behave the same.
- **(c)** Leave it as it is and document that reading across ownership boundaries is undefined after a dispose.

**Recommendation:** (a) or (b), as long as bound and unbound computes behave the same. (a) surfaces the mistake, (b) is cheaper.

**Decision:** a disposed dep never notifies again, so a compute that only depends on it does not update and keeps **its own** last value. If the compute re-runs because another dep changed and reads the disposed dep, the read throws ILLEGAL_READ: a disposed node has no value, and reading it is like dereferencing a null pointer. A fn that can meet a disposed dep checks `dep.disposed` and handles it explicitly. A disposed node never reads as `undefined` or `null`, since a caller can't tell that apart from a real value.

What follows from it:

- **Bound computes:** `ComputeProto.get` (`src/internal.js:2283`) puts the compute into a FATAL ILLEGAL_READ error whenever its `_dep1` is disposed, even when it didn't need to re-run. Under the decision, it keeps its value, and only a re-run (a stale bound compute) fails with ILLEGAL_READ.
- **Bound factories:** they must not run their fn with a disposed dep's `null` (bug 32 already covers this).
- **`.get()`:** on a disposed signal or compute it returns `null` today (`SignalProto._dispose` sets `_value = null`). Under the decision it throws ILLEGAL_READ. This is cheap: `.get()` is the untracked read (`peek()`/`untrack()` elsewhere), the engine never calls it internally, and user code rarely calls it in hot loops.
- Signals and resources lose `dispose()` (D8), so D4 only concerns owned senders (computes and tasks) read from another scope.

**Implemented** on `fix/24-slim-cold`:

- `.get()` on a disposed compute throws ILLEGAL_READ. The check folds into get()'s first flag test, so a live compute pays nothing. `dispose.test.js` and `ownership.test.js` expected `null` and were updated.
- The bound check at the end of `get()` is gone. A bound compute whose dep was disposed keeps its value, like an unbound one.
- Both `_update`s widen the bound path's `FLAG_ERROR` test to `FLAG_ERROR | FLAG_DISPOSED`, one constant in dist. A re-run of a bound node over a disposed dep skips the fn and fails with ILLEGAL_READ, through the cold helper `boundError(dep)`. This also fixes the bound factories of bug 32.
- `dispose.test.js` › "bound compute errors when dep1 is disposed" encoded the old eager error. It is replaced by two tests: the value is kept, and a re-run fails without calling the fn.

## D5: Callback-suspend resolve and reject are not one-shot

```js
c.task((cx) => {
  cx.suspend((resolve) => {
    resolve(1);
    resolve(2);
    resolve(3);
  });
}); // the task settles three times; subscribers see 1, 2, 3
```

Each call re-settles the node for as long as the activation is current. A promise ignores everything after the first settle. The README only forbids calling `c.suspend()` twice. Bug 26 shows that a later `resolve` can also overwrite a newer plain write to a resource.

**Options:**
- **(a)** One-shot like a promise: the first resolve or reject wins, and later calls are ignored.
- **(b)** Multi-shot by design (a callback-driven stream, like the async generator form). Document it, and make a plain write to a resource end it, per bug 26.

**Recommendation:** (a), unless streaming through the callback form is a deliberate feature. Generators already cover streaming.

**Decision:** (a). `resolve` and `reject` behave like a native promise's: the first call settles the activation, and later calls are ignored. Streaming through the callback form could be added later, but only with a separate signature that has an explicit end or close method.

**Implemented** on `fix/24-slim-cold`: `resolvePromise` guards the pair with one `done` flag, and the README documents it. Bug 26's "a plain write is not overwritten by a late resolve of the callback form" passes.

## D6: A locked spawn whose owner disposed it can't create children in its continuation

```js
r.spawn(async (cx) => {
  cx.lock();
  await cx.suspend(save());
  cx.effect(() => {}); // throws ILLEGAL_READ once the owner has disposed it
});
r.dispose(); // while the save is in flight
```

The README says "a locked node counts as alive until its activation finishes". FLAG_DISPOSED is set at once, though, and the factories reject a disposed owner. Reads (`c.val`) in the continuation also throw.

**Options:**
- **(a)** A locked node is fully alive until it settles: reads and children work, and the children are disposed with it at settle.
- **(b)** The lock only guarantees that the continuation runs to completion. Reads and new children are refused. Document this narrower meaning.

**Recommendation:** (b) is simpler and safer (nothing new is attached to a dying subtree), but the README wording should change to say "runs to completion" instead of "counts as alive".

**Decision:** (a). A locked node keeps running as normal after its owner disposed it: reads work, and it can create new children and subtrees. When the activation settles, the node is disposed with everything it created, as the README says ("counts as alive until its activation finishes").

### A lock and its owners' teardown

**Decided (2026-11-07):** (A), the owners inherit the lock, and force quit is a boolean `dispose(true)`. The draft below is the agreed direction. Its storage details may still change during the fix.

That decision isn't enough on its own. When the owner is disposed, its cleanups release what the locked node is still using (a database connection, say). "Run to completion" then fails exactly when it matters. The direction so far: a lock also holds the owners above it. Draft:

- **Hold:** a teardown starts at an origin, a node that re-runs or is disposed. When it reaches a locked node, nothing under the origin is released until the lock releases. Only that subtree waits. Disposing the root makes the whole app wait, like an OS shutdown waiting for its processes.
- **(A) The owners inherit the lock.** Every owner on the path from the locked node to the root behaves as if locked: a re-run or dispose requested for it is deferred and replayed when the last lock under it releases, using the existing lock replay. Meanwhile everything keeps running normally, so a parent's re-run (a route change, say) waits for the save to finish. There is no overlap between old and new runs.
- **(B) Freeze the old run.** The origin's old subtree stops reacting at once (unlinked from its deps, last values still readable, no re-runs) and is released, children first, when the lock settles. The origin's new run starts immediately. That is more responsive, but old and new resources overlap, and with frequent re-runs, frozen old runs can pile up.
- **Force quit:** `dispose(force)` ignores locks. Locked nodes are disposed at once: controllers are aborted, continuations are dropped at their next `c.suspend()`, and cleanups run children first. A second plain `dispose()` was considered as the trigger (Ctrl+C twice), but `dispose()` is idempotent today, and defensive double calls would force by accident.
- **Knowing when it's done:** with children first, the root's own cleanups run last, so a cleanup on the root is the "shutdown finished" hook. No new API.
- **Storage:** no new field. Effects already have `_owner`. The count of locks holding each owner lives in a module-level map that only has entries while a lock is held. Locking or releasing walks the owner chain, which costs nothing for code that never locks. Tasks have no `_owner`, so a locked task either looks up its owner in the same map or holds only itself.
- **Cost of the guarantee:** a lock that never settles holds its whole origin subtree until it is forced.

## D7: A synchronous callback reject in an effect is swallowed

```js
// a throw: root() rethrows the error
root((r) => r.spawn((cx) => { throw new Error("x"); }));

// a synchronous reject: the spawn is disposed, root() returns normally
root((r) => r.spawn((cx) => { cx.suspend((res, rej) => rej(new Error("x"))); }));
```

A throw in the body reaches the creator (or the flush) as an error. A synchronous `reject` disposes the spawn and the error goes nowhere, unless the spawn has `recover`. For tasks, bug 17 made a synchronous reject behave like a returned error (the task is errored with the `Defect`). This ties to bug 27, whose fix moves a synchronous settle to the end of the run, where either behavior is easy.

**Options:**
- **(a)** A synchronous reject behaves like a throw in the body.
- **(b)** It behaves like an async reject: `recover`, then dispose, and the error is not rethrown. That is the current outcome, minus bug 27's link corruption.

**Recommendation:** (a). Whether the callback happened to settle synchronously should not decide whether an error is visible.

**Decision:** (a). If the callback settles synchronously, a reject throws synchronously, like a throw in the body. Bug 27's fix should handle the reject at the end of the run on this path.

**Implemented** with bug 27: `EffectProto._error` throws while the fn runs. Tests in `hardening.test.js` › 27.

**Revised by D9:** the reject no longer throws out of `reject()`. It is held, and `_update` throws it once the fn has returned, so the outcome is the same (the creator, or `recover` in a re-run), but the rest of the body runs first. A setup fn that caught the throw from `reject()` no longer sees one.

## D8: Signals and resources are disposable, but not owned

Signals and resources are created outside the ownership graph, yet both have `dispose()`. Disposing a signal sets its value to `null` and clears its own subscriber lists, nothing else. Downstream nodes stay owned by their scopes, keep their values, and still reference the signal through `_deps`. In scoped code it frees almost nothing. For unowned nodes created on the global `c`, it silently kills the ones that only the signal kept alive. In return, every read path has to handle a disposed signal (D4, bug 32).

**Decision:** remove `dispose()` from Signal and Cell. To stop triggering a signal, stop writing to it. `set(null)` releases a large value. A plain write supersedes a resource's write in flight (bug 26). Owned computes and tasks keep `dispose()`, so the disposed-read checks remain for them.

**Implemented** on `fix/24-slim-cold`, with the test changes listed below.

What changes:

- `SignalProto.dispose`/`_dispose` and `CellProto.dispose`/`_dispose` go, along with the README's "Awaited resource was disposed" case. Waiters on a resource resume with the next settled or written value.
- About 21 call sites in 11 test files dispose a signal or resource (`assign`, `garbage`, `leak`, `signal-false`, `signal-notify`, and the explore files). Bug 32's tests switch to disposed computes.

## D9: A callback suspend runs its callback before the code after it, if the source is already settled

Raised while fixing bug 24.

```js
c.spawn((cx) => {
  cx.suspend(settledTask, (v) => log.push("cb"));
  log.push("after");   // ["cb", "after"]; with a loading task: ["after", "cb"]
});
```

The callback forms ran their callback inside the `c.suspend()` call when the source was already settled: a settled task's `onResolve`, or a `resolve()` called synchronously in the setup fn. With a loading source they ran after the body. Whether a line ran before or after the callback depended on timing. The same split was the root of bug 24: the callback forms set FLAG_LOADING at the call, so `val()` treated the rest of the run as if it had already returned.

**Options:**
- **(a)** Always tick, like Node: every callback goes through a microtask. Least code (FLAG_CALLBACK and its special cases go away), but a task that resolves synchronously is loading for a tick, and the README presents the callback forms as the way to skip the microtask.
- **(b)** Always defer: the callback never runs before the fn returns, but runs right after it, in the same run, with no microtask.

**Decision:** (b). A node behaves the same whatever comes before or after a suspend.

**Implemented** on `fix/24-slim-cold`:

- A callback suspend made while the fn runs sets `FLAG_SUSPEND | FLAG_CALLBACK` (`callbackFlags`), not FLAG_LOADING. The node becomes loading when its fn returns, as it does when the fn returns a promise. Reads in the rest of the fn take the sync path, which fixes bug 24 without a change to `val()`.
- Anything delivered while both bits are set (`isHolding`) is held on a module-level stack, `HELD`, as triples `[node, fn, value]`. That covers `_settle`, `_error`, `deliver` for a task that settles during the run, and a settled task in `suspendTo`. `fn` is `undefined` to settle with the value, `null` to fail with it, or the task callback to call. No node gets a new field. The first delivery wins.
- When the fn returns, the async tail of `_update` takes the node's entry. A compute settles with it as part of the run, with the old bug 17 / 27 code. An effect calls `_settle()`, or throws a rejection as a throw in the body (D7). A task callback runs first, with FLAG_LOADING set, so its reads link like reads after an `await`. With no entry, the node starts loading. `_runAsync` does the same for a resource.
- A throw from the fn (the compute catches, `flushEffects`, `failStart`, `_runAsync`) or a disposal during the fn drops the entry. So only nodes whose fn is on the stack have one, at most one per nested run.
- `suspendTo`'s "second callback suspend" guard also tests FLAG_CALLBACK, since FLAG_LOADING is no longer set mid-run.

Hot path: `EffectProto._update` keeps the result of the `this._flag &= ...` it already does after the fn (`flag = this._flag &= ...`). Both `_update` tails test `flag & (FLAG_ASYNC | FLAG_CALLBACK | FLAG_DISPOSED)`, one constant, where they tested `FLAG_ASYNC`. That costs no new load or branch. The sync tails drop FLAG_CALLBACK from a mask. Benchmark (`bench/reactivity/anod.js`, median of 3 interleaved runs against the branch before D9): everything within ±1.2%, except Dynamic build, which came out about 4% faster. "Dynamic update: wide dense" is bimodal (about 63k or 81k per run) for every build: in 8 alternating rounds, both builds landed in the slow mode 2 times out of 8, with medians of 62.6k (D9) and 63.7k (before).

Tests: `hardening.test.js` › 24 (6) and › D9 (6). The D9 tests check that the code after a synchronous reject runs first, held task callbacks, a throw dropping a held resolve, resources, and nested runs. The last three also pass on master and guard the mechanism; a mutation run confirmed that "a throw after a synchronous resolve drops the held resolve" fails without the `unhold`. `suspend-callback.test.js`: "a settled task calls onResolve synchronously, before suspend returns" and its array twin now expect the callback after the body.

## Doc note: the README still describes tombstones

The "Limitations" section says anod drops the two-way slot binding and garbage-collects disposed receivers with tombstones. Bug 03 replaced that with O(1) two-way slots (`_subs` holds `[receiver, depslot]` pairs, `_deps` holds `[sender, subslot]` pairs). The paragraph, including its trade-off discussion, is out of date.
