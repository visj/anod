import { describe, test, expect } from "#test-runner";
import {
    Effect, Root, Fatal, signal, root, batch, connect, addOwned, startRoot, startEffect,
    FLAG_STABLE, FLAG_BOUND, FLAG_SINGLE, FLAG_OWNER, FLAG_DISPOSED, DISPOSED
} from "../../src/internal.js";

/**
 * Spike, design C: the keyed list of keyed-list.test.js, with its items
 * kept in the list's _owned. Then pause() reaches them, and the list is
 * queued ahead of their effects, as an owner with children is. A re-run
 * would dispose them, so the list decides what its re-run tears down,
 * through a hook anod does not have yet. Skipped until it does. The hook,
 * as tried (all of these pass with it, and so does the full suite):
 *
 *     // clearRun()
 *     let owned = owner._owned !== null ? owner._clearOwned() : null;
 *
 *     RootProto._clearOwned = EffectProto._clearOwned = function () {
 *         return clearOwned(this);
 *     };
 *
 * The override below tells a re-run from a disposal by FLAG_DISPOSED,
 * which _dispose() sets before it tears down.
 */
function ListEffect(owner, list, key, render) {
    Effect.call(this, FLAG_STABLE | FLAG_BOUND | FLAG_SINGLE, reconcile, list, owner, void 0);
    this._key = key;
    this._render = render;
    this._items = new Map();
}
ListEffect.prototype = Object.create(Effect.prototype);
ListEffect.prototype.constructor = ListEffect;
ListEffect.prototype._clearOwned = function () {
    /** A re-run keeps the items; only the disposal tears them down. */
    if (!(this._flag & FLAG_DISPOSED)) {
        return null;
    }
    let error = null;
    let owned = this._owned;
    while (owned.length > 0) {
        let err = owned.pop()._dispose();
        if (error === null) {
            error = err;
        }
    }
    this._items = new Map();
    return error;
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
            let index = signal(i);
            let r = new Root();
            r._owner = list;
            r._level = list._level;
            addOwned(list, r);
            startRoot(r, (rc) => list._render(rc, value, index));
            item = { root: r, index };
        }
        next.set(k, item);
    }
    let error = null;
    prev.forEach((item) => {
        let err = item.root._dispose();
        let i = list._owned.lastIndexOf(item.root);
        if (i !== -1) {
            list._owned.splice(i, 1);
        }
        if (error === null) {
            error = err;
        }
    });
    list._items = next;
    if (error !== null) {
        throw error;
    }
}

function For(owner, list, key, render) {
    let node = new ListEffect(owner, list, key, render);
    node._dep1slot = connect(list, node, -1);
    node._level = owner._level + 1;
    node._owned = [];
    if (owner._flag & FLAG_OWNER) {
        addOwned(owner, node);
    }
    startEffect(node);
    return node;
}

const tick = () => Promise.resolve();
const settle = () => tick().then(tick).then(tick);

describe.skip("keyed list spike, design C (hook)", () => {
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

    test("a removed item's effect doesn't run again when its signal is written first", () => {
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

    test("pausing the outer root pauses the items too", () => {
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
