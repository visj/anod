import { describe, test, expect } from "#test-runner";
import { signal, resource, root, batch, flush, c, ERROR } from "#anod";

const tick = () => Promise.resolve();
const settle = () => tick().then(tick).then(tick).then(tick);

describe("throw mid-drain: engine state afterwards", () => {
    /**
     * Expected: the committed write to `a` still re-runs its effect in the
     * failed flush (README: effects "are always push-based"), and after the
     * batch throws, writing `a` again re-runs it.
     * Actual: the effect never runs again (runs stays 1).
     * Root cause: assign(a) notified the effect (FLAG_STALE, queued in
     * RECEIVERS), then b's updater threw inside the drain loop
     * (src/internal.js:4295). flush's finally (src/internal.js:4359-4366)
     * zeroes RECEIVER_COUNT without clearing FLAG_STALE on the dropped
     * effect, so notify() (src/internal.js:3379) skips it from now on.
     */
    test("an updater that throws mid-drain does not leave an earlier-notified effect permanently stale", () => {
        const a = signal(0);
        const b = signal(0);
        let runs = 0;
        const r = root((r) => {
            r.effect(a, () => { runs++; });
        });
        expect(() => {
            batch(() => {
                a.set(1);
                b.set(() => { throw new Error("updater"); });
            });
        }).toThrow();
        expect(runs).toBe(2);
        a.set(2);
        expect(runs).toBe(3);
        r.dispose();
    });

    /**
     * Expected: the write to `c2`, queued behind the throwing updater,
     * applies (as earlier writes in the same batch do: `a` became 1).
     * Actual: c2 stays 0 for good. The write is neither applied nor kept queued.
     * Root cause: the drain loop aborts at the throwing updater
     * (src/internal.js:4295) and the finally sets SENDER_COUNT = 0
     * (src/internal.js:4361-4366), discarding the rest of the queue.
     */
    test("an updater that throws mid-drain does not silently drop queued writes to other signals", async () => {
        const a = signal(0);
        const b = signal(0);
        const c2 = signal(0);
        expect(() => {
            batch(() => {
                a.set(1);
                b.set(() => { throw new Error("updater"); });
                c2.set(5);
            });
        }).toThrow();
        expect(a.get()).toBe(1);
        await settle();
        expect(c2.get()).toBe(5);
    });

    /**
     * Expected: once the queue is gone, post(currentValue) returns false
     * (nothing queued, value unchanged, see set-return.test.js).
     * Actual: returns true. FLAG_SCHEDULED is still set although nothing is queued.
     * Root cause: the per-sender FLAG_SCHEDULED clear loop
     * (src/internal.js:4299-4302) is skipped when the drain throws, and on
     * a "Runaway cycle" break, and the finally only zeroes the counters
     * (src/internal.js:4361-4366). SENDERS/PAYLOADS also keep references.
     */
    test("aborted drains leave no phantom queued-write marker on senders", () => {
        const a = signal(0);
        const b = signal(0);
        expect(() => {
            batch(() => {
                a.set(() => { throw new Error("updater"); });
                b.set(1);
            });
        }).toThrow();
        expect(a.post(a.get())).toBe(false);

        const s = signal(0);
        const r = root((r) => {
            r.effect(s, (v) => { if (v > 0) s.set(v + 1); });
        });
        expect(() => s.set(1)).toThrow();
        r.dispose();
        expect(s.post(s.get())).toBe(false);
    });

    /**
     * Expected: the plain effect queued behind a scoped sibling that threw
     * unrecovered still runs in that flush, as siblings in the same queue
     * do (README: effects "are always push-based"), and runs again on the
     * next write.
     * Actual: it never runs again (e2 stays 1).
     * Root cause: once `thrown` is set, the later queue phases are skipped
     * (src/internal.js:4324, 4336). Their counts are reset, but the skipped
     * effects keep FLAG_STALE, so notify() never enqueues them again.
     */
    test("an unrecovered effect error does not leave sibling effects in later queues permanently stale", () => {
        const s = signal(0);
        let e2 = 0;
        const r = root((r) => {
            /** Owns a child, so it is queued in SCOPES, ahead of RECEIVERS. */
            r.effect(s, (v, cx) => {
                cx.effect(() => {});
                if (v === 1) {
                    throw new Error("boom");
                }
            });
            r.effect(s, () => { e2++; });
        });
        expect(() => s.set(1)).toThrow();
        expect(e2).toBe(2);
        s.set(2);
        expect(e2).toBe(3);
        r.dispose();
    });

    /**
     * Expected: `out.set(v)`, made by an effect that ran fine, is applied
     * (as effect.test.js "throws on error inside batch" expects for
     * other mutations).
     * Actual: out stays 0. The queued write is dropped.
     * Root cause: the do/while exits on `thrown` (src/internal.js:4358) and
     * the finally zeroes SENDER_COUNT (src/internal.js:4361-4366) with the
     * effect's write still queued.
     */
    test("an unrecovered effect error does not drop writes queued by effects that already ran", () => {
        const s = signal(0);
        const out = signal(0);
        const r = root((r) => {
            r.effect(s, (v) => { out.set(v); });
            r.effect(s, (v) => { if (v === 1) throw new Error("boom"); });
        });
        expect(() => s.set(1)).toThrow();
        expect(out.get()).toBe(1);
        r.dispose();
    });

    /**
     * Expected: a batch whose callback throws either discards its writes or
     * applies them. Either way, an unrelated later write must not commit them.
     * Actual: `a` stays 0 after the throw, then becomes 1 (and its effect
     * runs) when the unrelated b.set(1) flushes.
     * Root cause: batch() runs fn() then flush() in one try
     * (src/internal.js:4389-4393). On a throw, flush is skipped but
     * SENDER_COUNT/FLAG_SCHEDULED stay as they were, and nothing schedules a drain.
     */
    test("a batch whose callback throws does not leave its writes for an unrelated flush to commit", () => {
        const a = signal(0);
        const b = signal(0);
        let runs = 0;
        const r = root((r) => {
            r.effect(a, () => { runs++; });
        });
        expect(() => {
            batch(() => {
                a.set(1);
                throw new Error("abort");
            });
        }).toThrow();
        const before = a.get();
        b.set(1);
        expect(a.get()).toBe(before);
        expect(runs).toBe(before === 0 ? 1 : 2);
        r.dispose();
    });

    test("a recovered effect error mid-flush keeps sibling writes and later updates intact", () => {
        const s = signal(0);
        const out = signal(0);
        let recovered = 0;
        const r = root((r) => {
            r.recover(() => { recovered++; return true; });
            r.effect(s, (v) => { if (v === 1) throw new Error("boom"); });
            r.effect(s, (v) => { out.set(v * 10); });
        });
        s.set(1);
        expect(recovered).toBe(1);
        expect(out.get()).toBe(10);
        s.set(2);
        expect(out.get()).toBe(20);
        r.dispose();
    });

    test("a runaway cycle throws and unrelated signals and effects keep working", () => {
        const s = signal(0);
        const other = signal(0);
        const seen = [];
        const r = root((r) => {
            r.effect(s, (v) => { if (v > 0) s.set(v + 1); });
        });
        let message = null;
        try {
            s.set(1);
        } catch (e) {
            message = e.message;
        }
        expect(message).toBe("Runaway cycle");
        r.dispose();

        const r2 = root((r) => {
            r.effect(other, (v) => { seen.push(v); });
        });
        other.set(1);
        batch(() => {
            other.set(2);
            other.set(3);
        });
        s.set(-1);
        expect(s.get()).toBe(-1);
        expect(seen).toEqual([0, 1, 3]);
        r2.dispose();
    });
});

