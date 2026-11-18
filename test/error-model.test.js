import { describe, test, expect } from "#test-runner";
import { signal, root, batch, c, REFUSE, PANIC, Fatal, DISPOSED, ERROR } from "#anod-src";
import { Defect } from "../src/internal.js";
import { spawnSync } from "node:child_process";

const tick = () => Promise.resolve();
const settle = () => tick().then(tick).then(tick);

/** Runs fn, and returns what it threw, or null. */
function thrown(fn) {
    try {
        fn();
    } catch (err) {
        return err;
    }
    return null;
}

describe("recover: handled unless the handler throws", () => {
    test("a handler that returns has handled the error, whatever it returns", () => {
        const s = signal(0);
        const seen = [];
        let e;
        root((r) => {
            r.recover(() => {
                seen.push("root");
            });
            e = r.effect((cx) => {
                cx.recover(() => {
                    seen.push("own");
                    return false;
                });
                if (cx.val(s) === 1) {
                    throw new Error("boom");
                }
            });
        });
        s.set(1);
        expect(seen).toEqual(["own"]);
        expect(e.is(DISPOSED)).toBe(false);
    });

    test("a handler that throws replaces the error for the next handler and the owners", () => {
        const seen = [];
        root((r) => {
            r.recover((err) => {
                seen.push("root: " + err.error);
            });
            r.effect((cx) => {
                cx.recover((err) => {
                    seen.push("first: " + err.error.message);
                    cx.panic("replaced");
                });
                cx.recover((err) => {
                    seen.push("second: " + err.error);
                    throw err;
                });
                throw new Error("original");
            });
        });
        expect(seen).toEqual(["first: original", "second: replaced", "root: replaced"]);
    });

    test("a thrown non-Defect replaces the error as a PANIC", () => {
        let seen = null;
        root((r) => {
            r.recover((err) => {
                seen = err;
            });
            r.effect((cx) => {
                cx.recover(() => {
                    throw "from handler";
                });
                throw new Error("original");
            });
        });
        expect(seen.type).toBe(PANIC);
        expect(seen.error).toBe("from handler");
    });

    test("what no handler takes reaches the creator, the replaced error included", () => {
        const err = thrown(() => {
            root((r) => {
                r.recover((e) => {
                    r.panic("from root");
                });
                r.effect(() => {
                    throw new Error("original");
                });
            });
        });
        expect(err.type).toBe(PANIC);
        expect(err.error).toBe("from root");
    });
});

describe("failing goes through c", () => {
    test("c.refuse keeps a Defect instead of wrapping it again", () => {
        const s = signal(-1);
        const a = c.compute((cx) => {
            const v = cx.val(s);
            return v < 0 ? cx.refuse("neg") : v;
        });
        const b = c.compute((cx) => {
            const err = cx.rejected(a);
            return err !== null ? cx.refuse(err) : 1;
        });
        expect(b.get()).toBe(a.get());
        expect(b.get().type).toBe(REFUSE);
        expect(b.get().error).toBe("neg");
    });

    test("c.refuse holds any value, an Error with its stack included", () => {
        const e = new Error("oh no");
        const a = c.compute((cx) => cx.refuse(e));
        expect(a.get().error).toBe(e);
        expect(typeof a.get().error.stack).toBe("string");
    });

    test("c.panic turns a REFUSE into a PANIC with the same error, and passes a PANIC on", () => {
        const a = c.compute((cx) => cx.refuse("neg"));
        const b = c.compute((cx) => {
            cx.panic(cx.rejected(a));
        });
        const d = c.compute((cx) => {
            cx.panic(cx.rejected(b));
        });
        expect(b.get().type).toBe(PANIC);
        expect(b.get().error).toBe("neg");
        expect(d.get()).toBe(b.get());
    });

    test("roots, effects and actions panic", () => {
        let seen = [];
        root((r) => {
            r.recover((err) => {
                seen.push(err.type + ":" + err.error);
            });
            r.action((cx) => {
                cx.panic("action");
            });
            r.effect((cx) => {
                cx.panic("effect");
            });
        });
        expect(seen).toEqual([PANIC + ":action", PANIC + ":effect"]);
    });

    test("an owner's c.fatal() ends its tree wherever it is called from", () => {
        let r1;
        let err = null;
        try {
            root((r) => {
                r1 = r;
                /** A compute that reaches it through a closure. */
                r.compute(() => {
                    r.fatal("through a closure");
                });
            });
        } catch (e) {
            err = e;
        }
        expect(err).toBeInstanceOf(Fatal);
        expect(err.errors).toEqual(["through a closure"]);
        expect(r1.is(DISPOSED)).toBe(true);
    });

    test("catching what c.fatal() throws does not save the tree", () => {
        const s = signal(0);
        let after = 0;
        const r1 = root((r) => {
            r.effect((cx) => {
                if (cx.val(s) === 1) {
                    try {
                        cx.fatal("caught");
                    } catch (e) {
                        after++;
                    }
                }
            });
        });
        let err = null;
        try {
            s.set(1);
        } catch (e) {
            err = e;
        }
        expect(after).toBe(1);
        expect(err).toBeInstanceOf(Fatal);
        expect(err.errors).toEqual(["caught"]);
        expect(r1.is(DISPOSED)).toBe(true);
    });

    test("c.fatal escalates a Defect's error", () => {
        let caught = null;
        try {
            root((r) => {
                r.recover((err) => {
                    r.fatal(err);
                });
                r.effect(() => {
                    throw new Error("boom");
                });
            });
        } catch (err) {
            caught = err;
        }
        expect(caught).toBeInstanceOf(Fatal);
        expect(caught.errors.length).toBe(1);
        expect(caught.errors[0].message).toBe("boom");
    });
});

