import { describe, test, expect } from "#test-runner";
import {
    Effect,
    Root,
    Fatal,
    signal,
    root,
    batch,
    connect,
    addOwned,
    startRoot,
    startEffect,
    FLAG_STABLE,
    FLAG_BOUND,
    FLAG_SINGLE,
    FLAG_OWNER,
    FLAG_SHIELD,
    DISPOSED
} from "../../src/internal.js";

/**
 * Spike: a keyed list in the style of Solid's <For>, built the way
 * katode would build it on anod, by extending Effect.
 *
 * The list is a bound effect on an array signal. Each item is a Root
 * whose _owner is the list, so the item's errors (and c.fatal()) travel
 * up through the list, but which is not in the list's _owned, so the
 * list's re-runs leave it alone. The list reconciles by key on each
 * run: it keeps the roots of the keys it still has, updates their index
 * signal, creates roots for new keys and disposes the roots of removed
 * ones. Its _dispose override disposes every item, then the list itself.
 *
 * Imports the source, since the dist build renames every _ property.
 */
function ListEffect(owner, list, key, render) {
    Effect.call(this, FLAG_STABLE | FLAG_BOUND | FLAG_SINGLE, reconcile, list, owner, void 0);
    this._key = key;
    this._render = render;
    this._items = new Map();
}
ListEffect.prototype = Object.create(Effect.prototype);
ListEffect.prototype.constructor = ListEffect;

/** Items are torn down first, last first, as children are; a shielded
 *  list defers. */
ListEffect.prototype._dispose = function () {
    let error = null;
    if (!(this._flag & FLAG_SHIELD)) {
        let items = Array.from(this._items.values());
        for (let i = items.length - 1; i >= 0; i--) {
            let err = items[i].root._dispose();
            if (error === null) {
                error = err;
            }
        }
        this._items = new Map();
    }
    let err = Effect.prototype._dispose.call(this);
    return error !== null ? error : err;
};

function reconcile(values, list) {
    let prev = list._items;
    let next = new Map();
    for (let i = 0; i < values.length; i++) {
        let value = values[i];
        let k = list._key(value);
        let item = prev.get(k);
        if (item !== void 0) {
            prev.delete(k);
            item.index.set(i);
        } else {
            item = createItem(list, value, i);
        }
        next.set(k, item);
    }
    /** Torn down now, as a re-run tears down its children: a queued
     *  dispose() would let the item's effects run once more first. */
    let error = null;
    prev.forEach((item) => {
        let err = item.root._dispose();
        if (error === null) {
            error = err;
        }
    });
    list._items = next;
    if (error !== null) {
        throw error;
    }
}

function createItem(list, value, i) {
    let index = signal(i);
    let r = new Root();
    r._owner = list;
    /** The item's effects run one level below the list, as its children would. */
    r._level = list._level;
    startRoot(r, (rc) => list._render(rc, value, index));
    return { root: r, index };
}

/** The factory, as makeEffect does it, without the LEVELS growth it can't reach. */
function For(owner, list, key, render) {
    let node = new ListEffect(owner, list, key, render);
    node._dep1slot = connect(list, node, -1);
    node._level = owner._level + 1;
    if (owner._flag & FLAG_OWNER) {
        addOwned(owner, node);
    }
    startEffect(node);
    return node;
}

const tick = () => Promise.resolve();
const settle = () => tick().then(tick).then(tick);

