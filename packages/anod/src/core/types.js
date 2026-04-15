/** 
 * @interface
 */
function Disposer() { }
/** @package @type {number} */
Disposer.prototype._flag;
/** @package @returns {void} */
Disposer.prototype._dispose = function () { };

/** 
 * @interface 
 * @extends {Disposer} 
 */
function Owner() { }
/** @package @type {(function(): void) | Array<(function(): void)> | null} */
Owner.prototype._cleanup;
/** @package @type {Array<Receiver> | null} */
Owner.prototype._owned;
/** @package @type {number | undefined} */
Owner.prototype._level;
/** @package @type {Owner | null} */
Owner.prototype._owner;
/** @package @type {(function(*): boolean) | Array<(function(*): boolean)> | null} */
Owner.prototype._recover;

/**
 * @interface 
 * @template T 
 * @extends {Disposer} 
 */
function Sender() { }
/** @package @type {T} */
Sender.prototype._value;
/** @package @type {number} */
Sender.prototype._slot;
/** @package @type {Receiver | null} */
Sender.prototype._sub1;
/** @package @type {number} */
Sender.prototype._sub1slot;
/** @package @type {Array<Receiver | number> | null} */
Sender.prototype._subs;
/** @package @type {number} */
Sender.prototype._ctime;

/**
 * @interface
 * @extends {Disposer}
 */
function Receiver() { }
/** @package @type {Sender | null} */
Receiver.prototype._dep1;
/** @package @type {number} */
Receiver.prototype._dep1slot;
/** @package @type {Array<Sender | number> | null} */
Receiver.prototype._deps;
/** @package @type {number} */
Receiver.prototype._time;
/** @package @param {number} time @returns {void} */
Receiver.prototype._setStale = function (time) { };

/**
 * @interface
 * @template T
 */
function ReadonlySignal() { }

/**
 * @throws
 * @returns {T}
 */
ReadonlySignal.prototype.val = function() { };

/**
 * @returns {void}
 */
ReadonlySignal.prototype.dispose = function() { };

/**
 * @interface
 * @template T
 * @extends {Sender<T>}
 * @extends {ReadonlySignal<T>}
 */
function ISignal() { }

/**
 * 
 * @param {T} value
 * @returns {void}
 */
ISignal.prototype.set = function (value) { };

/**
 * @interface
 * @template T
 * @extends {Sender<T>}
 * @extends {Receiver}
 * @extends {ReadonlySignal<T>}
 */
function ICompute() { }
/** @public @returns {boolean} */
ICompute.prototype.error = function () { };
/** @public @returns {boolean} */
ICompute.prototype.loading = function () { };

/**
 * @interface
 * @extends {Owner}
 * @extends {Receiver}
 */
function IEffect() { }
/** @public @returns {void} */
IEffect.prototype.dispose = function () { };
/** @public @returns {boolean} */
IEffect.prototype.error = function () { };
/** @public @returns {boolean} */
IEffect.prototype.loading = function () { };

export { Disposer, Owner, Sender, Receiver, Clock, ISignal, ICompute, IEffect };