describe("supersede edge cases", () => {
    /**
     * README: "If the updater throws, the posts stay queued." A set() that
     * throws from its equality function has also written nothing.
     * Expected: the earlier post(1) still applies (s === 1 after the microtask).
     * Actual: s stays 0. The post was cancelled even though the set failed.
     * Root cause: in set(), supersede(this) (src/internal.js:533-535) runs
     * before the equality check (src/internal.js:536-540) instead of after
     * it succeeds.
     */
    test("a set() whose equality function throws leaves earlier posts queued", async () => {
        const s = signal(0, (p, n) => {
            if (n === 99) {
                throw new Error("bad");
            }
            return p === n;
        });
        s.post(1);
        expect(() => s.set(99)).toThrow();
        expect(s.get()).toBe(0);
        await tick();
        expect(s.get()).toBe(1);
    });
});

describe("re-entrant flush", () => {
    /**
     * Expected: flush() inside an effect is harmless (nothing new to drain),
     * and the effect is not killed.
     * Actual: the nested flush walks RECEIVERS from 0 with the outer count,
     * hits the slot the outer loop already nulled, and throws
     * "null is not an object (evaluating 'node._flag')". The calling
     * effect is recovered/disposed as FATAL.
     * Root cause: flush() has no re-entrancy guard. It sets IDLE=false and
     * then IDLE=true unconditionally (src/internal.js:4277, 4360), and
     * flushEffects reads queue[i]._flag on slots that are already nulled
     * (src/internal.js:4235-4238).
     */
    test("flush() inside an effect does not crash when sibling effects are queued", () => {
        const s = signal(0);
        let errors = 0;
        let e1 = 0;
        const r = root((r) => {
            r.recover(() => { errors++; return true; });
            r.effect(s, () => { e1++; flush(); });
            r.effect(s, () => {});
        });
        s.set(1);
        expect(errors).toBe(0);
        s.set(2);
        expect(e1).toBe(3);
        r.dispose();
    });

    /**
     * Expected: a compute that calls flush() still computes its value.
     * Actual: comp.get() is { error: TypeError, type: FATAL }.
     * Root cause: the same nested flush() problem (src/internal.js:4235, 4277, 4360).
     */
    test("flush() inside a compute does not turn the compute into a FATAL error", () => {
        const s = signal(0);
        let comp;
        const r = root((r) => {
            r.recover(() => true);
            comp = r.compute((cx) => { const v = cx.val(s); flush(); return v; });
            r.effect((cx) => { cx.val(comp); });
            r.effect(s, () => {});
        });
        s.set(1);
        expect(comp.get()).toBe(1);
        r.dispose();
    });

    /**
     * Expected: a root created inside an effect can write signals during setup.
     * Actual: startRoot forces IDLE = true (src/internal.js:4144-4145), so
     * x.set() in the root body flushes synchronously inside the running
     * outer flush. That nested flush crashes on the nulled RECEIVERS slot,
     * and the outer effect is reported FATAL.
     */
    test("a root created inside an effect can write a signal without corrupting the outer flush", () => {
        const s = signal(0);
        const x = signal(0);
        let errors = 0;
        let inner = null;
        const r = root((r) => {
            r.recover(() => { errors++; return true; });
            r.effect(s, (v) => {
                if (v) {
                    inner = root(() => { x.set(v); });
                }
            });
            r.effect(s, () => {});
        });
        s.set(1);
        expect(errors).toBe(0);
        expect(x.get()).toBe(1);
        inner.dispose();
        r.dispose();
    });

    /**
     * Expected: writes after an explicit flush() inside batch() stay
     * coalesced until the batch ends (effect sees "1:3", never "1:2").
     * Actual: seen is ["0:0", "1:0", "1:2", "1:3"].
     * Root cause: flush()'s finally sets IDLE = true (src/internal.js:4360)
     * while batch() is still running fn(), so later set() calls take the
     * idle path and flush on every write.
     */
    test("flush() inside batch keeps later writes in the batch coalesced", () => {
        const a = signal(0);
        const b = signal(0);
        const seen = [];
        const r = root((r) => {
            r.effect((cx) => { seen.push(cx.val(a) + ":" + cx.val(b)); });
        });
        batch(() => {
            a.set(1);
            flush();
            b.set(2);
            b.set(3);
        });
        expect(seen).toEqual(["0:0", "1:0", "1:3"]);
        r.dispose();
    });

    test("an idle updater may call set() and batch() on other signals", () => {
        const a = signal(0);
        const b = signal(0);
        const d = signal(0);
        const seen = [];
        const r = root((r) => {
            r.effect((cx) => { seen.push([cx.val(a), cx.val(b), cx.val(d)].join(",")); });
        });
        a.set((v) => {
            b.set(1);
            batch(() => { d.set(2); });
            return v + 1;
        });
        expect([a.get(), b.get(), d.get()]).toEqual([1, 1, 2]);
        expect(seen[seen.length - 1]).toBe("1,1,2");
        r.dispose();
    });

    test("an inner batch that throws (caught) still lets the outer batch flush once", () => {
        const a = signal(0);
        const b = signal(0);
        let runs = 0;
        const r = root((r) => {
            r.effect((cx) => { cx.val(a); cx.val(b); runs++; });
        });
        runs = 0;
        batch(() => {
            a.set(1);
            try {
                batch(() => {
                    b.set(2);
                    throw new Error("inner");
                });
            } catch (e) { }
            expect(a.get()).toBe(0);
        });
        expect(a.get()).toBe(1);
        expect(b.get()).toBe(2);
        expect(runs).toBe(1);
        r.dispose();
    });
});

