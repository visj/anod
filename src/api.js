/**
 * @interface
 * @template T
 */
function RootSignal() {}

/**
 * @public
 * @returns {T}
 */
RootSignal.prototype.peek = function () {};

/**
 * @public
 * @returns {void}
 */
RootSignal.prototype.dispose = function () {};

/**
 * @interface
 * @template T
 * @extends {RootSignal<T>}
 */
function ReadonlySignal() {}

/**
 * @public
 * @returns {T}
 */
ReadonlySignal.prototype.val = function () {};

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
Signal.prototype.update = function (val) {};

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
 * @extends {ReadonlySignal<ReadonlyArray<T>>}
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
 * @param {SignalOptions=} opts
 * @returns {ReadonlySignal<T | undefined>}
 */
SignalIterator.prototype.at = function (index, opts) {};

/**
 * @param {T | Array<T> | Signal<T> | Signal<Array<T>>} items
 * @param {SignalOptions=} opts
 * @returns {SignalIterator<T>}
 */
SignalIterator.prototype.concat = function (items, opts) {};

/**
 * @param {function(T, number): boolean} callbackFn
 * @param {SignalOptions=} opts
 * @returns {ReadonlySignal<boolean>}
 */
SignalIterator.prototype.every = function (callbackFn, opts) {};

/**
 * @param {function(T, number): boolean} callbackFn
 * @param {SignalOptions=} opts
 * @returns {SignalIterator<T>}
 */
SignalIterator.prototype.filter = function (callbackFn, opts) {};

/**
 * @param {function(T, number): boolean} callbackFn
 * @param {SignalOptions=} opts
 * @returns {ReadonlySignal<T | undefined>}
 */
SignalIterator.prototype.find = function (callbackFn, opts) {};

/**
 * @param {function(T, number): boolean} callbackFn
 * @param {SignalOptions=} opts
 * @returns {ReadonlySignal<number>}
 */
SignalIterator.prototype.findIndex = function (callbackFn, opts) {};

/**
 * @param {function(T, number): boolean} callbackFn
 * @param {SignalOptions=} opts
 * @returns {ReadonlySignal<T | undefined>}
 */
SignalIterator.prototype.findLast = function (callbackFn, opts) {};

/**
 * @param {function(T,number): boolean} callbackFn
 * @param {SignalOptions=} opts
 * @returns {ReadonlySignal<number>}
 */
SignalIterator.prototype.findLastIndex = function (callbackFn, opts) {};

/**
 * @param {function(T,number): void} callbackFn
 * @param {SignalOptions=} opts
 * @returns {ReadonlySignal<void>}
 */
SignalIterator.prototype.forEach = function (callbackFn, opts) {};

/**
 * @param {T | Signal<T> | (function(): T)} searchElement
 * @param {SignalOptions=} opts
 * @returns {ReadonlySignal<boolean>}
 */
SignalIterator.prototype.includes = function (searchElement, opts) {};

/**
 * @param {T | Signal<T> | (function(): T)} searchElement
 * @param {number | Signal<number> | (function(): number)=} fromIndex
 * @param {SignalOptions=} opts
 * @returns {ReadonlySignal<number>}
 */
SignalIterator.prototype.indexOf = function (searchElement, fromIndex, opts) {};

/**
 * @param {string | Signal<string> | (function(): string)=} separator
 * @param {SignalOptions=} opts
 * @returns {ReadonlySignal<string>}
 */
SignalIterator.prototype.join = function (separator, opts) {};

/**
 * @param {T | Signal<T> | (function(): T)} searchElement
 * @param {number | Signal<number> | (function(): number)=} fromIndex
 * @param {SignalOptions=} opts
 * @returns {ReadonlySignal<number>}
 */
SignalIterator.prototype.lastIndexOf = function (searchElement, fromIndex, opts) {};

/**
 * @template U
 * @param {function(T, Signal<number>): U} callbackFn
 * @param {SignalOptions=} opts
 * @returns {SignalIterator<U>}
 */
SignalIterator.prototype.map = function (callbackFn, opts) {};

/**
 * @template U, V
 * @param {function((T | U), T, number): V} callbackFn
 * @param {U | Signal<U> | (function(): U)=} initialValue
 * @param {SignalOptions=} opts
 * @returns {ReadonlySignal<V>}
 */
SignalIterator.prototype.reduce = function (callbackFn, initialValue, opts) {};

/**
 * @template U
 * @param {function((T | U), T, number): U} callbackFn
 * @param {U | Signal<U> | (function(): U)=} initialValue
 * @param {SignalOptions=} opts
 * @returns {ReadonlySignal<U>}
 */
SignalIterator.prototype.reduceRight = function (callbackFn, initialValue, opts) {};

/**
 * @param {number | Signal<number> | (function(): number)=} start
 * @param {number | Signal<number> | (function(): number)=} end
 * @param {SignalOptions=} opts
 * @returns {SignalIterator<T>}
 */
SignalIterator.prototype.slice = function (start, end, opts) {};

/**
 * @param {function(T, number): boolean} callbackFn
 * @param {SignalOptions=} opts
 * @returns {ReadonlySignal<boolean>}
 */
SignalIterator.prototype.some = function (callbackFn, opts) {};

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

/** @typedef {Signal | ReadonlySignal | SignalIterator | SignalObject} */
var SignalValue;
