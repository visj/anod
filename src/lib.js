/**
 * @typedef {function(boolean): void}
 */
export var Cleanup;

/**
 * @typedef {function(*): void}
 */
export var Recover;

/** 
 * @abstract
 * @constructor 
 */
export function Nil() { }

/**
 * @template T
 * @interface
 */
export function Respond() { }

/**
 * @package
 * @type {number}
 */
Respond.prototype._state;

/**
 * @package
 * @type {T}
 */
Respond.prototype._value;

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
Respond.prototype._update = function (time) { }

/**
 * @package
 * @param {number} time 
 * @returns {void}
 */
Respond.prototype._dispose = function (time) { }

/**
 * @template T
 * @interface
 * @extends {Respond<T>}
 */
export function Scope() { }

/**
 * @package
 * @type {?Array<!Respond>}
 */
Scope.prototype._owned;

/**
 * @package
 * @type {?Array<!Cleanup>}
 */
Scope.prototype._cleanups;

/**
 * @package
 * @type {?Array<!Recover>}
 */
Scope.prototype._recovers;

/**
 * @template T
 * @interface
 */
export function Compute() { }

/**
 * @export
 * @public
 * @type {T}
 * @readonly
 */
Compute.prototype.val;

/**
 * @template T
 * @interface
 */
export function Signal() { }

/**
 * @public
 * @export
 * @type {T}
 */
Signal.prototype.val;

/**
 * @typedef {Compute | Signal}
 */
export var Source;

/**
 * @const 
 * @enum {number}
 */
export var State = {
    Static: 1,
    DisposeFlags: 6,
    Disposed: 2,
    Dispose: 4,
    UpdateFlags: 24,
    Updated: 8,
    Update: 16,
    Send: 32,
    Compute: 64,
    Error: 128,
}

/**
 * @const
 * @enum
 */
export var Stage = {
    Idle: 0,
    Started: 1,
    Disposes: 2,
    Changes: 3,
    Computes: 4,
    Effects: 5,
}