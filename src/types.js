/** @typedef {function(): void} */
var Dispose;

/** @typedef {function(boolean): void} */
var Cleanup;

/**
 * @interface
 * @template T
 * @extends {Reactive<T>}
 */
function Module() { }

/**
 * @package
 * @type {number}
 */
Module.prototype._state;

/**
 * @package
 * @returns {void}
 */
Module.prototype._update = function() { };

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
 * @struct
 * @abstract
 * @template T
 * @constructor
 * @implements {Module<T>}
 */
function ModuleProto() { }

/**
 * @package
 * @type {number}
 */
ModuleProto.prototype._state;

/**
 * @returns {T}
 */
ModuleProto.prototype.val = function () { };

/**
 * @returns {T}
 */
ModuleProto.prototype.peek = function () { };

/**
 * @returns {void}
 */
ModuleProto.prototype.dispose = function() { };

/**
 * @package
 * @returns {void}
 */
ModuleProto.prototype._update = function() { };

/**
 * @package
 * @returns {void}
 */
ModuleProto.prototype._dispose = function() { };

/**
 * @package
 * @returns {void}
 */
ModuleProto.prototype._recordWillDispose = function () { };

/**
 * @interface
 * @extends {Module}
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
 * @extends {Scope}
 */
function RootProto() { }

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
 * @template T
 * @extends {Send}
 * @extends {Signal<T>}
 */
function DataProto() { }

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
 * @returns {void}
 */
Receive.prototype._recordMayUpdate = function () { };

/**
 * @package
 * @returns {void}
 */
Receive.prototype._recordWillUpdate = function () { };

/**
 * @package
 * @param {number} time
 * @returns {void} 
 */
Receive.prototype._clearMayUpdate = function (time) { };

/**
 * @package
 * @returns {void}
 */
Receive.prototype._recordMayDispose = function () { };

/**
 * @interface
 * @template T
 * @extends {Send}
 * @extends {Scope}
 * @extends {Receive}
 * @extends {Reactive<T>}
 */
function ComputeProto() { }

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