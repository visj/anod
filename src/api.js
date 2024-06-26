/**
 * @interface
 */
function Zorn() { }

/**
 * @template T
 * @param {function(function(): void): T} fn 
 * @returns {T}
 */
Zorn.prototype.root = function(fn) { };

/**
 * 
 * @param {function(): void} fn
 * @returns {void}
 */
Zorn.prototype.batch = function(fn) { };

/**
 * 
 * @param {function(boolean): void} fn
 * @returns {void}
 */
Zorn.prototype.cleanup = function(fn) { };

/**
 * @template T
 * @param {function(): T} fn 
 * @returns {T}
 */
Zorn.prototype.sample = function(fn) { };

/**
 * @template T
 * @param {T} val 
 * @returns {Signal<T>}
 */
Zorn.prototype.data = function(val) { };

/**
 * @template T
 * @param {T} val 
 * @param {null | (function(T,T): boolean)=} eq 
 * @returns {Signal<T>}
 */
Zorn.prototype.value = function(val, eq) { };

/**
 * @template T,U
 * @param {function(T,U): T} fn 
 * @param {T=} seed 
 * @param {null | (function(T,T): boolean)=} eq 
 * @param {U=} args 
 * @returns {Reactive<T>}
 */
Zorn.prototype.compute = function(fn, seed, eq, args) { };

/**
 * @template T,U
 * @param {function(T,U): T} fn 
 * @param {T=} seed 
 * @param {null | (function(T,T): boolean)=} eq 
 * @param {U=} args 
 * @returns {Reactive<T>}
 */
Zorn.prototype.$compute = function(fn, seed, eq, args) { };

/**
 * @const
 * @type {Zorn}
 */
var zorn;

/**
 * @interface
 * @template T
 */
function Reactive() { }

/**
 * @returns {T}
 */
Reactive.prototype.val = function () { };

/**
 * @returns {T}
 */
Reactive.prototype.peek = function () { };

/**
 * @returns {void}
 */
Reactive.prototype.dispose = function() { };

/**
 * @interface
 * @template T
 * @extends {Reactive<T>}
 */
function Signal() { }

/**
 * @param {T} val
 * @returns {void}
 */
Signal.prototype.update = function (val) { };

/**
 * @interface
 * @template T
 * @extends {Reactive<Array<T>>}
 */
function ReactiveArray() { }

/**
 * @interface
 * @template T
 * @extends {Signal<Array<T>>}
 * @extends {ReactiveArray<T>}
 */
function SignalArray() { }

/**
 * @public
 * @returns {number}
 */
SignalArray.prototype.$length = function () { };

/**
 * 
 * @param {...T} item
 * @returns {void}
 */
SignalArray.prototype.$push = function (item) { };

/** @typedef {Signal | SignalArray | SignalObject} */
var SignalValue;

/**
 * @interface
 * @extends {IObject<string, SignalValue>}
 */
function SignalObject() { }