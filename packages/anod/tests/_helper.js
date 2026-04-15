/**
 * Test import resolver.
 *
 * By default, tests run against the minified dist bundle.
 * Pass ANOD_DEBUG=1 to run against the source files instead:
 *
 *   ANOD_DEBUG=1 node --test tests/signal.test.js
 */
const useSrc = process.env.ANOD_DEBUG === "1";
const mod = await import(useSrc ? "../src/index.js" : "../dist/index.mjs");
export const {
    Root,
    Signal,
    Compute,
    Effect,
    root,
    signal,
    compute,
    derive,
    task,
    effect,
    watch,
    spawn,
    batch,
    OPT_DEFER,
    OPT_STABLE,
    OPT_SETUP,
    OPT_WEAK,
} = mod;
