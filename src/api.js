/**
 * @interface
 * @template T
 */
function Signal() {}

/**
 * @public
 * @returns {T}
 */
Signal.prototype.val = function () {};

/**
 * @public
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
 * @public
 * @param {T} val
 * @returns {void}
 */
SignalData.prototype.update = function (val) {};

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
 * @interface
 * @template T
 * @extends {Signal<ReadonlyArray<T>>}
 */
function SignalIterator() {}

/**
 * @const
 * @public
 * @type {function(): number}
 */
SignalIterator.prototype.length;

/**
 * @param {number | Signal<number> | (function(): number)} index
 * @param {IteratorOptions=} opts
 * @returns {Signal<T | undefined>}
 */
SignalIterator.prototype.at = function (index, opts) {};

/**
 * @param {T | Array<T> | Signal<T> | Signal<Array<T>>} items
 * @param {IteratorOptions=} opts
 * @returns {SignalIterator<T>}
 */
SignalIterator.prototype.concat = function (items, opts) {};

/**
 * @param {function(T, number): boolean} callbackFn
 * @param {IteratorOptions=} opts
 * @returns {Signal<boolean>}
 */
SignalIterator.prototype.every = function (callbackFn, opts) {};

/**
 * @param {function(T, number): boolean} callbackFn
 * @param {IteratorOptions=} opts
 * @returns {SignalIterator<T>}
 */
SignalIterator.prototype.filter = function (callbackFn, opts) {};

/**
 * @param {function(T, number): boolean} callbackFn
 * @param {IteratorOptions=} opts
 * @returns {Signal<T | undefined>}
 */
SignalIterator.prototype.find = function (callbackFn, opts) {};

/**
 * @param {function(T, number): boolean} callbackFn
 * @param {IteratorOptions=} opts
 * @returns {Signal<number>}
 */
SignalIterator.prototype.findIndex = function (callbackFn, opts) {};

/**
 * @param {function(T, number): boolean} callbackFn
 * @param {IteratorOptions=} opts
 * @returns {Signal<T | undefined>}
 */
SignalIterator.prototype.findLast = function (callbackFn, opts) {};

/**
 * @param {function(T,number): boolean} callbackFn
 * @param {IteratorOptions=} opts
 * @returns {Signal<number>}
 */
SignalIterator.prototype.findLastIndex = function (callbackFn, opts) {};

/**
 * @param {function(T,number): void} callbackFn
 * @param {IteratorOptions=} opts
 * @returns {Signal<void>}
 */
SignalIterator.prototype.forEach = function (callbackFn, opts) {};

/**
 * @param {T | Signal<T> | (function(): T)} searchElement
 * @param {IteratorOptions=} opts
 * @returns {Signal<boolean>}
 */
SignalIterator.prototype.includes = function (searchElement, opts) {};

/**
 * @param {T | Signal<T> | (function(): T)} searchElement
 * @param {number | Signal<number> | (function(): number)=} fromIndex
 * @param {IteratorOptions=} opts
 * @returns {Signal<number>}
 */
SignalIterator.prototype.indexOf = function (searchElement, fromIndex, opts) {};

/**
 * @param {string | Signal<string> | (function(): string)=} separator
 * @param {IteratorOptions=} opts
 * @returns {Signal<string>}
 */
SignalIterator.prototype.join = function (separator, opts) {};

/**
 * @param {T | Signal<T> | (function(): T)} searchElement
 * @param {number | Signal<number> | (function(): number)=} fromIndex
 * @param {IteratorOptions=} opts
 * @returns {Signal<number>}
 */
SignalIterator.prototype.lastIndexOf = function (searchElement, fromIndex, opts) {};

/**
 * @template U
 * @param {function(T, Signal<number>): U} callbackFn
 * @param {IteratorOptions=} opts
 * @returns {SignalIterator<U>}
 */
SignalIterator.prototype.map = function (callbackFn, opts) {};

/**
 * @template U, V
 * @param {function((T | U), T, number): V} callbackFn
 * @param {U | Signal<U> | (function(): U)=} initialValue
 * @param {IteratorOptions=} opts
 * @returns {Signal<V>}
 */
SignalIterator.prototype.reduce = function (callbackFn, initialValue, opts) {};

/**
 * @template U
 * @param {function((T | U), T, number): U} callbackFn
 * @param {U | Signal<U> | (function(): U)=} initialValue
 * @param {IteratorOptions=} opts
 * @returns {Signal<U>}
 */
SignalIterator.prototype.reduceRight = function (callbackFn, initialValue, opts) {};

/**
 * @param {number | Signal<number> | (function(): number)=} start
 * @param {number | Signal<number> | (function(): number)=} end
 * @param {IteratorOptions=} opts
 * @returns {SignalIterator<T>}
 */
SignalIterator.prototype.slice = function (start, end, opts) {};

/**
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
 * @param {function(T,T): number=} compareFn
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

/** @typedef {Signal | SignalData | SignalIterator | SignalObject} */
var SignalValue;

/**
 * @struct
 * @record
 * @template T
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

/**
 * @type {(function(T, T): boolean) | null | undefined}
 */
IteratorOptions.prototype.compare;