describe("keyed list spike (Solid's <For> on an Effect subclass)", () => {
    test("items survive the list's re-runs: only added and removed keys create and dispose", () => {
        const todos = signal([{ id: 1 }, { id: 2 }]);
        const log = [];
        const r = root((r) => {
            For(r, todos, (t) => t.id, (rc, todo) => {
                log.push("create " + todo.id);
                rc.cleanup(() => log.push("dispose " + todo.id));
            });
        });
        expect(log).toEqual(["create 1", "create 2"]);
        todos.set([{ id: 1 }, { id: 2 }, { id: 3 }]);
        expect(log).toEqual(["create 1", "create 2", "create 3"]);
        todos.set([{ id: 3 }, { id: 1 }]);
        expect(log).toEqual(["create 1", "create 2", "create 3", "dispose 2"]);
        r.dispose();
    });

    test("a reorder keeps each item and updates its index signal", () => {
        const items = signal(["a", "b", "c"]);
        const seen = {};
        const r = root((r) => {
            For(r, items, (x) => x, (rc, x, index) => {
                rc.effect(index, (i) => { seen[x] = i; });
            });
        });
        expect(seen).toEqual({ a: 0, b: 1, c: 2 });
        items.set(["c", "a", "b"]);
        expect(seen).toEqual({ a: 1, b: 2, c: 0 });
        r.dispose();
    });

    test("an item reacts to its own signals without re-running the list", () => {
        const counts = [signal(0), signal(0)];
        const items = signal([0, 1]);
        let listRuns = 0;
        const seen = [];
        const r = root((r) => {
            For(r, items, (x) => x, (rc, x) => {
                listRuns++;
                rc.effect(counts[x], (n) => { seen.push(x + ":" + n); });
            });
        });
        expect(listRuns).toBe(2);
        counts[1].set(5);
        expect(seen).toEqual(["0:0", "1:0", "1:5"]);
        expect(listRuns).toBe(2);
        r.dispose();
    });

    test("an item's error goes to the list's recover handlers", () => {
        const bad = signal(false);
        const caught = [];
        const r = root((r) => {
            const list = For(r, signal([1]), (x) => x, (rc) => {
                rc.effect(bad, (b) => {
                    if (b) {
                        throw new Error("item failed");
                    }
                });
            });
            list.recover((e) => { caught.push("list: " + e.error.message); });
            r.recover((e) => { caught.push("root: " + e.error.message); });
        });
        bad.set(true);
        expect(caught).toEqual(["list: item failed"]);
        r.dispose();
    });

    test("an item's error the list doesn't handle goes on to the outer root", () => {
        const bad = signal(false);
        const caught = [];
        const r = root((r) => {
            For(r, signal([1]), (x) => x, (rc) => {
                rc.effect(bad, (b) => {
                    if (b) {
                        throw new Error("item failed");
                    }
                });
            });
            r.recover((e) => { caught.push("root: " + e.error.message); });
        });
        bad.set(true);
        expect(caught).toEqual(["root: item failed"]);
        r.dispose();
    });

    test("disposing the outer root disposes every item, last first, before the list's own cleanups", () => {
        const log = [];
        let list;
        const r = root((r) => {
            r.cleanup(() => log.push("root"));
            list = For(r, signal([1, 2]), (x) => x, (rc, x) => {
                rc.cleanup(() => log.push("item " + x));
            });
            list.cleanup(() => log.push("list"));
        });
        r.dispose();
        expect(log).toEqual(["item 2", "item 1", "list", "root"]);
        expect(list.is(DISPOSED)).toBe(true);
    });

    test("a re-run of the outer owner disposes the list and its items", () => {
        const page = signal(1);
        const log = [];
        const r = root((r) => {
            r.effect(page, (p, c) => {
                For(c, signal(["x", "y"]), (x) => x, (rc, x) => {
                    log.push("create " + p + x);
                    rc.cleanup(() => log.push("dispose " + p + x));
                });
            });
        });
        page.set(2);
        expect(log).toEqual([
            "create 1x", "create 1y",
            "dispose 1y", "dispose 1x",
            "create 2x", "create 2y"
        ]);
        r.dispose();
    });

    test("a removed item's effect doesn't run again when its signal changes in the same batch", () => {
        const items = signal([1, 2]);
        const value = signal(0);
        const seen = [];
        const r = root((r) => {
            For(r, items, (x) => x, (rc, x) => {
                rc.effect(value, (v) => { seen.push(x + ":" + v); });
            });
        });
        batch(() => {
            items.set([1]);
            value.set(1);
        });
        expect(seen).toEqual(["1:0", "2:0", "1:1"]);
        r.dispose();
    });

    /**
     * Gap: the list owns nothing, so it is queued with the flat effects,
     * not ahead of them as an owner with children is. Its items' effects
     * can run before it reconciles, a removed one included. Passes with
     * design C (keyed-list-hook.test.js).
     */
    test.skip("a removed item's effect doesn't run again when its signal is written first", () => {
        const items = signal([1, 2]);
        const value = signal(0);
        const seen = [];
        const r = root((r) => {
            For(r, items, (x) => x, (rc, x) => {
                rc.effect(value, (v) => { seen.push(x + ":" + v); });
            });
        });
        batch(() => {
            value.set(1);
            items.set([1]);
        });
        expect(seen).toEqual(["1:0", "2:0", "1:1"]);
        r.dispose();
    });

    test("c.fatal() inside an item ends the whole tree", () => {
        const boom = signal(false);
        let r;
        expect(() => {
            r = root((r) => {
                For(r, signal([1]), (x) => x, (rc) => {
                    rc.effect(boom, (b, c) => {
                        if (b) {
                            c.fatal("item");
                        }
                    });
                });
            });
            boom.set(true);
        }).toThrow(Fatal);
        expect(r.is(DISPOSED)).toBe(true);
    });

    /**
     * Gap: pause() and resume() walk _owned, and the items are not in it.
     * Passes with design C (keyed-list-hook.test.js).
     */
    test.skip("pausing the outer root pauses the items too", () => {
        const value = signal(0);
        const seen = [];
        const r = root((r) => {
            For(r, signal([1]), (x) => x, (rc) => {
                rc.effect(value, (v) => { seen.push(v); });
            });
        });
        r.pause();
        value.set(1);
        expect(seen).toEqual([0]);
        r.resume();
        expect(seen).toEqual([0, 1]);
        r.dispose();
    });

    test("a shielded item holds the list's re-run until it ends", async () => {
        const items = signal([1]);
        let release;
        const log = [];
        const r = root((r) => {
            For(r, items, (x) => x, (rc, x) => {
                rc.spawn(async (c) => {
                    c.shield();
                    log.push("start " + x);
                    await c.suspend(new Promise((res) => { release = res; }));
                    log.push("end " + x);
                });
            });
        });
        items.set([1, 2]);
        expect(log).toEqual(["start 1"]);
        release();
        await settle();
        expect(log).toEqual(["start 1", "end 1", "start 2"]);
        r.dispose();
    });
});
