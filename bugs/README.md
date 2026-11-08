# Bugs found by the exploratory tests

Each folder describes one group of bugs: what breaks, the root cause, how anod should behave instead, and the failing tests in `test/explore/` that pin it down. 89 tests fail on `fix/base`; each fix branch turns its group's tests green.

## Branches

Fixes that touch the same code are stacked in a chain; unrelated chains start from `fix/base`, so rejecting a fix only affects the fixes after it in its own chain.

- **A (flush):** `fix/base` → `fix/06-aborted-flush` → `fix/02-nested-flush` → `fix/11-drain-writes` → `fix/14-supersede-edges`
- **B (contextual and resource writes):** `fix/base` → `fix/10-contextual-flags` → `fix/12-queued-resource-writes` → `fix/13-idle-context-set`
- **C (errors):** `fix/base` → `fix/01-global-recover` → `fix/07-error-wrapping` → `fix/08-pending-errors` → `fix/09-errored-reread`
- **D (graph):** `fix/base` → `fix/03-twoway` → `fix/04-weak-deps` → `fix/05-cycle-hang` → `fix/20-options`
- **E (async settling):** `fix/base` → `fix/15-absorbed-changes` → `fix/16-unchanged-settle` → `fix/17-lost-results`
- **F (async API):** `fix/base` → `fix/18-resource-races` → `fix/19-async-gaps`
- **G (ownership):** `fix/base` → `fix/21-ownership`

`fix/all` merges every chain tip, to check that the fixes compose and to benchmark the combined result.

To review a fix, diff it against the branch before it in its chain, for example `git diff fix/base..fix/06-aborted-flush`. Its README's "Fix" section explains the change.

## Index

| Bug | Title | Tests | Branch | Chain |
| --- | --- | --- | --- | --- |
| [01](01-global-recover/README.md) | Throwing in a global `c` effect becomes a TypeError | 2 | `fix/01-global-recover` | C |
| [02](02-nested-flush/README.md) | A flush started inside another flush corrupts it | 10 | `fix/02-nested-flush` | A |
| [03](03-dropped-subscriptions/README.md) | A dependency dropped from a shared subscriber list is never removed | 3 | `fix/03-twoway` | D |
| [04](04-weak-deps/README.md) | `OPT_WEAK` loses dependencies | 6 | `fix/04-weak-deps` | D |
| [05](05-cycle-hang/README.md) | A cycle between pending computes hangs the process | 1 | `fix/05-cycle-hang` | D |
| [06](06-aborted-flush/README.md) | A throw that escapes a flush breaks the engine | 10 | `fix/06-aborted-flush` | A |
| [07](07-error-wrapping/README.md) | The REFUSE / PANIC / FATAL model doesn't hold | 9 | `fix/07-error-wrapping` | C |
| [08](08-pending-errors/README.md) | `c.pending()` throws on an errored sender | 1 | `fix/08-pending-errors` | C |
| [09](09-errored-reread/README.md) | Reading the same errored compute twice in one run | 1 | `fix/09-errored-reread` | C |
| [10](10-contextual-flags/README.md) | A contextual write wipes its writer's state | 6 | `fix/10-contextual-flags` | B |
| [11](11-drain-writes/README.md) | Writes made while the write queue drains are lost | 4 | `fix/11-drain-writes` | A |
| [12](12-queued-resource-writes/README.md) | Queued resource writes revert earlier writes | 2 | `fix/12-queued-resource-writes` | B |
| [13](13-idle-context-set/README.md) | Idle `c.set` gaps | 2 | `fix/13-idle-context-set` | B |
| [14](14-supersede-edges/README.md) | Edge cases in the new set/post supersession | 2 | `fix/14-supersede-edges` | A |
| [15](15-absorbed-changes/README.md) | An absorbed upstream change still tears down async work | 3 | `fix/15-absorbed-changes` | E |
| [16](16-unchanged-settle/README.md) | A task that settles to its previous value never resolves its waiters | 4 | `fix/16-unchanged-settle` | E |
| [17](17-lost-results/README.md) | Async nodes that hang or lose their result | 3 | `fix/17-lost-results` | E |
| [18](18-resource-races/README.md) | Resource races | 3 | `fix/18-resource-races` | F |
| [19](19-async-gaps/README.md) | Smaller async gaps | 10 | `fix/19-async-gaps` | F |
| [20](20-options/README.md) | Documented options that misbehave | 7 | `fix/20-options` | D |
| [21](21-ownership/README.md) | Ownership leaks | 3 | `fix/21-ownership` | G |
| [22](22-dispose-waiters/README.md) | Disposal reaches the nodes waiting on a task at the wrong time | 17 | `fix/all` | — |

