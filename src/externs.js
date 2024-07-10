/**
 * NOTE: this is an ES2023 extern.
 * @param {function(this:S, T, number, !Array<T>): boolean} predicateFn
 * @param {S=} opt_this
 * @return {T|undefined}
 * @this {IArrayLike<T>|string}
 * @template T,S
 * @see https://tc39.es/ecma262/#sec-array.prototype.findlast
 */
ReadonlyArray.prototype.findLast = function(predicateFn, opt_this) {};

/**
 * NOTE: this is an ES2023 extern.
 * @param {function(this:S, T, number, !Array<T>): boolean} predicateFn
 * @param {S=} opt_this
 * @return {number}
 * @this {IArrayLike<T>|string}
 * @template T,S
 * @see https://tc39.es/ecma262/#sec-array.prototype.findlastindex
 */
ReadonlyArray.prototype.findLastIndex = function(predicateFn, opt_this) {};