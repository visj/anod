import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';

export { describe, test };

/** Forces a full stop-the-world GC via Node's --expose-gc global. */
export function forceGC() {
    if (typeof globalThis.gc === 'function') {
        globalThis.gc();
    }
}

/**
 * Lets the microtask queue drain, then forces GC and calls back.
 * @param {() => void} callback
 */
export function collect(callback) {
    setTimeout(() => {
        forceGC();
        callback();
    }, 10);
}

/** Promise-based version of collect(). */
export function collectAsync() {
    return new Promise((resolve) => collect(() => resolve()));
}

/**
 * Anti-flake GC helper. Forces GC once, then polls up to 10 times
 * with 1ms sleeps waiting for all WeakRefs to clear. If a node is
 * truly leaked it won't be collected regardless of wait time.
 * @param {WeakRef[]} refs
 */
export async function expectCollected(refs) {
    await collectAsync();
    for (let i = 0; i < 10; i++) {
        if (refs.every((ref) => ref.deref() === void 0)) {
            return;
        }
        await new Promise((r) => setTimeout(r, 1));
    }
}

/**
 * Lightweight expect() shim that covers the assertion surface used by our tests.
 * Supports: toBe, toEqual, toBeInstanceOf, toBeNull, toBeUndefined,
 * toBeGreaterThan, toMatch, toContain, toThrow,
 * and the .not modifier for each.
 * @param {*} actual
 */
export function expect(actual) {
    return makeAssertions(actual, false);
}

/**
 * @param {*} actual
 * @param {boolean} negated
 */
function makeAssertions(actual, negated) {
    return {
        /** @type {{ toBe: Function, toEqual: Function, toBeInstanceOf: Function, toBeNull: Function, toBeUndefined: Function, toBeGreaterThan: Function, toMatch: Function, toContain: Function, toThrow: Function }} */
        get not() {
            return makeAssertions(actual, !negated);
        },
        /** @param {*} expected */
        toBe(expected) {
            if (negated) {
                assert.notStrictEqual(actual, expected);
            } else {
                assert.strictEqual(actual, expected);
            }
        },
        /** @param {*} expected */
        toEqual(expected) {
            if (negated) {
                assert.notDeepStrictEqual(actual, expected);
            } else {
                assert.deepStrictEqual(actual, expected);
            }
        },
        /** @param {Function} expected */
        toBeInstanceOf(expected) {
            if (negated) {
                assert.ok(!(actual instanceof expected), `Expected value not to be instance of ${expected.name}`);
            } else {
                assert.ok(actual instanceof expected, `Expected instance of ${expected.name}, got ${actual}`);
            }
        },
        toBeNull() {
            if (negated) {
                assert.notStrictEqual(actual, null);
            } else {
                assert.strictEqual(actual, null);
            }
        },
        toBeUndefined() {
            if (negated) {
                assert.notStrictEqual(actual, void 0);
            } else {
                assert.strictEqual(actual, void 0);
            }
        },
        /** @param {number} expected */
        toBeGreaterThan(expected) {
            if (negated) {
                assert.ok(!(actual > expected), `Expected ${actual} not to be greater than ${expected}`);
            } else {
                assert.ok(actual > expected, `Expected ${actual} to be greater than ${expected}`);
            }
        },
        /** @param {string|RegExp} expected */
        toMatch(expected) {
            const matched = typeof expected === 'string' ? actual.includes(expected) : expected.test(actual);
            if (negated) {
                assert.ok(!matched, `Expected ${JSON.stringify(actual)} not to match ${expected}`);
            } else {
                assert.ok(matched, `Expected ${JSON.stringify(actual)} to match ${expected}`);
            }
        },
        /** @param {*} expected */
        toContain(expected) {
            if (negated) {
                assert.ok(!actual.includes(expected), `Expected ${actual} not to contain ${expected}`);
            } else {
                assert.ok(actual.includes(expected), `Expected ${actual} to contain ${expected}`);
            }
        },
        /** @param {string|RegExp} [expected] */
        toThrow(expected) {
            if (typeof actual !== 'function') {
                throw new TypeError('expect(fn).toThrow() requires a function');
            }
            if (negated) {
                try {
                    actual();
                } catch (e) {
                    if (expected !== void 0) {
                        const msg = e instanceof Error ? e.message : String(e);
                        if (typeof expected === 'string' && msg.includes(expected)) {
                            assert.fail(`Expected function not to throw matching "${expected}", but it did`);
                        }
                    } else {
                        assert.fail(`Expected function not to throw, but it threw: ${e}`);
                    }
                }
            } else {
                if (expected !== void 0) {
                    assert.throws(actual, (/** @type {*} */ e) => {
                        const msg = e instanceof Error ? e.message
                            : (e && typeof e.message === 'string') ? e.message
                            : String(e);
                        if (typeof expected === 'string') {
                            return msg.includes(expected);
                        }
                        if (expected instanceof RegExp) {
                            return expected.test(msg);
                        }
                        return false;
                    });
                } else {
                    assert.throws(actual);
                }
            }
        }
    };
}
