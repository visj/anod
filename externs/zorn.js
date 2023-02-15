/**
 * @fileoverview
 * @externs
 */

/**
 * @template T
 * @interface
 */
function Signal() { }

/**
 * @public
 * @type {T}
 * @nocollapse
 * @throws {Error}
 */
Signal.prototype.val;

/**
 * @public
 * @type {T}
 * @nocollapse
 */
Signal.prototype.peek;