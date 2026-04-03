/**
 * @interface
 */
function Anod() { }

/**
 * @type {number}
 */
Anod.prototype.t;

/**
 * @interface
 * @extends {Anod}
 */
function DisposableSignal() { }

/**
 * @returns {void}
 */
DisposableSignal.prototype.dispose = function() { };

/**
 * @interface
 * @template T
 * @extends {DisposableSignal}
 */
function ReadonlySignal() { }

/**
 * @throws
 * @returns {T}
 */
ReadonlySignal.prototype.val = function() { };

/**
 * @interface
 * @template T
 * @extends {ReadonlySignal<T>}
 */
function WritableSignal() { };

/**
 * @throws
 * @param {T} value
 * @returns {void}
 */
WritableSignal.prototype.set = function(value) { };

export { Anod, DisposableSignal, ReadonlySignal, WritableSignal }
