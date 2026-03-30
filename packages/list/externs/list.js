
/**
 * @interface
 * @template T
 * @extends {ReadonlySignal<Array<T>>}
 */
function Collection() { }

// --- Non-Mutating Array Methods (Readonly/Compute capable) ---

/**
 * @param {number | ReadonlySignal<number> | (function(): number)} index
 * @returns {ReadonlySignal<T|undefined>}
 */
Collection.prototype.at = function(index) { };

/**
 * @param {...*} items
 * @returns {ReadonlySignal<Array<T>>}
 */
Collection.prototype.concat = function(...items) { };

/**
 * @returns {ReadonlySignal<!IteratorIterable<!Array<number|T>>>}
 */
Collection.prototype.entries = function() { };

/**
 * @param {function(T, number): boolean} cb
 * @param {number=} opts
 * @returns {ReadonlySignal<boolean>}
 */
Collection.prototype.every = function(cb, opts) { };

/**
 * @param {function(T, number, Array<T>): boolean} cb
 * @param {number=} opts
 * @returns {ReadonlySignal<Array<T>>}
 */
Collection.prototype.filter = function(cb, opts) { };

/**
 * @param {function(T, number): boolean} cb
 * @param {number=} opts
 * @returns {ReadonlySignal<T|undefined>}
 */
Collection.prototype.find = function(cb, opts) { };

/**
 * @param {function(T, number): boolean} cb
 * @param {number=} opts
 * @returns {ReadonlySignal<number>}
 */
Collection.prototype.findIndex = function(cb, opts) { };

/**
 * @param {function(T, number, Array<T>): boolean} cb
 * @param {number=} opts
 * @returns {ReadonlySignal<T|undefined>}
 */
Collection.prototype.findLast = function(cb, opts) { };

/**
 * @param {function(T, number, Array<T>): boolean} cb
 * @param {number=} opts
 * @returns {ReadonlySignal<number>}
 */
Collection.prototype.findLastIndex = function(cb, opts) { };

/**
 * @param {number | ReadonlySignal<number> | (function(): number)=} depth
 * @returns {ReadonlySignal<Array<T>>}
 */
Collection.prototype.flat = function(depth) { };

/**
 * @template U
 * @param {function(T, number, IArrayLike<T>): !ReadonlyArray<U>} cb
 * @param {number=} opts
 * @returns {ReadonlySignal<Array<U>>}
 */
Collection.prototype.flatMap = function(cb, opts) { };

/**
 * @param {function(T, number): (function(): void | void)} cb
 * @param {number=} opts
 * @returns {DisposableSignal}
 */
Collection.prototype.forEach = function(cb, opts) { };

/**
 * @param {*} searchElement
 * @param {number | ReadonlySignal<number> | (function(): number)=} fromIndex
 * @returns {ReadonlySignal<boolean>}
 */
Collection.prototype.includes = function(searchElement, fromIndex) { };

/**
 * @param {*} searchElement
 * @param {number | ReadonlySignal<number> | (function(): number)=} fromIndex
 * @returns {ReadonlySignal<number>}
 */
Collection.prototype.indexOf = function(searchElement, fromIndex) { };

/**
 * @param {string | ReadonlySignal<string> | (function(): string)=} separator
 * @returns {ReadonlySignal<string>}
 */
Collection.prototype.join = function(separator) { };

/**
 * @returns {ReadonlySignal<!IteratorIterable<number>>}
 */
Collection.prototype.keys = function() { };

/**
 * @template U
 * @param {function(T, number, Array<T>): U} cb
 * @param {number=} opts
 * @returns {ReadonlySignal<Array<U>>}
 */
Collection.prototype.map = function(cb, opts) { };

/**
 * @template U
 * @param {function(U, T, number, Array<T>): U} cb
 * @param {U | ReadonlySignal<U> | (function(): U)=} initialValue
 * @param {number=} opts
 * @returns {ReadonlySignal<U>}
 */
Collection.prototype.reduce = function(cb, initialValue, opts) { };

/**
 * @template U
 * @param {function(U, T, number, Array<T>): U} cb
 * @param {U | ReadonlySignal<U> | (function(): U)=} initialValue
 * @param {number=} opts
 * @returns {ReadonlySignal<U>}
 */
Collection.prototype.reduceRight = function(cb, initialValue, opts) { };

/**
 * @param {number | ReadonlySignal<number> | (function(): number)=} start
 * @param {number | ReadonlySignal<number> | (function(): number)=} end
 * @returns {ReadonlySignal<Array<T>>}
 */
Collection.prototype.slice = function(start, end) { };

/**
 * @param {function(T, number, Array<T>): boolean} cb
 * @param {number=} opts
 * @returns {ReadonlySignal<boolean>}
 */
Collection.prototype.some = function(cb, opts) { };

/**
 * @returns {ReadonlySignal<!IteratorIterable<T>>}
 */
Collection.prototype.values = function() { };

// --- Mutating Array Methods (Signal only) ---

/**
 * @interface
 * @template T
 * @extends {Collection<T>}
 * @extends {WritableSignal<Array<T>>}
 */
function List() { }

/**
 * @param {number} target
 * @param {number} start
 * @param {number=} end
 * @returns {void}
 */
List.prototype.copyWithin = function(target, start, end) { };

/**
 * @param {T} value
 * @param {number=} start
 * @param {number=} end
 * @returns {void}
 */
List.prototype.fill = function(value, start, end) { };

/**
 * @returns {void}
 */
List.prototype.pop = function() { };

/**
 * @param {...T} items
 * @returns {void}
 */
List.prototype.push = function(...items) { };

/**
 * @returns {void}
 */
List.prototype.reverse = function() { };

/**
 * @returns {void}
 */
List.prototype.shift = function() { };

/**
 * @param {function(T, T): number=} compareFn
 * @returns {void}
 */
List.prototype.sort = function(compareFn) { };

/**
 * @param {number} start
 * @param {number=} deleteCount
 * @param {...T} items
 * @returns {void}
 */
List.prototype.splice = function(start, deleteCount, ...items) { };

/**
 * @param {...T} items
 * @returns {void}
 */
List.prototype.unshift = function(...items) { };