describe("writes scheduled while the sender queue drains", () => {
    /**
     * Expected: b.set(5) / b2.post(7), issued from an updater that runs at
     * drain time, are applied.
     * Actual: b and b2 stay 0. Both writes are lost.
     * Root cause: the drain iterates a snapshot `count` and then sets
     * SENDER_COUNT = 0 (src/internal.js:4291-4303). Entries appended past
     * `count` while draining are discarded (and their FLAG_SCHEDULED is left set).
     */
    test("set() and post() from an updater running at drain time are applied", async () => {
        const a = signal(0);
        const b = signal(0);
        const b2 = signal(0);
        batch(() => {
            a.set((v) => {
                b.set(5);
                b2.post(7);
                return v + 1;
            });
        });
        expect(a.get()).toBe(1);
        expect(b.get()).toBe(5);
        await settle();
        expect(b2.get()).toBe(7);
    });

    /**
     * The same root cause, reached naturally: the synchronous prefix of a
     * resource's async callback runs at drain time (asyncAssign -> _runAsync,
     * src/internal.js:664-667). A write it makes before its first await is
     * appended past `count` and dropped.
     * Expected: saving === true, as on the idle r.set(value, fn) path.
     * Actual: saving stays false.
     */
    test("a write made synchronously by a posted resource callback is applied", async () => {
        const r = resource("a");
        const saving = signal(false);
        r.post("b", async (rc) => {
            saving.set(true);
            await rc.suspend(new Promise(() => {}));
        });
        await settle();
        expect(r.get()).toBe("b");
        expect(saving.get()).toBe(true);
    });

    /**
     * Expected: notify() from an updater reaches the subscribers of `b`.
     * Actual: the subscriber never runs. The poke entry is appended past
     * `count` and dropped (src/internal.js:4291-4303).
     */
    test("notify() from an updater running at drain time reaches subscribers", () => {
        const a = signal(0);
        const b = signal({ n: 0 });
        let runs = 0;
        const r = root((r) => {
            r.effect(b, () => { runs++; });
        });
        runs = 0;
        batch(() => {
            a.set((v) => {
                b.get().n = 1;
                b.notify();
                return v + 1;
            });
        });
        expect(runs).toBe(1);
        r.dispose();
    });

    /**
     * Expected: every call of the equality function logs one increment.
     * Actual: eq runs twice (at schedule time and at drain time) but `log`
     * only gets 1. The drain-time write is dropped (src/internal.js:4291-4303).
     */
    test("set() from a custom equality function at drain time is applied", () => {
        let calls = 0;
        const log = signal(0);
        const s = signal(0, (p, n) => {
            calls++;
            log.set((v) => v + 1);
            return p === n;
        });
        batch(() => { s.set(1); });
        expect(s.get()).toBe(1);
        expect(log.get()).toBe(calls);
    });
});

