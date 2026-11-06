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
| [04](04-weak-deps/README.md) | `OPT_WEAK` loses dependencies and its seed | 3 | `fix/04-weak-deps` | D |
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

## Performance

_Benchmarked once all fix branches exist; see the results below when filled in._
