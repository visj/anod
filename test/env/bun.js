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

/**
 * Anti-flake GC helper. Forces GC once, then polls up to 10 times
 * with 1ms sleeps waiting for all WeakRefs to clear. If a node is
 * truly leaked it won't be collected regardless of wait time.
 * @param {WeakRef[]} refs
 */
export async function expectCollected(refs) {
    await collectAsync();
    for (let i = 0; i < 10; i++) {
        if (refs.every((ref) => ref.deref() === undefined)) {
            return;
        }
        await new Promise((r) => setTimeout(r, 1));
        forceGC();
    }
}