describe("resource writes in queued paths", () => {
    /**
     * Expected: the batched set(fn) settles synchronously with 11
     * (README: "If the callback returns a sync value, it settles immediately").
     * Actual: RangeError "Maximum call stack size exceeded".
     * Root cause: asyncAssign (src/internal.js:664-667) calls _runAsync at
     * drain time, and its sync-result branch calls flush() (src/internal.js:611).
     * The nested flush re-drains SENDERS from index 0, which still holds
     * this entry. That re-runs assign + asyncFn, which flushes again, and so on.
     */
    test("batched resource set(fn) with a sync result settles without overflowing the stack", () => {
        const r = resource(0);
        batch(() => {
            r.set((rr, cur) => cur + 11);
        });
        expect(r.get()).toBe(11);
    });

    /**
     * Same root cause, reached naturally: an effect writes a resource with
     * a sync updater-style async callback (queued since the effect runs
     * inside a flush). Actual: RangeError.
     */
    test("resource set(value, fn) with a sync result from inside an effect does not overflow the stack", () => {
        const s = signal(0);
        const r = resource(0);
        const owner = root((o) => {
            o.effect(s, (v) => {
                if (v) {
                    r.set(v, (rr, optimistic) => optimistic * 2);
                }
            });
        });
        s.set(3);
        expect(r.get()).toBe(6);
        owner.dispose();
    });

    /**
     * Same root cause through the error path: a queued asyncFn that throws
     * synchronously goes to _error -> _settle -> flush() (src/internal.js:1790)
     * during the drain. Actual: RangeError instead of an errored resource.
     */
    test("batched resource set(value, fn) whose fn throws synchronously sets the error state", () => {
        const r = resource(0);
        batch(() => {
            r.set(1, () => { throw new Error("sync fail"); });
        });
        expect(r.is(ERROR)).toBe(true);
    });

    /**
     * Expected: inside a batch, r.set(5) then r.set(asyncFn) keeps 5 visible
     * and passes current = 5 to the callback ("keep current value visible,
     * replace when done"; queued writes apply in order).
     * Actual: r.get() is 0 and the callback sees 0. The single-arg resource
     * form snapshots `this._value` when queued, and asyncAssign writes that
     * snapshot back at drain time, reverting 5.
     * Root cause: src/internal.js:516 (set) and :1878 (post) capture
     * { _value: this._value } eagerly, and assign(node, payload._value)
     * (src/internal.js:665) re-applies it.
     */
    test("queued resource set(asyncFn) does not revert an earlier queued write", () => {
        const r = resource(0);
        let current = null;
        batch(() => {
            r.set(5);
            r.set((rr, cur) => {
                current = cur;
                return new Promise(() => {});
            });
        });
        expect(r.get()).toBe(5);
        expect(current).toBe(5);
    });

    /** Same root cause through post(): src/internal.js:1878. */
    test("resource post(asyncFn) after post(value) does not revert the posted value", async () => {
        const r = resource(0);
        let current = null;
        r.post(5);
        r.post((rr, cur) => {
            current = cur;
            return new Promise(() => {});
        });
        await tick();
        expect(r.get()).toBe(5);
        expect(current).toBe(5);
    });
});

