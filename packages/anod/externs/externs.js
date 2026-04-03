/**
 * @record
 * @template T
 */
function IteratorResult() {}

/** @type {boolean} */
IteratorResult.prototype.done;

/** @type {T | undefined} */
IteratorResult.prototype.value;

/**
 * @record
 * @template T
 */
function IAsyncIterator() {}

/** 
 * @return {!IThenable<!IteratorResult<T>>} 
 */
IAsyncIterator.prototype.next = function() {};

/** 
 * @param {*=} value
 * @return {!IThenable<!IteratorResult<T>>} 
 */
IAsyncIterator.prototype.return = function(value) {};

/** 
 * @param {*=} error
 * @return {!IThenable<!IteratorResult<T>>} 
 */
IAsyncIterator.prototype.throw = function(error) {};