/** @typedef {function(): void} */
var Dispose;

/** @typedef {function(boolean): void} */
var Cleanup;

/** @typedef {string | number | bigint | boolean | undefined | symbol | null} */
var primitive;
/**
 * @interface
 */
function Scope() { }

/**
 * @package
 * @type {Array<Module> | null}
 */
Scope.prototype._children;

/**
 * @package
 * @type {Array<Cleanup> | null}
 */
Scope.prototype._cleanups;

/**
 * @package
 * @param {Module} child
 * @returns {void}
 */
Scope.prototype._addChild = function (child) { };

/**
 * @package
 * @param {Cleanup} fn 
 */
Scope.prototype._addCleanup = function (fn) { };

/**
 * @interface
 * @template T
 */
function Send() { }

/**
 * @package
 * @type {Receive | null}
 */
Send.prototype._node1;

/**
 * @package
 * @type {number}
 */
Send.prototype._node1slot;

/**
 * @package
 * @type {Array<Receive> | null}
 */
Send.prototype._nodes;

/**
 * @package
 * @type {Array<number> | null}
 */
Send.prototype._nodeslots;

/**
 * @interface
*/
function Receive() { }

/**
 * @package
 * @type {Send | null}
 */
Receive.prototype._source1;

/**
 * @package
 * @type {number}
 */
Receive.prototype._source1slot;

/**
 * @package
 * @type {Array<Send> | null | undefined}
 */
Receive.prototype._sources;

/**
 * @package
 * @type {Array<number> | null | undefined}
 */
Receive.prototype._sourceslots;

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
Receive.prototype._recordMayUpdate = function (time) { };

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
Receive.prototype._recordWillUpdate = function (time) { };

/**
 * @package
 * @param {number} time
 * @returns {void} 
 */
Receive.prototype._clearMayUpdate = function (time) { };

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
Receive.prototype._recordMayDispose = function (time) { };

/**
 * @record
 */
function Context() { }

/**
 * @type {Scope | null}
 */
Context.prototype._root;

/**
 * @type {Scope | null}
 */
Context.prototype._owner;

/**
 * @type {Receive | null}
 */
Context.prototype._listen;

/**
 * @interface
 * @template T
 * @extends {Send}
 * @extends {Scope}
 * @extends {Receive}
 * @extends {Signal<T>}
 */
function ModuleInterface() { }

/**
 * @struct
 * @abstract
 * @template T
 * @constructor
 * @implements {ModuleInterface<T>}
 */
function Module() { }

/**
 * @package
 * @type {number}
 */
Module.prototype._state;

/**
 * @package
 * @type {Array<Module> | null}
 */
Module.prototype._children;

/**
 * @package
 * @type {Array<Cleanup> | null}
 */
Module.prototype._cleanups;

/**
 * @package
 * @type {Receive | null}
 */
Module.prototype._node1;

/**
 * @package
 * @type {number}
 */
Module.prototype._node1slot;

/**
 * @package
 * @type {Array<Receive> | null}
 */
Module.prototype._nodes;

/**
 * @package
 * @type {Array<number> | null}
 */
Module.prototype._nodeslots;
/**
 * @package
 * @type {T}
 */
Module.prototype._value;

/**
 * @package
 * @type {Send | null}
 */
Module.prototype._source1;

/**
 * @package
 * @type {number}
 */
Module.prototype._source1slot;

/**
 * @package
 * @type {Array<Send> | null | undefined}
 */
Module.prototype._sources;

/**
 * @package
 * @type {Array<number> | null | undefined}
 */
Module.prototype._sourceslots;

/**
 * @package
 * @type {?}
 */
Module.prototype._next;

/**
 * @package
 * @param {Module} child
 * @returns {void}
 */
Module.prototype._addChild = function (child) { };

/**
 * @package
 * @param {Cleanup} fn 
 */
Module.prototype._addCleanup = function (fn) { };

/**
 * @returns {T}
 */
Module.prototype.val = function () { };

/**
 * @returns {T}
 */
Module.prototype.peek = function () { };

/**
 * @returns {void}
 */
Module.prototype.dispose = function() { };


/**
 * @param {T} val
 * @returns {void}
 */
Module.prototype.update = function(val) { };

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
Module.prototype._update = function(time) { };

/**
 * @package
 * @returns {void}
 */
Module.prototype._dispose = function() { };

/**
 * @package
 * @returns {void}
 */
Module.prototype._recordWillDispose = function () { };

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
Module.prototype._recordMayUpdate = function (time) { };

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
Module.prototype._recordWillUpdate = function (time) { };

/**
 * @package
 * @param {number} time
 * @returns {void} 
 */
Module.prototype._clearMayUpdate = function (time) { };

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
Module.prototype._recordMayDispose = function (time) { };

/**
 * @interface
 * @extends {Scope}
 */
function RootInterface() { }

/**
 * @interface
 * @template T
 * @extends {Send}
 * @extends {SignalValue<T>}
 */
function DataInterface() { }

/**
 * @interface
 * @template T
 * @extends {Send}
 * @extends {Scope}
 * @extends {Receive}
 * @extends {Signal<T>}
 */
function ComputeInterface() { }

/**
 * @interface
 * @template T
 * @extends {Send}
 * @extends {Receive}
 * @extends {SignalIterator<T>}
 */
function ComputeArrayInterface() { }

/**
 * @interface
 * @template T
 * @extends {Send}
 * @extends {SignalArray<T>}
 * @extends {SignalIterator<T>}
 */
function DataArrayInterface() { }