describe("contextual writes (c.set / c.post)", () => {
    /**
     * Expected: after trigger.set(5), comp (which reads `a`) reflects a = 5.
     * Actual: comp.get() returns 0, a stale value, and never recomputes.
     * Root cause: in the same drain, assign(a) marks comp STALE, then
     * comp's own guarded write to `b` runs guardedAssign, whose finally
     * does `receiver._flag &= ~(FLAG_PAUSED | FLAG_STALE | FLAG_PENDING)`
     * (src/internal.js:2016). That wipes staleness that came from another
     * dependency.
     */
    test("a compute's own c.set does not erase staleness caused by another dependency", () => {
        const trigger = signal(0);
        const a = signal(0);
        const b = signal(0);
        let comp;
        const r = root((r) => {
            r.effect(trigger, (t) => { if (t) a.set(t); });
            comp = r.compute((cx) => {
                cx.val(trigger);
                const v = cx.val(a);
                cx.set(b, v);
                return v;
            });
            r.effect((cx) => { cx.val(comp); });
        });
        trigger.set(5);
        expect(a.get()).toBe(5);
        expect(comp.get()).toBe(5);
        r.dispose();
    });

    /**
     * Expected: the effect re-runs with a = 7 (an external write to a dep).
     * Actual: seen is [0, 0]. The effect is marked STALE by assign(a), then
     * its own guarded write's finally clears FLAG_STALE (src/internal.js:2016),
     * so flushEffects skips it.
     */
    test("an effect's own c.set does not swallow an external write to another dependency in the same drain", () => {
        const trigger = signal(0);
        const a = signal(0);
        const b = signal(0);
        const seen = [];
        const r = root((r) => {
            r.effect(trigger, (t) => { if (t) a.set(t); });
            r.effect((cx) => {
                cx.val(trigger);
                seen.push(cx.val(a));
                cx.set(b, seen.length);
            });
        });
        trigger.set(7);
        expect(seen).toEqual([0, 0, 7]);
        r.dispose();
    });

    /**
     * README interceptor pattern: the effect normalizes `name` and writes
     * back a correction with c.set. Another effect writes "CAROL" in the
     * same pass.
     * Expected: the interceptor sees "CAROL" and normalizes it to "carol".
     * Actual: name stays "CAROL" and the interceptor never sees it.
     * Root cause: the drain notifies once per sender. guardedAssign(name)
     * runs first with the interceptor paused, and assign() clears
     * FLAG_SCHEDULED (src/internal.js:648-651). So the later external
     * assign(name, "CAROL") does not notify, and the only receiver that
     * missed the first notification never hears about it.
     */
    test("an interceptor still sees an external write that drains after its own guarded write", () => {
        const name = signal("alice");
        const trigger = signal(0);
        const seen = [];
        const r = root((r) => {
            r.effect((cx) => {
                const v = cx.val(name);
                seen.push(v);
                const low = v.toLowerCase();
                if (low !== v) {
                    cx.set(name, low);
                }
            });
            r.effect(trigger, (t) => { if (t) name.set("CAROL"); });
        });
        batch(() => {
            name.set("BOB");
            trigger.set(1);
        });
        expect(seen).toEqual(["alice", "BOB", "CAROL"]);
        expect(name.get()).toBe("carol");
        r.dispose();
    });

    /**
     * Expected: a writer that reads its target through a compute still sees
     * later external writes.
     * Actual (before fix 10): seen stays [0]. The guarded write marked the
     * compute STALE and its PENDING to the paused writer was cleared, so the
     * compute stayed stale with the writer unmarked. notify() stops at an
     * already-stale compute, so no later write reached the writer.
     */
    test("a writer that reads its target through a compute still sees later writes", () => {
        const s = signal(0);
        const seen = [];
        const r = root((r) => {
            const x = r.compute(s, (v) => v * 10);
            r.effect((cx) => {
                const v = cx.val(x);
                seen.push(v);
                if (v === 0) {
                    cx.set(s, 1);
                }
            });
        });
        expect(s.get()).toBe(1);
        s.set(2);
        expect(seen).toEqual([0, 20]);
        r.dispose();
    });

    /** The interceptor case above, reading `name` through a compute. */
    test("an interceptor reading through a compute sees an external write in the same drain", () => {
        const name = signal("alice");
        const trigger = signal(0);
        const seen = [];
        const r = root((r) => {
            const x = r.compute(name, (v) => v);
            r.effect((cx) => {
                const v = cx.val(x);
                seen.push(v);
                const low = v.toLowerCase();
                if (low !== v) {
                    cx.set(name, low);
                }
            });
            r.effect(trigger, (t) => { if (t) name.set("CAROL"); });
        });
        batch(() => {
            name.set("BOB");
            trigger.set(1);
        });
        expect(seen).toEqual(["alice", "BOB", "CAROL"]);
        expect(name.get()).toBe("carol");
        r.dispose();
    });

    /**
     * Expected: a paused spawn does not re-run when a dep changes.
     * Actual: the spawn's own c.post (after an await) drains through
     * guardedAssign, whose finally clears FLAG_PAUSED (src/internal.js:2016).
     * That silently resumes the spawn, and it re-runs on name.set("b").
     */
    test("a paused spawn stays paused after its own contextual post drains", async () => {
        const name = signal("a");
        const saved = signal(0);
        const seen = [];
        let release;
        let node;
        const r = root((r) => {
            node = r.spawn(async (cx) => {
                seen.push(cx.val(name));
                await cx.suspend(new Promise((res) => { release = res; }));
                cx.post(saved, 1);
            });
        });
        node.pause();
        release();
        await settle();
        expect(saved.get()).toBe(1);
        name.set("b");
        expect(seen).toEqual(["a"]);
        r.dispose();
    });

    /**
     * Expected: an effect that went stale while paused re-runs on resume()
     * (README pause/resume).
     * Actual: the guarded write cleared FLAG_PAUSED and FLAG_STALE
     * (src/internal.js:2016), so resume() is a no-op and the "b" update
     * is lost.
     */
    test("resume() re-runs an effect that went stale while paused, even if its c.post drained meanwhile", async () => {
        const name = signal("a");
        const saved = signal(0);
        const seen = [];
        let ctx;
        let node;
        const r = root((r) => {
            node = r.effect((cx) => {
                ctx = cx;
                seen.push(cx.val(name));
            });
        });
        ctx.post(saved, 1);
        node.pause();
        name.set("b");
        await tick();
        expect(saved.get()).toBe(1);
        node.resume();
        expect(seen).toEqual(["a", "b"]);
        r.dispose();
    });

    /**
     * Expected: c.set on a signal(v, false) with a void updater keeps the
     * mutated object, like set() and the queued c.set path do.
     * Actual: the value becomes undefined.
     * Root cause: the IDLE branch of contextSet does `_value = value(sender._value)`
     * and writes it unconditionally (src/internal.js:2054, 2067). It lacks
     * the `write = false` handling for FLAG_MUTABLE in set()/assign().
     */
    test("idle c.set with a void updater on signal(v, false) keeps the mutated value", async () => {
        const list = signal([], false);
        let runs = 0;
        const r = root((r) => {
            r.effect(list, () => { runs++; });
            r.spawn(async (cx) => {
                await cx.suspend(Promise.resolve());
                cx.set(list, (arr) => { arr.push(1); });
            });
        });
        await settle();
        expect(list.get()).toEqual([1]);
        expect(runs).toBe(2);
        r.dispose();
    });

    test("an idle set supersedes a queued contextual post", async () => {
        const s = signal(0);
        let ctx;
        const seen = [];
        const r = root((r) => {
            r.effect((cx) => { ctx = cx; });
            r.effect(s, (v) => { seen.push(v); });
        });
        ctx.post(s, 1);
        s.set(2);
        await tick();
        expect(s.get()).toBe(2);
        expect(seen).toEqual([0, 2]);
        r.dispose();
    });

    test("self-guarded c.set inside a batch with other writes runs the writer once", () => {
        const a = signal(0);
        const b = signal(0);
        let runs = 0;
        const r = root((r) => {
            r.effect((cx) => {
                runs++;
                const v = cx.val(a);
                cx.val(b);
                cx.set(b, v * 2);
            });
        });
        runs = 0;
        batch(() => {
            a.set(3);
        });
        expect(b.get()).toBe(6);
        expect(runs).toBe(1);
        r.dispose();
    });
});

