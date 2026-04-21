/**
 * Expected counter values for each benchmark. The counter tracks the total
 * number of reactive node evaluations (computes + effects) per single
 * benchmark iteration.
 *
 * All frameworks except S.js should produce identical counts.
 *
 * To regenerate: run `bun bench/reactivity/_validate_split.js`
 */
export const EXPECTED = {
    deep: 51,
    broad: 150,
    diamond: 7,
    triangle: 11,
    mux: 103,
    unstable: 3,
    avoidable: 2,
    repeatedObservers: 2,
    cellx10: 120,
    molWire: 13,
    createSignals1k: 0,
    createComputations1k: 2000,
    dynBuildSimple: 40,
    dynBuildLargeWebApp: 11000,
    dynUpdateSimple: 4,
    dynUpdateDynamic: 77,
    dynUpdateLargeWebApp: 209,
    dynUpdateWideDense: 244,
    dynUpdateDeep: 2493,
    dynUpdateVeryDynamic: 539,
};


/**
 * usignal does not skip propagation when a compute returns a value equal to
 * its previous output — it always re-evaluates downstream subscribers. This
 * inflates counts in diamond-shaped graphs (mux), in chains that collapse to
 * a constant (avoidable), and in molWire where two computes temporarily
 * recover their prior values across the two batches.
 */
export const OVERRIDES_USIGNAL = {
    mux: 301,
    avoidable: 6,
    molWire: 15,
};
