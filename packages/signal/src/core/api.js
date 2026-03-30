/**
 * @interface
 */
function Anod() { }

/**
 * @type {number}
 */
Anod.prototype.t;

/**
 * @const
 */
const Type = {};

/**
 * @const
 * @type {number}
 */
Type.ROOT;

/**
 * @const
 * @type {number}
 */
Type.SIGNAL;

/**
 * @const
 * @type {number}
 */
Type.COMPUTE;

/**
 * @const
 * @type {number}
 */
Type.EFFECT;

/**
 * @const
 */
const Opt = {};

/**
 * @const
 * @type {number}
 */
Opt.DEFER;

/**
 * @const
 * @type {number}
 */
Opt.STABLE;


/**
 * @const
 * @type {number}
 */
Opt.SETUP;

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
 * @throws
 * @returns {T}
 */
ReadonlySignal.prototype.peek = function() { };

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

export { Anod, DisposableSignal, ReadonlySignal, WritableSignal, Type, Opt }