describe("posts and microtasks", () => {
    test("post, flush(), then post again in the same tick: both apply in order", async () => {
        const s = signal(0);
        const seen = [];
        const r = root((r) => {
            r.effect(s, (v) => { seen.push(v); });
        });
        s.post(1);
        flush();
        expect(s.get()).toBe(1);
        s.post(2);
        expect(s.get()).toBe(1);
        await tick();
        expect(s.get()).toBe(2);
        expect(seen).toEqual([0, 1, 2]);
        r.dispose();
    });

    test("post inside batch is applied when the batch ends, not deferred to the microtask", () => {
        const s = signal(0);
        batch(() => {
            s.post(1);
            expect(s.get()).toBe(0);
        });
        expect(s.get()).toBe(1);
    });

    test("post, await, post: each microtask flush notifies once", async () => {
        const s = signal(0);
        const seen = [];
        const r = root((r) => {
            r.effect(s, (v) => { seen.push(v); });
        });
        s.post(1);
        s.post(2);
        await tick();
        s.post((v) => v + 1);
        await tick();
        expect(seen).toEqual([0, 2, 3]);
        r.dispose();
    });

    test("a post from a microtask queued behind the pending microflush gets its own flush", async () => {
        const s = signal(0);
        const seen = [];
        const r = root((r) => {
            r.effect(s, (v) => { seen.push(v); });
        });
        s.post(1);
        queueMicrotask(() => { s.post((v) => v + 1); });
        await settle();
        expect(s.get()).toBe(2);
        expect(seen).toEqual([0, 1, 2]);
        r.dispose();
    });

    test("an unchanged set does not flush pending posts on another signal early", async () => {
        const a = signal(0);
        const b = signal(0);
        b.post(5);
        expect(a.set(0)).toBe(false);
        expect(b.get()).toBe(0);
        await tick();
        expect(b.get()).toBe(5);
    });

    test("a post written during a microflush by an effect is drained in the same flush", async () => {
        const a = signal(0);
        const b = signal(0);
        const seen = [];
        const r = root((r) => {
            r.effect(a, (v) => { if (v) b.post(v * 10); });
            r.effect(b, (v) => { seen.push(v); });
        });
        a.post(1);
        await tick();
        expect(b.get()).toBe(10);
        expect(seen).toEqual([0, 10]);
        r.dispose();
    });
});

