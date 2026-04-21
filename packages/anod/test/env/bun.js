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

/**
 * Promise-based version of collect(). Two passes with setTimeout
 * between them to ensure all stack frames are unwound and WeakRef
 * targets are finalized before asserting.
 */
export async function collectAsync() {
    await new Promise((resolve) => collect(() => resolve()));
    await new Promise((resolve) => collect(() => resolve()));
}