## Second round

Found on `master` after `fix/all` was merged. Branch `fix/23-hardening` added the failing tests in `test/explore/hardening.test.js` (one describe block per bug) and these write-ups. Run the tests with `bun test --conditions=src test/explore/hardening.test.js`.

Branch `fix/24-slim-cold` shrinks the engine and fixes the bugs that don't need hot-path changes. It also implements D1, D2, D4, D5, D7, D8 and D9, and adds 27 tests: three for bug 27 and D7, one for bug 34, one for D1, one for bug 23, three for bug 26, six for D9, three for D4, five for D2, one each for bugs 28 and 33, and two weak-release guards in `weak.test.js`. Bugs 23 and 26 then went in as the first hot-path item, by splitting the resource writes out of `set()` (see bug 26's README), bug 24 as the second, by D9, bug 32's bound factories as the third, with D4, and bugs 28, 33 and 35 (with D2) as the fourth. 63 round-two tests in all: 59 pass, and bug 25's 4 are skipped until the lock rework gets its own branch. On the branch, 787 tests pass, none fail and 4 are skipped, the same in src and dist. Each fixed bug's README has a "Fix" section.

Branch `fix/25-shield` fixes bug 25 with D10: `c.lock()` becomes `c.shield()`, a run-to-completion guarantee for effects and spawns, and `unlock()` is removed. A disposal waits for the shields under it with its subtree frozen, and `dispose(true)` forces it. An await that closes a cycle between tasks now fails with "Cycle detected". `test/shield.test.js` replaces `test/lock.test.js`, and bug 25's tests run again. On the branch, 807 tests pass and none fail or are skipped, the same in src and dist.

Branch `fix/settle-stamps` fixes bugs 39 and 40. An async settle no longer overwrites the stamps a running node tracks with (39), and a settle made while the engine is busy is queued like a write, so the task stays loading until the drain settles it (40). It adds ten tests to `hardening.test.js`.

| Bug | Title | Tests | Related | Status |
| --- | --- | --- | --- | --- |
| [23](23-errored-resource-write/README.md) | A plain write leaves a resource errored | 5 | 26 | fixed |
| [24](24-reads-after-callback-suspend/README.md) | Reads after a loading callback suspend corrupt dependency links | 6 | 19, D9 | fixed (by D9) |
| [25](25-sync-lock/README.md) | `c.lock()` is never released when an activation finishes synchronously | 4 | 19, D6, D10 | fixed on `fix/25-shield` (by D10) |
| [26](26-resource-lww-gaps/README.md) | Resource last-write-wins gaps | 8 | 18, 23, D5 | fixed |
| [27](27-sync-callback-settle/README.md) | A callback that settles synchronously ends a spawn's activation mid-body | 5 | 17, D7 | fixed |
| [28](28-weak-cleanup-throw/README.md) | A weak compute's throwing cleanup corrupts its reader | 3 | 06, 33 | fixed |
| [29](29-resource-version/README.md) | `c.version()` in a resource callback throws | 1 | — | fixed |
| [30](30-async-equal/README.md) | `c.equal()` is ignored when a task settles asynchronously | 2 | 16 | fixed |
| [31](31-async-refuse/README.md) | `c.refuse()` in an async task exposes the previous value as its error | 1 | 07 | fixed |
| [32](32-disposed-senders/README.md) | Disposed senders are accepted by `c.defer()` and the bound factories | 3 | D4 | fixed |
| [33](33-escaping-precheck/README.md) | An error escaping a flush's pre-run check deafens queued effects | 2 | 05, 06 | fixed |
| [34](34-idle-reruns/README.md) | Node functions that run while the engine is idle | 4 | 19 | fixed |
| [35](35-cleanup-throw-rerun/README.md) | A throwing cleanup on re-run leaves the previous run's children alive | 1 | 06, D2 | fixed (with D2) |
| [36](36-stable-suspend-task/README.md) | `c.suspend(task)` after `c.stable()` drops the task | 1 | 24 | fixed |
| [37](37-cleanup-defect-wrap/README.md) | A cleanup error that is already a `Defect` is wrapped again | 1 | 07 | fixed |
| [38](38-bound-effect-double-link/README.md) | A bound effect with `OPT_SETUP` that reads its own dep is linked twice | 1 | — | fixed |
| [39](39-settle-stamps/README.md) | A settle inside another node's run overwrites its dependency stamps | 5 | 24, 40 | fixed on `fix/settle-stamps` |
| [40](40-settle-in-run/README.md) | A settle inside another node's run is lost on its readers | 5 | 16, 39 | fixed on `fix/settle-stamps` |

