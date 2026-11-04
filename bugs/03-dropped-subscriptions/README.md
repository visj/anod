# 03: A dependency dropped from a shared subscriber list is never removed

Branch `fix/03-dropped-subscriptions`, based on `fix/base`. Chain D (graph).
Next in the chain: `fix/04-weak-deps`.

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

- The README's tombstone trade-off (deferred compaction, extra cost in `notify`) stays. But a receiver that dropped a dependency must be inert in that sender's list: it is never woken by it again, and it is removed when the list is compacted.
- Re-subscribing a receiver never creates a second live entry for it.
- A node with no dependencies left is not in single-dep mode.

## Tests (3)

- `test/explore/graph.test.js` › dynamic dependencies › a dep dropped while the receiver sits in a shared _subs array no longer wakes it
- `test/explore/graph.test.js` › dynamic dependencies › toggling a dep on and off does not grow the sender's subscriber list
- `test/explore/graph.test.js` › dynamic dependencies › compute that stops reading its only shared compute dep survives later writes

Run with `bun test --conditions=src test/explore/graph.test.js`.

## Fix

_Not fixed yet. The fix branch fills this in._
