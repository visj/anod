import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { root, signal, batch } from "./_helper.js";

describe("recover", () => {
    describe("root recovery", () => {
        it("swallows error when recover returns true", () => {
            let recovered = null;
            const r1 = root((r) => {
                r.recover((err) => {
                    recovered = err;
                    return true;
                });
                r.effect(() => {
                    throw new Error("boom");
                });
            });
            assert(recovered instanceof Error);
            assert.strictEqual(recovered.message, "boom");
            r1.dispose();
        });

        it("propagates error when recover returns false", () => {
            let recovered = null;
            assert.throws(() => {
                root((r) => {
                    r.recover((err) => {
                        recovered = err;
                        return false;
                    });
                    r.effect(() => {
                        throw new Error("boom");
                    });
                });
            }, { message: "boom" });
            assert(recovered instanceof Error);
        });

        it("propagates error when no recover is registered", () => {
            assert.throws(() => {
                root((r) => {
                    r.effect(() => {
                        throw new Error("unhandled");
                    });
                });
            }, { message: "unhandled" });
        });
    });

    describe("multiple handlers", () => {
        it("stops bubbling when first handler returns true", () => {
            let calls = [];
            const r1 = root((r) => {
                r.recover((err) => {
                    calls.push("first");
                    return true;
                });
                r.recover((err) => {
                    calls.push("second");
                    return true;
                });
                r.effect(() => {
                    throw new Error("boom");
                });
            });
            assert.deepStrictEqual(calls, ["first"]);
            r1.dispose();
        });

        it("tries second handler when first returns false", () => {
            let calls = [];
            const r1 = root((r) => {
                r.recover((err) => {
                    calls.push("first");
                    return false;
                });
                r.recover((err) => {
                    calls.push("second");
                    return true;
                });
                r.effect(() => {
                    throw new Error("boom");
                });
            });
            assert.deepStrictEqual(calls, ["first", "second"]);
            r1.dispose();
        });
    });

    describe("compute mine to effect", () => {
        it("recovers when effect reads errored compute", () => {
            let recovered = null;
            const r1 = root((r) => {
                r.recover((err) => {
                    recovered = err;
                    return true;
                });
                const c1 = r.compute(() => {
                    throw new Error("compute error");
                });
                r.effect((e) => {
                    e.read(c1);
                });
            });
            assert(recovered instanceof Error);
            assert.strictEqual(recovered.message, "compute error");
            r1.dispose();
        });
    });

    describe("nested effect recovery", () => {
        it("inner effect handles error without reaching outer", () => {
            let innerCalled = false;
            let outerCalled = false;
            const r1 = root((r) => {
                r.recover(() => {
                    outerCalled = true;
                    return true;
                });
                r.effect((s) => {
                    s.recover(() => {
                        innerCalled = true;
                        return true;
                    });
                    s.effect(() => {
                        throw new Error("inner error");
                    });
                });
            });
            assert.strictEqual(innerCalled, true);
            assert.strictEqual(outerCalled, false);
            r1.dispose();
        });

        it("bubbles to outer when inner returns false", () => {
            let innerCalled = false;
            let outerCalled = false;
            const r1 = root((r) => {
                r.recover(() => {
                    outerCalled = true;
                    return true;
                });
                r.effect((s) => {
                    s.recover(() => {
                        innerCalled = true;
                        return false;
                    });
                    s.effect(() => {
                        throw new Error("bubble up");
                    });
                });
            });
            assert.strictEqual(innerCalled, true);
            assert.strictEqual(outerCalled, true);
            r1.dispose();
        });
    });

    describe("effect disposal", () => {
        it("errored effect is disposed even when recovered", () => {
            const s1 = signal(0);
            let runs = 0;
            const r1 = root((r) => {
                r.recover(() => true);
                r.effect((e) => {
                    runs++;
                    if (e.read(s1) > 0) {
                        throw new Error("boom");
                    }
                });
            });
            assert.strictEqual(runs, 1);
            s1.set(1);
            assert.strictEqual(runs, 2);
            s1.set(2);
            assert.strictEqual(runs, 2);
            r1.dispose();
        });
    });

    describe("batch recovery", () => {
        it("recovers error during batch and completes normally", () => {
            const s1 = signal(false);
            const s2 = signal(1);
            let recovered = null;
            let s2val = 0;
            const r1 = root((r) => {
                r.recover((err) => {
                    recovered = err;
                    return true;
                });
                r.effect((e) => {
                    if (e.read(s1)) {
                        throw new Error("batch error");
                    }
                });
                r.effect((e) => {
                    s2val = e.read(s2);
                });
            });
            batch(() => {
                s1.set(true);
                s2.set(42);
            });
            assert(recovered instanceof Error);
            assert.strictEqual(recovered.message, "batch error");
            assert.strictEqual(s2val, 42);
            r1.dispose();
        });
    });

    describe("recovery on triggered update", () => {
        it("recovers error triggered by signal change", () => {
            const s1 = signal(false);
            let recovered = null;
            const r1 = root((r) => {
                r.recover((err) => {
                    recovered = err;
                    return true;
                });
                r.effect((e) => {
                    if (e.read(s1)) {
                        throw new Error("triggered");
                    }
                });
            });
            assert.strictEqual(recovered, null);
            s1.set(true);
            assert(recovered instanceof Error);
            assert.strictEqual(recovered.message, "triggered");
            r1.dispose();
        });
    });

    describe("recover re-registration", () => {
        it("old recover handler is cleared on effect re-run", () => {
            const s1 = signal(0);
            let handlerVersion = 0;
            let recoveredVersion = -1;
            const r1 = root((r) => {
                r.effect((s) => {
                    let version = s.read(s1);
                    handlerVersion = version;
                    s.recover((err) => {
                        recoveredVersion = version;
                        return true;
                    });
                    if (version > 1) {
                        s.effect(() => {
                            throw new Error("fail");
                        });
                    }
                });
            });
            s1.set(1);
            assert.strictEqual(handlerVersion, 1);
            s1.set(2);
            assert.strictEqual(recoveredVersion, 2);
            r1.dispose();
        });
    });

    describe("dispose clears recover", () => {
        it("dispose nullifies recover handlers", () => {
            const s1 = signal(0);
            let recovered = false;
            const r1 = root((r) => {
                r.recover(() => {
                    recovered = true;
                    return true;
                });
            });
            r1.dispose();
            assert.throws(() => {
                root((r) => {
                    r.effect(() => {
                        throw new Error("after dispose");
                    });
                });
            }, { message: "after dispose" });
            assert.strictEqual(recovered, false);
        });
    });
});
