export { describe, test, expect } from 'bun:test';

/** Forces a full stop-the-world GC via Bun's native API. */
export function forceGC() {
    Bun.gc(true);
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
