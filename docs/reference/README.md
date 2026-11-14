# How anod compares on async

Fourteen async problems that reactive UIs run into, each solved in five ways:

- anod
- React + TanStack Query
- Solid 2.0
- React + Jotai
- Svelte 5 with async mode

Every solution runs, and all of them produce the same output.

The aim is a fair comparison, not a sales pitch. Each solution is what an experienced user of that library would write, using its documented idioms. Where a library needs a workaround, the code says so; where anod falls short, so does this page.

## Running them

```sh
npm run docs:check              # every example, every library
npm run docs:check -- 07        # one example
npm run docs:check -- --fw=solid
npm run docs:check -- -v        # with a timeline of every run
```

Each folder has:

- a `scenario.js`: a fake API with fixed delays, a timed script, and the expected output;
- one file per library;
- a README that walks through them.

The harness (`_harness/run.js`) mounts each version, plays the script, and checks two things:

- **What is shown:** what the UI renders, recorded from the rendering code itself, so tearing and flicker show up.
- **What happens:** requests, aborts, saves and sockets.

React and Svelte run in happy-dom. Solid runs headless, through its reactive core.

**Versions:**

- anod 1.0.0-rc.0
- React 19.3.1 with @tanstack/react-query 5.107.1 and jotai 3.0.2
- @solidjs/signals 2.0.0-beta.8 (Solid 2.0's reactive core; still a beta)
- Svelte 5.57.3 with `experimental.async` (still experimental)

**One timing caveat:** React 19 holds back revealing a Suspense boundary's content for up to 300ms after its fallback was shown, and these scenarios run for 100–200ms. So the React versions use `unwrap` (Jotai) or plain query states (TanStack) instead of Suspense. The Suspense versions would show the same results, later.

## The examples

| | Problem | Verdict |
|---|---|---|
| [01](01-out-of-order/README.md) | Out-of-order responses | Tie: everyone drops the stale response |
| [02](02-async-side-effects/README.md) | Async side effects | **anod**: the only guarded async effect; Solid by splitting into memos |
| [03](03-tracking-after-await/README.md) | Tracking after `await` | **anod and Jotai**: an explicit reader; Svelte in expressions only |
| [04](04-dependent-queries/README.md) | Dependent queries | anod, Solid, Jotai and Svelte chain by reading; TanStack needs `enabled` |
| [05](05-stale-while-revalidate/README.md) | Stale-while-revalidate | **Everyone but anod** (known gap) |
| [06](06-tearing/README.md) | Tearing | **Solid and Svelte**: consistent by default; anod and Jotai need a join |
| [07](07-refetch-vs-optimistic/README.md) | Refetch vs. optimistic write | **anod and Solid**: handled structurally; TanStack by recipe |
| [08](08-overlapping-optimistic/README.md) | Overlapping optimistic writes | **Solid**: rollback with no code; anod close; TanStack's official recipe is wrong |
| [09](09-run-to-completion/README.md) | Run to completion | **anod**: `c.shield()`; everyone else hand-writes a queue |
| [10](10-read-without-cancelling/README.md) | Read without cancelling | **anod**: `c.defer()`; everyone else shadows the value |
| [11](11-teardown/README.md) | Teardown | Tie |
| [12](12-callback-apis/README.md) | Callback APIs | Tie on correctness; anod misses the pending state (same gap as 05) |
| [13](13-async-errors/README.md) | Async errors | **anod** for background errors; **everyone else** for retry UI |
| [14](14-read-after-write/README.md) | Read-after-write | anod, Jotai and Svelte are fresh after a write; Solid needs `flush()`, React computes it again |

Lines of code (each file in full, mount glue included; the React glue is about 16 lines):

| | 01 | 02 | 03 | 04 | 05 | 06 | 07 | 08 | 09 | 10 | 11 | 12 | 13 | 14 | Total |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| anod | 26 | 23 | 20 | 30 | 27 | 30 | 21 | 29 | 27 | 23 | 21 | 29 | 34 | 21 | 361 |
| React + TanStack Query | 38 | 37 | 39 | 46 | 41 | 50 | 47 | 58 | 47 | 53 | 30 | 37 | 41 | 31 | 595 |
| Solid 2.0 | 26 | 24 | 26 | 36 | 30 | 29 | 28 | 33 | 42 | 37 | 21 | 18 | 37 | 23 | 410 |
| React + Jotai | 29 | 40 | 32 | 32 | 33 | 35 | 41 | 53 | 52 | 36 | 36 | 29 | 48 | 26 | 522 |
| Svelte 5 | 39 | 34 | 35 | 38 | 39 | 39 | 36 | 41 | 48 | 46 | 28 | 37 | 43 | 27 | 530 |

## What each library is good at

**React + TanStack Query** is a server-state cache rather than a reactive model.

- **Strong:**
  - Everything shaped like a query: a keyed cache, deduplication, `keepPreviousData`, retries, `refetch`, `cancelQueries`.
  - Every footgun has a documented recipe and a lint rule.
- **Weak:**
  - Async work that isn't a query (02, 09, 11) is plain React and manual.
  - Consistency across queries (06) needs a workaround, and there is no deferred read (10).
  - The official optimistic recipe is wrong under overlap (08).
  - No read-after-write (14).

**Solid 2.0** is the closest peer, with async built into the graph.

- **Strong:**
  - Transitions make updates consistent by default (06).
  - `createOptimistic` with `action` is the best optimistic story here (07, 08).
  - Pending state works on re-fetch (05).
  - Loading and error boundaries.
- **Weak:**
  - No tracking after `await` (03).
  - No abort helper, no async effect (02 needs memos), no run-to-completion (09), no deferred read (10).
  - Side-effect errors don't reach boundaries (13).
  - Reads after a write need `flush()` (14).
- **Beta-specific:**
  - An `isPending` pattern that loops (04).
  - Glitch frames when `isPending` is read in a user effect (05).
  - Async effect callbacks crash in prod builds (02).
  - `onCleanup` inside an effect is silently dropped (11).

**React + Jotai** is the closest small-library design: atoms read through an explicit `get`.

- **Strong:**
  - Tracking after `await` (03).
  - Abort on change (01).
  - Dependent atoms by awaiting (04).
  - Stale-while-revalidate in one `unwrap` (05).
  - A synchronous store (14).
- **Weak:**
  - No async side effects (02) and no async writes or supersession (07, 08).
  - No concurrency policies (09) and no deferred read (10).
  - Jotai 3 removed `loadable`, so error states need hand-mapping (13).

**Svelte 5** has the tersest syntax: `$derived(await f(x))`.

- **Strong:**
  - Synchronized updates rule out tearing (06).
  - Stale-while-revalidate and `$effect.pending()` by default (05).
  - Boundaries with `pending`, `failed` and `reset` (13).
- **Weak:**
  - Async mode covers deriveds, not effects or writes: 02, 07, 08, 09 and 10 are plain JavaScript on `$state`.
  - Tracking after `await` works only in the literal expression (03).
  - Loading UI is split between the boundary and `$effect.pending()`.
  - Experimental.

**anod**

- **Strong:**
  - Async side effects (02).
  - Run-to-completion with teardown that waits (09).
  - Deferred reads (10).
  - Writes that supersede async writes (07).
  - Background errors that reach the root (13).
  - Tracking after `await` (03).
  - Read-after-write with effects already run (14).
  - The shortest code in most examples.
- **Weak:**
  - A task's reload isn't visible to `c.pending()` (05, 12, 13).
  - No `refetch` (13).
  - No optimistic layer (08).
  - Consistency across tasks needs an explicit join (06).

The honest summary: **anod isn't better at async in general; it covers a different part of it.** The others are strongest where async produces a value to display: queries, reloads, transitions and boundaries. anod is strongest where async *does* something, in effects, writes, transactions and shutdown, where the others leave you to write it by hand.

## Amendments

Changes to anod suggested by these examples, roughly from smallest to largest.

### 1. Tell readers when a task starts loading again (fixes 05, 12, 13)

When a task re-runs because a dependency changed, its readers aren't notified that it is loading, so `c.pending(task)` is never seen as `true` on a reload. Here is why:

1. The reader's check pulls the task.
2. The task starts its async run.
3. Its value hasn't changed, so the reader is skipped.

A resource doesn't have this problem, because its async write calls `startLoading()`. This is a gap rather than a design choice.

**The fix:** stamp the task's change time when it starts loading, in `ComputeProto._update`. There are two places:

- the `startAsync()` branch;
- the callback-suspend branch that sets `FLAG_LOADING`.

**What it costs:** a trial stamped the time unconditionally, in the first of these places only. With it, 05 and 13 pass, and the rest of the suite still passes, except 2 tests in `test/explore/hardening.test.js` ("c.equal() is ignored when a task settles asynchronously"), which count one more reader run. Readers then run once when loading starts and once when it settles, as a resource's do. A final version should skip the stamp when the task was already loading, as `startLoading()` does, and cover the callback branch for 12.

### 2. `refresh()` on tasks (13)

Every other library has a way to re-run a fetch without changing its inputs. In anod, it is a counter signal that the task reads. `task.refresh()`, plus `c.refresh(task)`, would re-run the task as if a dependency had changed. It is a cold path with a few lines of code, and the counter pattern could be documented in the meantime.

### 3. `c.controller()` in a resource's async callback (07)

A resource's async write that is superseded is ignored, but its request can't be aborted, because `ResourceContext` has `suspend()` and `version()` but no `controller()`. Tasks and spawns have one. Adding it would make a superseded write abort, the same way a re-run aborts.

### 4. An optimistic recipe, and maybe a loader (08)

Supersession already does the hard part of overlapping optimistic writes: only the latest write settles. What's awkward is the rollback target. The natural `catch { return prev }` is wrong when `prev` was itself a guess, and a superseded write's success never reaches its continuation. So the last confirmed value isn't known.

Two options:

- **Document "resync on failure":** `catch { return await c.suspend(api.count()) }`. It is short and always right.
- **A resource with a loader:** `resource(loader)`, where `refresh()` re-runs the loader. A failed optimistic write would refresh, which is what Solid's `createOptimistic` with `refresh(server)` amounts to. It would merge with amendment 2.

### 5. Concurrency policies (09)

`c.shield()` is ember-concurrency's `keepLatest`, and restart is the default. The other two common policies are missing:

- `drop`: ignore changes while busy, for example a double-submit guard;
- `enqueue`: run every change, in order.

Both can be written in user code. If they come up often, an argument to `shield()` could select them. This is low priority.

### Not proposed

- **Global consistency (06):** Solid and Svelte hold updates until async work settles, which rules out tearing but costs read-after-write (14). anod's explicit join keeps writes synchronous. That's a trade-off, not a gap; document the join.
- **Loading and error boundaries:** they belong in a UI layer (katode), built on `c.pending()` and `c.recover()`.
