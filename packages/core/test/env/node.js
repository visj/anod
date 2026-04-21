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
 * Lightweight expect() shim that covers the assertion surface used by our tests.
 * Supports: toBe, toEqual, toBeInstanceOf, toBeNull, toBeUndefined, toThrow,
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
        /** @type {{ toBe: Function, toEqual: Function, toBeInstanceOf: Function, toBeNull: Function, toBeUndefined: Function, toThrow: Function }} */
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
                assert.notStrictEqual(actual, undefined);
            } else {
                assert.strictEqual(actual, undefined);
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
                    if (expected !== undefined) {
                        const msg = e instanceof Error ? e.message : String(e);
                        if (typeof expected === 'string' && msg.includes(expected)) {
                            assert.fail(`Expected function not to throw matching "${expected}", but it did`);
                        }
                    } else {
                        assert.fail(`Expected function not to throw, but it threw: ${e}`);
                    }
                }
            } else {
                if (expected !== undefined) {
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