describe("notify() interplay", () => {
    test("notify() and a changing set in one batch notify subscribers once", () => {
        const s = signal(0);
        let runs = 0;
        const r = root((r) => {
            r.effect(s, () => { runs++; });
        });
        runs = 0;
        batch(() => {
            s.notify();
            s.set(1);
            s.notify();
        });
        expect(runs).toBe(1);
        expect(s.get()).toBe(1);
        r.dispose();
    });
});

describe("ordering and glitch-freedom", () => {
    test("an effect sees a consistent snapshot of signals and a derived compute written in one batch", () => {
        const a = signal(1);
        const b = signal(2);
        const seen = [];
        const r = root((r) => {
            const sum = r.compute((cx) => cx.val(a) + cx.val(b));
            r.effect((cx) => {
                seen.push([cx.val(a), cx.val(b), cx.val(sum)].join(","));
            });
        });
        batch(() => {
            a.set(10);
            b.set(20);
            a.set((v) => v + 1);
        });
        expect(seen).toEqual(["1,2,3", "11,20,31"]);
        r.dispose();
    });

    test("signal(v, false) updaters queued in one batch notify once with both mutations", () => {
        const obj = signal({ n: 0 }, false);
        const seen = [];
        const r = root((r) => {
            r.effect(obj, (o) => { seen.push(o.n); });
        });
        batch(() => {
            obj.set((o) => { o.n++; });
            obj.set((o) => { o.n++; });
        });
        expect(seen).toEqual([0, 2]);
        r.dispose();
    });

    test("signal(v, eq): an eq-equal write in a batch is skipped and later changes still notify", async () => {
        const s = signal({ id: 1 }, (p, n) => p.id === n.id);
        const seen = [];
        const r = root((r) => {
            r.effect(s, (v) => { seen.push(v.id); });
        });
        let ret;
        batch(() => {
            ret = s.set({ id: 1 });
        });
        expect(ret).toBe(false);
        expect(seen).toEqual([1]);

        s.post({ id: 1 });
        s.post({ id: 2 });
        await tick();
        expect(seen).toEqual([1, 2]);
        r.dispose();
    });
});

describe("dispose interplay", () => {
});
