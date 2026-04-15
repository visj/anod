import { describe, test, expect } from "bun:test";
import { root, signal, batch } from "../";

describe("recover", () => {
    describe("root recovery", () => {
        test("swallows error when recover returns true", () => {
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

            expect(recovered).toBeInstanceOf(Error);
            expect(recovered.message).toBe("boom");
            r1.dispose();
        });

        test("propagates error when recover returns false", () => {
            let recovered = null;

            expect(() => {
                root((r) => {
                    r.recover((err) => {
                        recovered = err;
                        return false;
                    });

                    r.effect(() => {
                        throw new Error("boom");
                    });
                });
            }).toThrow("boom");

            expect(recovered).toBeInstanceOf(Error);
        });

        test("propagates error when no recover is registered", () => {
            expect(() => {
                root((r) => {
                    r.effect(() => {
                        throw new Error("unhandled");
                    });
                });
            }).toThrow("unhandled");
        });
    });

    describe("multiple handlers", () => {
        test("stops bubbling when first handler returns true", () => {
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

            expect(calls).toEqual(["first"]);
            r1.dispose();
        });

        test("tries second handler when first returns false", () => {
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

            expect(calls).toEqual(["first", "second"]);
            r1.dispose();
        });
    });

    describe("compute mine to effect", () => {
        test("recovers when effect reads errored compute", () => {
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

            expect(recovered).toBeInstanceOf(Error);
            expect(recovered.message).toBe("compute error");
            r1.dispose();
        });
    });

    describe("nested scope recovery", () => {
        test("inner scope handles error without reaching outer", () => {
            let innerCalled = false;
            let outerCalled = false;

            const r1 = root((r) => {
                r.recover(() => {
                    outerCalled = true;
                    return true;
                });

                r.scope((s) => {
                    s.recover(() => {
                        innerCalled = true;
                        return true;
                    });

                    s.effect(() => {
                        throw new Error("inner error");
                    });
                });
            });

            expect(innerCalled).toBe(true);
            expect(outerCalled).toBe(false);
            r1.dispose();
        });

        test("bubbles to outer when inner returns false", () => {
            let innerCalled = false;
            let outerCalled = false;

            const r1 = root((r) => {
                r.recover(() => {
                    outerCalled = true;
                    return true;
                });

                r.scope((s) => {
                    s.recover(() => {
                        innerCalled = true;
                        return false;
                    });

                    s.effect(() => {
                        throw new Error("bubble up");
                    });
                });
            });

            expect(innerCalled).toBe(true);
            expect(outerCalled).toBe(true);
            r1.dispose();
        });
    });

    describe("effect disposal", () => {
        test("errored effect is disposed even when recovered", () => {
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

            expect(runs).toBe(1);
            s1.set(1);
            expect(runs).toBe(2); // "Effect ran once more before dying"

            s1.set(2);
            expect(runs).toBe(2); // "Effect should not run after disposal"
            r1.dispose();
        });
    });

    describe("batch recovery", () => {
        test("recovers error during batch and completes normally", () => {
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

            expect(recovered).toBeInstanceOf(Error);
            expect(recovered.message).toBe("batch error");
            expect(s2val).toBe(42); // "Other effects in the batch should still run"
            r1.dispose();
        });
    });

    describe("recovery on triggered update", () => {
        test("recovers error triggered by signal change", () => {
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

            expect(recovered).toBeNull();
            s1.set(true);
            expect(recovered).toBeInstanceOf(Error);
            expect(recovered.message).toBe("triggered");
            r1.dispose();
        });
    });

    describe("recover re-registration", () => {
        test("old recover handler is cleared on effect re-run", () => {
            const s1 = signal(0);
            let handlerVersion = 0;
            let recoveredVersion = -1;

            const r1 = root((r) => {
                r.scope((s) => {
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
            expect(handlerVersion).toBe(1);

            s1.set(2);
            expect(recoveredVersion).toBe(2); // "Should use the fresh handler, not the stale one"
            r1.dispose();
        });
    });

    describe("dispose clears recover", () => {
        test("dispose nullifies recover handlers", () => {
            const s1 = signal(0);
            let recovered = false;

            const r1 = root((r) => {
                r.recover(() => {
                    recovered = true;
                    return true;
                });
            });

            r1.dispose();
            // After dispose, the root's recover should be cleaned up
            // We verify by checking that creating effects outside the disposed root
            // that throw will not be caught
            expect(() => {
                root((r) => {
                    r.effect(() => {
                        throw new Error("after dispose");
                    });
                });
            }).toThrow("after dispose");

            expect(recovered).toBe(false);
        });
    });
});