describe("a REFUSE that reaches an effect is a PANIC", () => {
    test("recover sees a PANIC with the refused error", () => {
        const s = signal(1);
        let seen = null;
        root((r) => {
            const a = r.compute((cx) => {
                const v = cx.val(s);
                return v < 0 ? cx.refuse("neg") : v;
            });
            r.recover((err) => {
                seen = err;
            });
            r.effect((cx) => {
                cx.val(a);
            });
        });
        s.set(-1);
        expect(seen.type).toBe(PANIC);
        expect(seen.error).toBe("neg");
    });

    test("an effect's thrown REFUSE reaches its creator as a PANIC", () => {
        const err = thrown(() => {
            c.effect(() => {
                throw new Defect("expected", REFUSE);
            });
        });
        expect(err.type).toBe(PANIC);
        expect(err.error).toBe("expected");
    });
});

describe("FATAL tears its tree down", () => {
    test("no handler is asked, the tree is disposed, and the writer gets a Fatal", () => {
        const s = signal(0);
        const seen = [];
        let r1, inner, sibling;
        r1 = root((r) => {
            r.recover(() => {
                seen.push("root");
            });
            r.cleanup(() => seen.push("root cleanup"));
            r.effect((cx) => {
                cx.recover(() => {
                    seen.push("outer");
                });
                inner = cx.effect((cx2) => {
                    cx2.recover(() => {
                        seen.push("inner");
                    });
                    cx2.cleanup(() => seen.push("inner cleanup"));
                    if (cx2.val(s) === 1) {
                        cx2.fatal("give up");
                    }
                });
            });
            sibling = r.effect((cx) => {
                cx.val(s);
                seen.push("sibling ran");
            });
        });
        seen.length = 0;
        const err = thrown(() => s.set(1));
        expect(err).toBeInstanceOf(Fatal);
        expect(err.errors).toEqual(["give up"]);
        expect(seen).not.toContain("root");
        expect(seen).not.toContain("outer");
        expect(seen).not.toContain("inner");
        expect(seen).toContain("inner cleanup");
        expect(seen).toContain("root cleanup");
        expect(r1.is(DISPOSED)).toBe(true);
        expect(inner.is(DISPOSED)).toBe(true);
        expect(sibling.is(DISPOSED)).toBe(true);
    });

    test("other trees are left alone", () => {
        const s = signal(0);
        let other = 0;
        let r1, r2;
        r1 = root((r) => {
            r.effect((cx) => {
                if (cx.val(s) === 1) {
                    cx.fatal("one tree");
                }
            });
        });
        r2 = root((r) => {
            r.effect((cx) => {
                cx.val(s);
                other++;
            });
        });
        expect(() => s.set(1)).toThrow();
        expect(r1.is(DISPOSED)).toBe(true);
        expect(r2.is(DISPOSED)).toBe(false);
        expect(other).toBe(2);
        s.set(2);
        expect(other).toBe(3);
    });

    test("an effect made on the global c is its own tree", () => {
        const s = signal(0);
        const e = c.effect((cx) => {
            if (cx.val(s) === 1) {
                cx.fatal("alone");
            }
        });
        const err = thrown(() => s.set(1));
        expect(err).toBeInstanceOf(Fatal);
        expect(e.is(DISPOSED)).toBe(true);
    });

    test("every FATAL of a flush is in one Fatal, and a Fatal comes before a panic", () => {
        const s = signal(0);
        root((r) => {
            r.effect((cx) => {
                if (cx.val(s) === 1) {
                    cx.fatal("first");
                }
            });
        });
        c.effect((cx) => {
            if (cx.val(s) === 1) {
                throw new Error("a panic");
            }
        });
        root((r) => {
            r.effect((cx) => {
                if (cx.val(s) === 1) {
                    cx.fatal("second");
                }
            });
        });
        const err = thrown(() => s.set(1));
        expect(err).toBeInstanceOf(Fatal);
        expect(err.errors).toEqual(["first", "second"]);
        /** The next flush starts clean. */
        expect(() => s.set(2)).not.toThrow();
    });

    test("a FATAL in a root's fn disposes it and reaches root()'s caller", () => {
        let r1 = null;
        const err = thrown(() => {
            r1 = root((r) => {
                r.cleanup(() => {});
                r.fatal("setup failed");
            });
        });
        expect(err).toBeInstanceOf(Fatal);
        expect(err.errors).toEqual(["setup failed"]);
    });

    test("a FATAL in a new effect reaches the creator at idle as a Fatal", () => {
        let r1;
        const err = thrown(() => {
            r1 = root((r) => {
                r.effect((cx) => {
                    cx.fatal("first run");
                });
            });
        });
        expect(err).toBeInstanceOf(Fatal);
        expect(err.errors).toEqual(["first run"]);
    });

    test("a creator in another tree is not stopped, and the flush throws the Fatal", () => {
        const s = signal(0);
        let after = false;
        let child;
        const outer = root((r) => {
            r.effect((cx) => {
                if (cx.val(s) === 1) {
                    child = c.effect((cx2) => {
                        cx2.fatal("child tree");
                    });
                    after = true;
                }
            });
        });
        const err = thrown(() => s.set(1));
        expect(err).toBeInstanceOf(Fatal);
        expect(after).toBe(true);
        expect(child.is(DISPOSED)).toBe(true);
        expect(outer.is(DISPOSED)).toBe(false);
    });

    test("a cleanup that throws during the teardown is dropped, and asks no handler", () => {
        const s = signal(0);
        const seen = [];
        let r1;
        r1 = root((r) => {
            r.recover((err) => {
                seen.push("root: " + err.error);
            });
            r.cleanup(() => seen.push("root cleanup"));
            r.effect((cx) => {
                if (cx.val(s) === 1) {
                    cx.cleanup(() => {
                        throw new Error("cleanup");
                    });
                    cx.fatal("fatal");
                }
            });
            r.effect((cx) => {
                cx.cleanup(() => {
                    throw new Error("sibling cleanup");
                });
            });
        });
        const err = thrown(() => s.set(1));
        expect(err).toBeInstanceOf(Fatal);
        expect(err.errors).toEqual(["fatal"]);
        expect(seen).toEqual(["root cleanup"]);
        expect(r1.is(DISPOSED)).toBe(true);
    });

    test("a shielded tree is ended rather than waited for", async () => {
        const s = signal(0);
        let release;
        const gate = new Promise((resolve) => { release = resolve; });
        let r1;
        r1 = root((r) => {
            r.spawn(async (cx) => {
                cx.shield();
                await cx.suspend(gate);
            });
            r.effect((cx) => {
                if (cx.val(s) === 1) {
                    cx.fatal("now");
                }
            });
        });
        const err = thrown(() => s.set(1));
        expect(err).toBeInstanceOf(Fatal);
        expect(r1.is(DISPOSED)).toBe(true);
        release();
        await settle();
    });

    test("the shielded effect itself can end its tree mid-run", () => {
        const src = new URL("../src/index.js", import.meta.url).href;
        const script = `
            import { root, signal, DISPOSED, Fatal } from ${JSON.stringify(src)};
            let seen = null;
            process.on("unhandledRejection", (reason) => {
                seen = { fatal: reason instanceof Fatal, errors: reason.errors };
            });
            const s = signal(0);
            let after = false;
            const r1 = root((r) => {
                r.spawn(async (cx) => {
                    cx.val(s);
                    cx.shield();
                    await cx.suspend(Promise.resolve());
                    cx.fatal("shielded");
                    after = true;
                });
            });
            setTimeout(() => {
                s.set(1);
                console.log(JSON.stringify({ disposed: r1.is(DISPOSED), after, seen }));
            }, 20);
        `;
        const args = process.versions.bun !== void 0 ? ["-e", script] : ["--input-type=module", "-e", script];
        const out = spawnSync(process.execPath, args, { encoding: "utf8" });
        expect(JSON.parse(out.stdout.trim())).toEqual({
            disposed: true,
            after: false,
            seen: { fatal: true, errors: ["shielded"] }
        });
    });

    test("a Fatal thrown again inside a node is an ordinary PANIC", () => {
        const s = signal(0);
        let caught = null;
        root((r) => {
            r.effect((cx) => {
                if (cx.val(s) === 1) {
                    cx.fatal("first");
                }
            });
        });
        try {
            s.set(1);
        } catch (e) {
            caught = e;
        }
        expect(caught).toBeInstanceOf(Fatal);
        const t = signal(0);
        const seen = [];
        const r2 = root((r) => {
            r.recover((err) => {
                seen.push(err);
            });
            r.effect((cx) => {
                if (cx.val(t) === 1) {
                    throw caught;
                }
            });
        });
        t.set(1);
        expect(seen.length).toBe(1);
        expect(seen[0].type).toBe(PANIC);
        expect(seen[0].error).toBe(caught);
        expect(r2.is(DISPOSED)).toBe(false);
    });

    /** Nothing can catch it there, so it is an unhandled rejection: a test
     *  runner fails on one, so it runs in a process of its own. */
    test("a FATAL in a spawn after an await disposes its tree and is an unhandled rejection", () => {
        const src = new URL("../src/index.js", import.meta.url).href;
        const script = `
            import { root, DISPOSED, Fatal } from ${JSON.stringify(src)};
            let seen = null;
            process.on("unhandledRejection", (reason) => {
                seen = { fatal: reason instanceof Fatal, errors: reason.errors };
            });
            const r1 = root((r) => {
                r.spawn(async (cx) => {
                    await cx.suspend(Promise.resolve());
                    cx.fatal("late");
                });
            });
            setTimeout(() => {
                console.log(JSON.stringify({ disposed: r1.is(DISPOSED), seen }));
            }, 20);
        `;
        const args = process.versions.bun !== void 0 ? ["-e", script] : ["--input-type=module", "-e", script];
        const out = spawnSync(process.execPath, args, { encoding: "utf8" });
        expect(JSON.parse(out.stdout.trim())).toEqual({
            disposed: true,
            seen: { fatal: true, errors: ["late"] }
        });
    });

    test("a handler that escalates an async failure ends the tree, as an unhandled rejection", () => {
        const src = new URL("../src/index.js", import.meta.url).href;
        const script = `
            import { root, DISPOSED, Fatal } from ${JSON.stringify(src)};
            let seen = null;
            process.on("unhandledRejection", (reason) => {
                seen = { fatal: reason instanceof Fatal, errors: reason.errors };
            });
            const r1 = root((r) => {
                r.recover((err) => {
                    r.fatal(err);
                });
                r.spawn(async (cx) => {
                    await cx.suspend(Promise.resolve());
                    throw "async";
                });
            });
            setTimeout(() => {
                console.log(JSON.stringify({ disposed: r1.is(DISPOSED), seen }));
            }, 20);
        `;
        const args = process.versions.bun !== void 0 ? ["-e", script] : ["--input-type=module", "-e", script];
        const out = spawnSync(process.execPath, args, { encoding: "utf8" });
        expect(JSON.parse(out.stdout.trim())).toEqual({
            disposed: true,
            seen: { fatal: true, errors: ["async"] }
        });
    });

    test("c.fatal() in a cleanup ends the tree like any other", () => {
        const s = signal(0);
        let seen = null;
        const r1 = root((r) => {
            r.recover((err) => {
                seen = err;
            });
            r.effect((cx) => {
                cx.val(s);
                cx.cleanup(() => {
                    r.fatal("from a cleanup");
                });
            });
        });
        let err = null;
        try {
            s.set(1);
        } catch (e) {
            err = e;
        }
        expect(err).toBeInstanceOf(Fatal);
        expect(err.errors).toEqual(["from a cleanup"]);
        expect(seen).toBe(null);
        expect(r1.is(DISPOSED)).toBe(true);
    });
});

