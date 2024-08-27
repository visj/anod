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
function SignalData() {}

/**
 * @template T
 * @param {T} val
 * @this {Signal<T>}
 * @returns {void}
 */
SignalData.prototype.update = function (val) {};

/**
 * @interface
 * @template T
 * @extends {Signal<ReadonlyArray<T>>}
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
 * @param {IteratorOptions=} opts
 * @returns {Signal<T | undefined>}
 */
SignalIterator.prototype.at = function (index, opts) {};

/**
 * @this {SignalIterator<T>}
 * @param {T | Array<T> | Signal<T> | Signal<Array<T>>} items
 * @param {IteratorOptions=} opts
 * @returns {SignalIterator<T>}
 */
SignalIterator.prototype.concat = function (items, opts) {};

/**
 * @this {SignalIterator<T>}
 * @param {function(T, number): boolean} callbackFn
 * @param {IteratorOptions=} opts
 * @returns {Signal<boolean>}
 */
SignalIterator.prototype.every = function (callbackFn, opts) {};

/**
 * @this {SignalIterator<T>}
 * @param {function(T, number): boolean} callbackFn
 * @param {IteratorOptions=} opts
 * @returns {SignalIterator<T>}
 */
SignalIterator.prototype.filter = function (callbackFn, opts) {};

/**
 * @this {SignalIterator<T>}
 * @param {function(T, number): boolean} callbackFn
 * @param {IteratorOptions=} opts
 * @returns {Signal<T | undefined>}
 */
SignalIterator.prototype.find = function (callbackFn, opts) {};

/**
 * @this {SignalIterator<T>}
 * @param {function(T, number): boolean} callbackFn
 * @param {IteratorOptions=} opts
 * @returns {Signal<number>}
 */
SignalIterator.prototype.findIndex = function (callbackFn, opts) {};

/**
 * @this {SignalIterator<T>}
 * @param {function(T, number): boolean} callbackFn
 * @param {IteratorOptions=} opts
 * @returns {Signal<T | undefined>}
 */
SignalIterator.prototype.findLast = function (callbackFn, opts) {};

/**
 * @this {SignalIterator<T>}
 * @param {function(T,number): boolean} callbackFn
 * @param {IteratorOptions=} opts
 * @returns {Signal<number>}
 */
SignalIterator.prototype.findLastIndex = function (callbackFn, opts) {};

/**
 * @this {SignalIterator<T>}
 * @param {function(T,number): void} callbackFn
 * @param {IteratorOptions=} opts
 * @returns {void}
 */
SignalIterator.prototype.forEach = function (callbackFn, opts) {};

/**
 * @this {SignalIterator<T>}
 * @param {T | Signal<T>} searchElement
 * @param {IteratorOptions=} opts
 * @returns {Signal<boolean>}
 */
SignalIterator.prototype.includes = function (searchElement, opts) {};

/**
 * @this {SignalIterator<T>}
 * @param {T | Signal<T> | (function(): T)} searchElement
 * @param {number | Signal<number> | (function(): number)=} fromIndex
 * @param {IteratorOptions=} opts
 * @returns {Signal<number>}
 */
SignalIterator.prototype.indexOf = function (searchElement, fromIndex, opts) {};

/**
 * @this {SignalIterator<T>}
 * @param {string | Signal<string> | (function(): string)=} separator
 * @param {IteratorOptions=} opts
 * @returns {Signal<string>}
 */
SignalIterator.prototype.join = function (separator, opts) {};

/**
 * @this {SignalIterator<T>}
 * @param {T | Signal<T> | (function(): T)} searchElement
 * @param {number | Signal<number> | (function(): number)=} fromIndex
 * @param {IteratorOptions=} opts
 * @returns {Signal<number>}
 */
SignalIterator.prototype.lastIndexOf = function (searchElement, fromIndex, opts) {};

/**
 * @template U
 * @this {SignalIterator<T>}
 * @param {function(T, Signal<number>): U} callbackFn
 * @param {IteratorOptions=} opts
 * @returns {SignalIterator<U>}
 */
SignalIterator.prototype.map = function (callbackFn, opts) {};

/**
 * @template U, V
 * @this {SignalIterator<T>}
 * @param {function((T | U), T, number): V} callbackFn
 * @param {U | Signal<U> | (function(): U)=} initialValue
 * @param {IteratorOptions=} opts
 * @returns {Signal<V>}
 */
SignalIterator.prototype.reduce = function (callbackFn, initialValue, opts) {};

/**
 * @template U
 * @this {SignalIterator<T>}
 * @param {function((T | U), T, number): U} callbackFn
 * @param {U | Signal<U>=} initialValue
 * @param {IteratorOptions=} opts
 * @returns {Signal<U>}
 */
SignalIterator.prototype.reduceRight = function (callbackFn, initialValue, opts) {};

/**
 * @this {SignalIterator<T>}
 * @param {number | Signal<number> | (function(): number)=} start
 * @param {number | Signal<number> | (function(): number)=} end
 * @param {IteratorOptions=} opts
 * @returns {SignalIterator<T>}
 */
SignalIterator.prototype.slice = function (start, end, opts) {};

/**
 * @this {SignalIterator<T>}
 * @param {function(T, number): boolean} callbackFn
 * @param {IteratorOptions=} opts
 * @returns {Signal<boolean>}
 */
SignalIterator.prototype.some = function (callbackFn, opts) {};

/**
 * @interface
 * @template T
 * @extends {SignalIterator<T>}
 * @extends {SignalData<ReadonlyArray<T>>}
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
 * @extends {IObject<string, SignalValue>}
 */
function SignalObject() {}

/** @typedef {Signal | SignalData | SignalIterator | SignalObject} */
var SignalValue;

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
 * @type {boolean | undefined}
 */
SignalOptions.prototype.lazy;

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
IteratorOptions.prototype.lazy;

/**
 * @type {boolean | undefined}
 */
IteratorOptions.prototype.unstable;
