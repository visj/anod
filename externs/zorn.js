/* __EXCLUDE__ */
/**
 * @fileoverview
 * @externs
 */
/* __EXCLUDE__ */
/**
 * @template T
 * @interface
 */
function Signal() { }

/**
 * @template T
 * @interface
 * @extends {Signal<T>}
 */
function ReadonlySignal() { }

/**
 * @type {T}
 * @readonly
 * @nocollapse
 * @throws {Error}
 */
ReadonlySignal.prototype.val;

/**
 * @type {T}
 * @readonly
 * @nosideeffects
 */
ReadonlySignal.prototype.peek;

/**
 * @template T
 * @interface
 * @extends {Signal<T>}
 */
function WritableSignal() { }

/**
 * @type {T}
 * @nocollapse
 * @throws {Error}
 */
WritableSignal.prototype.val;

/**
 * @type {T}
 * @readonly
 * @nosideeffects
 */
WritableSignal.prototype.peek;

/**
 * @template T
 * @interface
 * @extends {Signal<!Array<T>>}
 */
function SignalCollection() { }

/**
 * @type {T}
 * @readonly
 * @nosideeffects
 */
SignalCollection.prototype.peek;

/**
 * @param {function(T,!Signal<number>): boolean} callbackFn
 * @returns {!Signal<boolean>}
 */
SignalCollection.prototype.every = function (callbackFn) { };

/**
 * @param {function(T,!Signal<number>): boolean} callbackFn
 * @returns {!SignalCollection<T>}
 */
SignalCollection.prototype.filter = function (callbackFn) { };

/**
 * @param {function(T,!Signal<number>): boolean} callbackFn
 * @returns {!Signal<T|undefined>}
 */
SignalCollection.prototype.find = function (callbackFn) { };

/**
 * @param {function(T,!Signal<number>): boolean} callbackFn
 * @returns {!Signal<number>}
 */
SignalCollection.prototype.findIndex = function (callbackFn) { };

/**
 * @param {function(T,!Signal<number>): boolean} callbackFn
 * @returns {!Signal<T|undefined>}
 */
SignalCollection.prototype.findLast = function (callbackFn) { };

/**
 * @param {function(T,!Signal<number>): boolean} callbackFn
 * @returns {!Signal<number>}
 */
SignalCollection.prototype.findLastIndex = function (callbackFn) { };

/**
 * @param {function(T): void} callbackFn
 * @returns {void} 
 */
SignalCollection.prototype.forEach = function (callbackFn) { };

/**
 * @param {T} searchElement
 * @returns {!Signal<boolean>}
 */
SignalCollection.prototype.includes = function (searchElement) { };

/**
 * 
 * @param {T} searchElement 
 * @param {number=} fromIndex
 * @returns {!Signal<number>}
 */
SignalCollection.prototype.indexOf = function (searchElement, fromIndex) { };

/**
 * 
 * @param {string=} separator
 * @returns {!Signal<string>}
 */
SignalCollection.prototype.join = function (separator) { };

/**
 * 
 * @param {T} searchElement 
 * @param {number=} fromIndex
 * @returns {!Signal<number>}
 */
SignalCollection.prototype.lastIndexOf = function (searchElement, fromIndex) { };

/**
 * @template U
 * @param {function(T,!Signal<number>): U} callbackFn
 * @returns {!SignalCollection<U>}
 */
SignalCollection.prototype.map = function (callbackFn) { };

/**
 * @template U
 * @param {function((T|U),T,!Signal<number>): U} callbackFn 
 * @param {U=} initialValue 
 * @returns {!SignalCollection<U>}
 */
SignalCollection.prototype.reduce = function (callbackFn, initialValue) { };

/**
 * @template U
 * @param {function((T|U),T,!Signal<number>): U} callbackFn 
 * @param {U=} initialValue 
 * @returns {!SignalCollection<U>}
 */
SignalCollection.prototype.reduceRight = function (callbackFn, initialValue) { };

/**
 * @returns {!SignalCollection<T>}
 */
SignalCollection.prototype.reverse = function () { };

/**
 * @param {number=} start
 * @param {number=} end
 * @returns {!SignalCollection<T>}
 */
SignalCollection.prototype.slice = function (start, end) { };

/**
 * 
 * @param {function(T,!Signal<number>): boolean} callbackFn
 * @returns {!Signal<boolean>} 
 */
SignalCollection.prototype.some = function (callbackFn) { };

/**
 * @template T
 * @interface
 * @extends {ReadonlySignal<!Array<T>>}
 * @extends {SignalCollection<T>}
 */
function SignalEnumerable() { }

/**
 * @type {T}
 * @readonly
 * @nocollapse
 * @throws {Error}
 */
SignalEnumerable.prototype.val;

/**
 * @template T
 * @interface
 * @extends {WritableSignal<!Array<T>>}
 * @extends {SignalCollection<T>}
 */
function SignalArray() { }

/**
 * @throws {Error}
 */
SignalArray.prototype.pop = function () { };

/**
 * @param {...T} elementN
 * @throws {Error}
 */
SignalArray.prototype.push = function (elementN) { };

/**
 * @throws {Error}
 */
SignalArray.prototype.shift = function () { };

/**
 * 
 * @param {function(T,T): number} compareFn
 * @throws {Error}
 */
SignalArray.prototype.sort = function (compareFn) { };

/**
 * 
 * @param {number} start 
 * @param {number=} deleteCount 
 * @param {...T} items
 * @throws {Error}
 */
SignalArray.prototype.splice = function (start, deleteCount, items) { };

/**
 * 
 * @param {...T} elementN
 * @throws {Error} 
 */
SignalArray.prototype.unshift = function (elementN) { };