describe("a FATAL a handler escalates to during a disposal", () => {
    test("asks no handler above, and dispose() throws a Fatal", () => {
        const seen = [];
        const r1 = root((r) => {
            r.recover((err) => {
                seen.push("root: " + err.type);
            });
            r.effect((cx) => {
                cx.recover((err) => {
                    seen.push("own: " + err.error.message);
                    cx.fatal(err);
                });
                cx.cleanup(() => {
                    throw new Error("cleanup");
                });
            });
        });
        const err = thrown(() => r1.dispose());
        expect(err).toBeInstanceOf(Fatal);
        expect(err.errors.map((e) => e.message)).toEqual(["cleanup"]);
        expect(seen).toEqual(["own: cleanup"]);
        expect(r1.is(DISPOSED)).toBe(true);
    });
});

describe("a teardown released by a shield", () => {
    test("dispose(true) throws what no handler took", async () => {
        let release;
        const gate = new Promise((resolve) => { release = resolve; });
        const r1 = root((r) => {
            r.cleanup(() => {
                throw new Error("root cleanup");
            });
            r.spawn(async (cx) => {
                cx.shield();
                await cx.suspend(gate);
            });
        });
        const err = thrown(() => r1.dispose(true));
        expect(err.type).toBe(PANIC);
        expect(err.error.message).toBe("root cleanup");
        expect(r1.is(DISPOSED)).toBe(true);
        release();
        await settle();
    });
});
