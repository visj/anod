/**
 * @interface
 * @template T
 */
function Signal() {}

/**
 * @template T
 * @this {Signal<T>}
 * @returns {T}
 */
Signal.prototype.val = function () {};

/**
 * @template T
 * @this {Signal<T>}
 * @returns {T}
 */
Signal.prototype.peek = function () {};

/**
 * @interface
 * @template T
 * @extends {Signal<T>}
 */
function SignalValue() {}

/**
 * @template T
 * @param {T} val
 * @this {Signal<T>}
 * @returns {void}
 */
SignalValue.prototype.update = function (val) {};

/**
 * @interface
 * @template T
 * @extends {Signal<Array<T>>}
 */
function SignalIterator() {}

/**
 * @const
 * @type {function(): number}
 */
SignalIterator.prototype.length;

/**
 * @this {SignalIterator<T>}
 * @param {number | Signal<number> | function(): number} index
 * @returns {Signal<T | undefined>}
 */
SignalIterator.prototype.at = function (index) {};

/**
 * @this {SignalIterator<T>}
 * @param {...(T | Array<T> | SignalIterator<T>)} items
 * @returns {SignalIterator<T>}
 */
SignalIterator.prototype.concat = function (items) {};

/**
 * @this {SignalIterator<T>}
 * @param {function(T, number): boolean} callbackFn
 * @returns {Signal<boolean>}
 */
SignalIterator.prototype.every = function (callbackFn) {};

/**
 * @this {SignalIterator<T>}
 * @param {function(T, number): boolean} callbackFn
 * @returns {SignalIterator<T>}
 */
SignalIterator.prototype.filter = function (callbackFn) {};

/**
 * @this {SignalIterator<T>}
 * @param {function(T, number): boolean} callbackFn
 * @returns {Signal<T | undefined>}
 */
SignalIterator.prototype.find = function (callbackFn) {};

/**
 * @this {SignalIterator<T>}
 * @param {function(T, number): boolean} callbackFn
 * @returns {Signal<number>}
 */
SignalIterator.prototype.findIndex = function (callbackFn) {};

/**
 * @this {SignalIterator<T>}
 * @param {function(T, number): boolean} callbackFn
 * @returns {Signal<T | undefined>}
 */
SignalIterator.prototype.findLast = function (callbackFn) {};

/**
 * @this {SignalIterator<T>}
 * @param {function(T,number): boolean} callbackFn
 * @returns {Signal<number>}
 */
SignalIterator.prototype.findLastIndex = function (callbackFn) {};

/**
 * @this {SignalIterator<T>}
 * @param {function(T,number): void} callbackFn
 * @returns {void}
 */
SignalIterator.prototype.forEach = function (callbackFn) {};

/**
 * @this {SignalIterator<T>}
 * @param {T | Signal<T>} searchElement
 * @returns {Signal<boolean>}
 */
SignalIterator.prototype.includes = function (searchElement) {};

/**
 * @this {SignalIterator<T>}
 * @param {T | Signal<T> | (function(): T)} searchElement
 * @param {number | Signal<number> | (function(): number)=} fromIndex
 * @returns {Signal<number>}
 */
SignalIterator.prototype.indexOf = function (searchElement, fromIndex) {};

/**
 * @this {SignalIterator<T>}
 * @param {string | Signal<string> | (function(): string)=} separator
 * @returns {Signal<string>}
 */
SignalIterator.prototype.join = function (separator) {};

/**
 * @this {SignalIterator<T>}
 * @param {T | Signal<T> | (function(): T)} searchElement
 * @param {number | Signal<number> | (function(): number)=} fromIndex
 * @returns {Signal<number>}
 */
SignalIterator.prototype.lastIndexOf = function (searchElement, fromIndex) {};

/**
 * @template U
 * @this {SignalIterator<T>}
 * @param {function(T, Signal<number>): U} callbackFn
 * @returns {SignalIterator<U>}
 */
SignalIterator.prototype.map = function (callbackFn) {};

/**
 * @template U, V
 * @this {SignalIterator<T>}
 * @param {function((T | U), T, number): V} callbackFn
 * @param {U | Signal<U> | (function(): U)=} initialValue
 * @returns {Signal<V>}
 */
SignalIterator.prototype.reduce = function (callbackFn, initialValue) {};

/**
 * @template U
 * @this {SignalIterator<T>}
 * @param {function((T | U), T, number): U} callbackFn
 * @param {U | Signal<U>=} initialValue
 * @returns {Signal<U>}
 */
SignalIterator.prototype.reduceRight = function (callbackFn, initialValue) {};

/**
 * @this {SignalIterator<T>}
 * @param {number | Signal<number> | (function(): number)=} start
 * @param {number | Signal<number> | (function(): number)=} end
 * @returns {SignalIterator<T>}
 */
SignalIterator.prototype.slice = function (start, end) {};

/**
 * @this {SignalIterator<T>}
 * @param {function(T, number): boolean} callbackFn
 * @returns {Signal<boolean>}
 */
SignalIterator.prototype.some = function (callbackFn) {};

/**
 * @interface
 * @template T
 * @extends {SignalIterator<T>}
 * @extends {SignalValue<Array<T>>}
 */
function SignalArray() {}

/**
 * @this {SignalArray<T>}
 * @returns {void}
 */
SignalArray.prototype.pop = function () {};

/**
 * @this {SignalArray<T>}
 * @param {...T} elementN
 * @returns {void}
 */
SignalArray.prototype.push = function (elementN) {};

/**
 * @this {SignalArray<T>}
 * @returns {void}
 */
SignalArray.prototype.shift = function () {};

/**
 * @this {SignalArray<T>}
 * @returns {void}
 */
SignalArray.prototype.reverse = function () {};

/**
 * @this {SignalArray<T>}
 * @param {function(T,T): number=} compareFn
 * @returns {void}
 */
SignalArray.prototype.sort = function (compareFn) {};

/**
 * @this {SignalArray<T>}
 * @param {number} start
 * @param {number=} deleteCount
 * @param {...T} items
 * @returns {void}
 */
SignalArray.prototype.splice = function (start, deleteCount, items) {};

/**
 * @this {SignalArray<T>}
 * @param {...T} elementN
 * @returns {void}
 */
SignalArray.prototype.unshift = function (elementN) {};

/**
 * @interface
 * @extends {IObject<string, SignalType>}
 */
function SignalObject() {}

/** @typedef {Signal | SignalValue | SignalIterator | SignalObject} */
var SignalType;

/**
 * @record
 * @template T, U
 */
function SignalOptions() {}

/**
 * @type {U | undefined}
 */
SignalOptions.prototype.args;

/**
 * @type {Signal | Array<Signal> | (function(): void) | undefined}
 */
SignalOptions.prototype.source;

/**
 * @type {boolean | undefined}
 */
SignalOptions.prototype.defer;

/**
 * @type {boolean | undefined}
 */
SignalOptions.prototype.sample;

/**
 * @type {boolean | undefined}
 */
SignalOptions.prototype.unstable;

/**
 * @type {(function(T, T): boolean) | null | undefined}
 */
SignalOptions.prototype.compare;

/**
 * @record
 */
function IteratorOptions() {}

/**
 * @type {Signal | Array<Signal> | (function(): void) | undefined}
 */
IteratorOptions.prototype.source;

/**
 * @type {boolean | undefined}
 */
IteratorOptions.prototype.unstable;
