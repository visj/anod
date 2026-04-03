/** @externs */

/** @const */
var __ANOD_CORE__ = {};

/** @const */
var __ANOD_INTERNAL__ = {};

// ─────────────────────────────────────────────────────────────────────────────
// 1. CORE API (@anod/signal)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @constructor
 * @template T
 * @param {T=} value
 */
__ANOD_CORE__.Signal = function(value) {};
/** @return {T} */
__ANOD_CORE__.Signal.prototype.val = function() {};

/**
 * @constructor
 * @template T,U,V,W
 */
__ANOD_CORE__.Compute = function(opts, fn, dep1, dep2, seed, args) {};

/**
 * @constructor
 * @template U,V,W
 */
__ANOD_CORE__.Effect = function(opts, fn, dep1, dep2, args) {};

/**
 * @template T,U,W
 * @param {__ANOD_INTERNAL__.Send<U>} dep1 
 * @param {function(U,T,W): T} fn 
 * @param {T=} seed 
 * @param {number=} opts 
 * @param {W=} args
 * @return {__ANOD_CORE__.Compute<T,U,null,W>}
 */
__ANOD_CORE__.computeOne = function(dep1, fn, seed, opts, args) {};

/**
 * @template U,W
 * @param {__ANOD_INTERNAL__.Send<U>} dep1 
 * @param {function(U,W): (function(): void | void)} fn 
 * @param {number=} opts 
 * @param {W=} args
 * @return {__ANOD_CORE__.Effect<U,null,W>}
 */
__ANOD_CORE__.effectOne = function(dep1, fn, opts, args) {};


// ─────────────────────────────────────────────────────────────────────────────
// 2. INTERNAL API (@anod/signal/internal)
// ─────────────────────────────────────────────────────────────────────────────

/** * INTERFACE: Do not destructure at runtime! 
 * @interface 
 * @template T
 */
__ANOD_INTERNAL__.Send = function() {};

/** @enum {number} */
__ANOD_INTERNAL__.State = { BUSY: 0, IDLE: 1, PENDING: 128 }; // You can expand these

/** @enum {number} */
__ANOD_INTERNAL__.Op = { Value: 1, Push: 7 };

/** @enum {number} */
__ANOD_INTERNAL__.Flag = { STALE: 8, RUNNING: 32 };

/** @enum {number} */
__ANOD_INTERNAL__.Opt = { DEFER: 1, STABLE: 2 };

/** @const */
__ANOD_INTERNAL__.CLOCK = {
    _state: 0,
    _time: 0,
    _version: 0
};

/**
 * @param {__ANOD_CORE__.Signal} node
 * @returns {void}
 */
__ANOD_INTERNAL__.notify = function(node) {};

/**
 * @param {__ANOD_CORE__.Signal} node 
 * @param {number} op 
 * @param {*} value
 * @returns {void} 
 */
__ANOD_INTERNAL__.scheduleSignal = function(node, op, value) {};

/** @param {*} value @returns {boolean} */
__ANOD_INTERNAL__.isPrimitive = function(value) {};

/** @param {*} value @returns {boolean} */
__ANOD_INTERNAL__.isFunction = function(value) {};

/** @param {*} value @returns {boolean} */
__ANOD_INTERNAL__.isSignal = function(value) {};