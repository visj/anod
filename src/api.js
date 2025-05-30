/**
 * @typedef {string | number | bigint | boolean | undefined | symbol | null}
 */
var primitive;

/**
 * @interface
 */
function DisposableSignal() {}

/**
 * @returns {void}
 */
DisposableSignal.prototype.dispose = function () {};

/**
 * @interface
 * @template T
 * @extends {DisposableSignal<T>}
 */
function ReadonlySignal() {}

/**
 * @returns {T}
 */
ReadonlySignal.prototype.val = function () {};

/**
 * @returns {T}
 */
ReadonlySignal.prototype.peek = function () {};

/**
 * @interface
 * @template T
 * @extends {ReadonlySignal<T>}
 */
function Signal() {}

/**
 * @public
 * @param {T} val
 * @returns {void}
 */
Signal.prototype.set = function (val) {};

/**
 * @record
 * @template T
 */
function SignalOptions() {}

/**
 * @type {boolean | undefined}
 */
SignalOptions.prototype.unstable;

/**
 * @type {(function(T, T): boolean) | null | undefined}
 */
SignalOptions.prototype.compare;

/**
 * @interface
 * @template T
 * @extends {ReadonlySignal<ReadonlyArray<T>>}
 */
function SignalIterator() {}

/**
 * @returns {number}
 */
SignalIterator.prototype.length = function() {};

/**
 * @param {number | ReadonlySignal<number> | (function(): number)} index
 * @returns {ReadonlySignal<T | undefined>}
 */
SignalIterator.prototype.at = function (index) {};

/**
 * @param {...(T | Array<T> | ReadonlySignal<T> | ReadonlySignal<Array<T>>)} items
 * @returns {SignalIterator<T>}
 */
SignalIterator.prototype.concat = function (items) {};

/**
 * @param {function(T, number): boolean} callbackFn
 * @returns {ReadonlySignal<boolean>}
 */
SignalIterator.prototype.every = function (callbackFn) {};

/**
 * @param {function(T, number): boolean} callbackFn
 * @returns {SignalIterator<T>}
 */
SignalIterator.prototype.filter = function (callbackFn) {};

/**
 * @param {function(T, number): boolean} callbackFn
 * @returns {ReadonlySignal<T | undefined>}
 */
SignalIterator.prototype.find = function (callbackFn) {};

/**
 * @param {function(T, number): boolean} callbackFn
 * @returns {ReadonlySignal<number>}
 */
SignalIterator.prototype.findIndex = function (callbackFn) {};

/**
 * @param {function(T, number): boolean} callbackFn
 * @returns {ReadonlySignal<T | undefined>}
 */
SignalIterator.prototype.findLast = function (callbackFn) {};

/**
 * @param {function(T, number): boolean} callbackFn
 * @returns {ReadonlySignal<number>}
 */
SignalIterator.prototype.findLastIndex = function (callbackFn) {};

/**
 * @param {function(T, number): void} callbackFn
 * @returns {DisposableSignal<void>}
 */
SignalIterator.prototype.forEach = function (callbackFn) {};

/**
 * @param {T | ReadonlySignal<T> | (function(): T)} searchElement
 * @param {number | ReadonlySignal<number> | (function(): number)=} fromIndex
 * @returns {ReadonlySignal<boolean>}
 */
SignalIterator.prototype.includes = function (searchElement, fromIndex) {};

/**
 * @param {T | ReadonlySignal<T> | (function(): T)} searchElement
 * @param {number | ReadonlySignal<number> | (function(): number)=} fromIndex
 * @returns {ReadonlySignal<number>}
 */
SignalIterator.prototype.indexOf = function (searchElement, fromIndex) {};

/**
 * @param {string | ReadonlySignal<string> | (function(): string)=} separator
 * @returns {ReadonlySignal<string>}
 */
SignalIterator.prototype.join = function (separator) {};

/**
 * @param {T | ReadonlySignal<T> | (function(): T)} searchElement
 * @param {number | ReadonlySignal<number> | (function(): number)=} fromIndex
 * @returns {ReadonlySignal<number>}
 */
SignalIterator.prototype.lastIndexOf = function (searchElement, fromIndex) {};

/**
 * @template U
 * @param {function(T, number): U} callbackFn
 * @returns {SignalIterator<U>}
 */
SignalIterator.prototype.map = function (callbackFn) {};

/**
 * @template U, V
 * @param {function((T | U), T, number): V} callbackFn
 * @param {U | ReadonlySignal<U> | (function(): U)=} initialValue
 * @returns {ReadonlySignal<V>}
 */
SignalIterator.prototype.reduce = function (callbackFn, initialValue) {};

/**
 * @template U
 * @param {function((T | U), T, number): U} callbackFn
 * @param {U | ReadonlySignal<U> | (function(): U)=} initialValue
 * @returns {ReadonlySignal<U>}
 */
SignalIterator.prototype.reduceRight = function (callbackFn, initialValue) {};

/**
 * @param {number | ReadonlySignal<number> | (function(): number)=} start
 * @param {number | ReadonlySignal<number> | (function(): number)=} end
 * @returns {SignalIterator<T>}
 */
SignalIterator.prototype.slice = function (start, end) {};

/**
 * @param {function(T, number): boolean} callbackFn
 * @returns {ReadonlySignal<boolean>}
 */
SignalIterator.prototype.some = function (callbackFn) {};

/**
 * @interface
 * @template T
 * @extends {SignalIterator<T>}
 * @extends {Signal<ReadonlyArray<T>>}
 */
function SignalArray() {}

/**
 * @param {function(Array<T>): Array<T>} callbackFn
 */
SignalArray.prototype.modify = function (callbackFn) {};

/**
 * @returns {void}
 */
SignalArray.prototype.pop = function () {};

/**
 * @param {...T} elementN
 * @returns {void}
 */
SignalArray.prototype.push = function (elementN) {};

/**
 * @returns {void}
 */
SignalArray.prototype.shift = function () {};

/**
 * @returns {void}
 */
SignalArray.prototype.reverse = function () {};

/**
 * @param {function(T, T): number=} compareFn
 * @returns {void}
 */
SignalArray.prototype.sort = function (compareFn) {};

/**
 * @param {number} start
 * @param {number=} deleteCount
 * @param {...T} items
 * @returns {void}
 */
SignalArray.prototype.splice = function (start, deleteCount, items) {};

/**
 * @param {...T} elementN
 * @returns {void}
 */
SignalArray.prototype.unshift = function (elementN) {};

/**
 * @interface
 * @extends {IObject<string, SignalValue>}
 */
function SignalObject() {}

/** @typedef {Signal | ReadonlySignal | SignalIterator | SignalObject} */
var SignalValue;