Suggested grouping for fix branches, by the code they touch:

- **Writes:** 23 and 26 (`set`, `assign`, `contextSet`). Fixed.
- **Async settle:** 27, 30 and 31 (`_settle`, `refuse`).
- **Lock:** 25 and 34 (the lock and defer replays). 34 fixed; 25 fixed on `fix/25-shield`, with D6 and D10.
- **Graph:** 24, 28 and 36 (`val`/`rejected`/`track` routing, `patchDeps` and `clearReceiver`). Fixed.
- **Teardown:** 35, together with D2. Fixed.
- **Independent:** 29, 32, 33, 37 and 38.
- **Settle in a run:** 39 and 40 (`settleDeps`, `settleDefers`, `settleNotify`, `resolvePromise`).

### Simplification

[simplification/README.md](simplification/README.md) is a scan of `src/internal.js` for duplicated code, functions that could merge and dead code. It estimates about 700–800 removable code lines, groups them by risk, and suggests an order that lets the bug fixes above land in the merged code.

### Design questions

[design/README.md](design/README.md) collects the cases where the README is silent or conflicts with an existing test, so the intended behavior has to be decided first. They have no tests.

- **D1** (decided: abort on re-run; implemented on `fix/24-slim-cold`): sync effect controllers are not aborted on re-run.
- **D2** (decided: children first; implemented with bug 35, and the wait for shielded children with D10): cleanups run before owned children are disposed.
- **D3** (decided: start paused): children created under a paused owner are not paused.
- **D4** (decided: a disposed dep has no value, and reading it throws; implemented with bug 32): a compute whose dep was disposed.
- **D5** (decided: one-shot, like a promise; implemented): callback resolve and reject are not one-shot.
- **D6** (decided: the node runs normally until it settles, its owners inherit the lock, and `dispose(true)` forces; implemented with D10): what a locked but disposed node may still do.
- **D7** (decided: a synchronous reject throws synchronously; implemented with bug 27): a synchronous callback reject in an effect is swallowed.
- **D8** (decided: remove `dispose()` from Signal and Cell; implemented): signals and resources are disposable, but not owned.
- **D9** (decided: the callback runs after the code that follows the suspend; implemented, fixes bug 24): a callback suspend runs its callback before the code after it, if the source is already settled.
- **D10** (decided: `c.lock()` becomes `c.shield()`, effects only, no `unlock()`; a dispose waits for the shields under it with the subtree frozen; `dispose(true)` forces; implemented on `fix/25-shield`, fixes bug 25): what the lock guarantees and who may release it.
- **Doc note:** the README "Limitations" section still described tombstones (rewritten on `fix/24-slim-cold`).

## Performance

_Benchmarked once all fix branches exist; see the results below when filled in._
