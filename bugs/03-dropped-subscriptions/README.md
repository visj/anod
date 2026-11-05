# 03: A dependency dropped from a shared subscriber list is never removed

Branch `fix/03-twoway`, based on `fix/base`. Chain D (graph).
It replaces `fix/03-dropped-subscriptions` (which found the entry to drop with a scan) and `fix/03-slots` (one-sided slots in a parallel array). Next in the chain: `fix/04-weak-deps`.

## What breaks

When a live receiver stops reading a sender, and the receiver sits in the sender's `_subs` array (not `_sub1`), it is never removed. It keeps re-running on writes to a signal it no longer reads, it adds itself to `_subs` again every time it re-subscribes (21 entries after 20 toggles), and it can crash.

```js
c.effect((cx) => { cx.val(s); });           // occupies s._sub1
c.effect((cx) => { cx.val(mode) ? cx.val(s) : cx.val(t); });
mode.set(false);
s.set(1); // the second effect re-runs, though it no longer reads s
```

## Root cause

- `clearReceiver` clears `_sub1` directly, but for `_subs` entries it only increments `_tombstones`.
- `_purge` compacts `_subs` by removing entries flagged `FLAG_DISPOSED`. A live receiver that only dropped the dependency is not disposed, so it is never removed, and `notify` keeps waking it.
- When patchDeps drops the last dependency of a node, it returns without clearing `FLAG_SINGLE`, so `checkSingle` later dereferences a null `_dep1`.

## What anod should do

- A receiver that dropped a dependency must be inert in that sender's list: it is never woken by it again, and it is removed when the list is compacted.
- Re-subscribing a receiver never creates a second live entry for it.
- A node with no dependencies left is not in single-dep mode.

## Tests (3)

- `test/explore/graph.test.js` › dynamic dependencies › a dep dropped while the receiver sits in a shared _subs array no longer wakes it
- `test/explore/graph.test.js` › dynamic dependencies › toggling a dep on and off does not grow the sender's subscriber list
- `test/explore/graph.test.js` › dynamic dependencies › compute that stops reading its only shared compute dep survives later writes

Run with `bun test --conditions=src test/explore/graph.test.js`.

## Fix

Tombstones are gone. Links are two-way, as before `132554b`: `_subs` holds `[receiver, depslot]` pairs, `_deps` holds `[sender, subslot]` pairs, and `_sub1slot`/`_dep1slot` hold the slots of `_sub1`/`_dep1`. Each slot is the index of the matching pair on the other side, or -1 for `_sub1`/`_dep1`. Either side unlinks in O(1) by swapping its last pair into the hole and repointing the moved pair's partner.

### What changed

- Removed `_tombstones`, `_purge`, `PURGES`, `PURGE_COUNT`, `FLAG_PURGE` and the purge pass in `flush`. `_sub1slot` takes `_tombstones`' place; receivers gain `_dep1slot`.
- `connect(send, receiver, depslot)` returns the subslot. `clearReceiver(send, subslot)` swap-removes and repoints the moved receiver. `moveDep` repoints a sender after a receiver moved a pair; `removeDep` swap-removes a receiver's pair (used by the `settleDeps` dedup).
- Every loop over `_subs`/`_deps` steps by 2 (`notify`, `settleNotify`, `needsUpdate`, `checkRun`, `sweepDeps`, `clearDeps`). `checkRun`'s `CINDEX` holds pair indices.
- Setup runs push pairs to `DSTACK`. While the run is in progress, senders point at the pair's absolute `DSTACK` index, so `clearReceiver` can repoint a receiver that is mid-setup (its `_deps` is still null). After a nested setup (`DBASE !== 0`), `rebaseDeps` points the senders at the sliced indices.
- `patchDeps` is the old two-way version with base's structure. Dynamic re-runs push `[sender, 0]` and patchDeps connects them.
- `clearReceiver` skips disposed senders: `clearSubs` nulls their list, and receivers drop the pair on their next re-run or dispose, as before.
- `track(node, sender)`: `suspend()` on settled tasks in the sync scope tracks the task the way `val()` does. Base pushed an unlinked dep for stable nodes and linked deps mid-setup through `subscribe`, which the slice then lost. With back-pointers these would corrupt the sender's list.
- patchDeps clears `FLAG_SINGLE` when the last dep is dropped.

### Behavior decisions

- One layout for every node: no stable/dynamic split, no extra array. A multi-dep node's `_deps` doubles in length; a single-dep node allocates nothing.
- The "no dep1 before this run" branch in patchDeps now makes the first new dep `_dep1` (the line fix 04 changes). Base wrote it to `deps[i]` and then overwrote it, which with back-pointers leaves a sender pointing at the wrong pair. As a result the two "weak compute with no deps" tests of bug 04 pass here too.
- A sender that loses all subscribers keeps an empty `_subs` array (as before `132554b`). Weak checks test `length === 0`.

### Test expectations changed

None. Test helpers that walk `_subs`/`_deps` (`test/patch.test.js`, `test/explore/graph.test.js`) now step by 2, and the "disposing 40 of 50 effects" test counts pairs. `types/internal.d.ts` drops the purge exports.

### Other groups

84 failures from src and dist (fix/03-slots: 86); the difference is the two bug 04 tests above. A randomized check (80 seeds × 400 steps, nested setups, disposal) verified both directions of every link after each step, plus directed tests for a sender unlinking a receiver mid-setup (top level and nested), a task awaited twice, and `suspend([settled])` during setup. They read internals and are not committed.

### Hot paths touched

Min time, median of 6 rotated rounds, vs `fix/base` (unbound / bound):

- Kairo, $mol_wire, 1k signals: within ±1%. CellX 10 layers +1.5% / +2.1%.
- 1k computations: +2.9% / +4.3%, heap +10.7% / +8.9% (`_sub1slot` + `_dep1slot`).
- Build: simple +2.7% / +3.2%, large web app +5.4% / +4.9%, wide dense +11.9% / +12.3%. Heap +34% / +10% / +20%.
- Update rows: within +3.3%; very dynamic −5.0% / −4.6% (dropped receivers stop being woken).
- Fan-out flip (N dynamic effects drop and re-read one signal): N=10,000 1.29 ms (base 1.19 ms, scan version 206 ms).

Bytecode: `_read` 189 → 233, `clearReceiver` 193 → 198, `connect` 62 → 77 (all inlinable), `patchDeps` 544 → 748 (over the limit in base too), `flush` 753 → 677.
