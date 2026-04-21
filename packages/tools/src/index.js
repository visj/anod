import { Signal } from "@fyren/core";

/**
 * Guarded signal with validation and custom equality.
 * Created via `gate(value)`, extended with `.check(fn)` and `.guard(fn)`.
 * @constructor
 * @template T
 * @param {T} value
 */
export function Gate(value) {
  /** @type {number} */
  this._flag = 0;
  /** @type {T} */
  this._value = value;
  /** @type {number} */
  this._version = -1;
  /** @type {Receiver} */
  this._sub1 = null;
  /** @type {number} */
  this._sub1slot = 0;
  /** @type {Array<Receiver | number> | null} */
  this._subs = null;
  /** @type {(function(T,T): boolean) | Array<(function(T,T): boolean)> | null} */
  this._check = null;
  /** @type {(function(T): boolean) | Array<(function(T): boolean)> | null} */
  this._guard = null;
}

Gate.prototype = Object.create(Signal.prototype);

/**
 * Guarded set. Runs all guards first — throws if any reject the
 * value. Then runs equality checks — skips set when all checks
 * return true (values equal). When no checks are registered,
 * falls through to Signal's default !== comparison.
 * @this {!Gate<T>}
 * @param {T} value
 * @returns {void}
 */
Gate.prototype.set = function (value) {
  let guard = this._guard;
  if (guard !== null) {
    if (typeof guard === "function") {
      if (!guard(value)) {
        throw new Error(guard.name);
      }
    } else {
      let count = guard.length;
      for (let i = 0; i < count; i++) {
        if (!guard[i](value)) {
          throw new Error(guard[i].name);
        }
      }
    }
  }
  let check = this._check;
  runChecks: if (check !== null) {
    let prev = this._value;
    if (typeof check === "function") {
      if (check(value, prev)) {
        return;
      }
    } else {
      let count = check.length;
      for (let i = 0; i < count; i++) {
        if (!check[i](value, prev)) {
          break runChecks;
        }
      }
      return;
    }
  }
  Signal.prototype.set.call(this, value);
};

/**
 * Adds a custom equality check. If all checks return true
 * for (newValue, oldValue), the set is skipped. Chainable.
 * @this {!Gate<T>}
 * @param {function(T,T): boolean} fn
 * @returns {!Gate<T>}
 */
Gate.prototype.check = function (fn) {
  let check = this._check;
  if (check === null) {
    this._check = fn;
  } else if (typeof check === "function") {
    this._check = [check, fn];
  } else {
    check.push(fn);
  }
  return this;
};

/**
 * Adds a type guard. If the guard returns false for the
 * incoming value, set() throws using the guard's `.name`.
 * Chainable.
 * @this {!Gate<T>}
 * @param {function(T): boolean} fn
 * @returns {!Gate<T>}
 */
Gate.prototype.guard = function (fn) {
  let guard = this._guard;
  if (guard === null) {
    this._guard = fn;
  } else if (typeof guard === "function") {
    this._guard = [guard, fn];
  } else {
    guard.push(fn);
  }
  return this;
};

/**
 * Gate equality check: uses custom _check fns if present.
 * Returns true if the value changed (i.e., NOT equal to current).
 * @this {!Gate<T>}
 * @param {T} value
 * @returns {boolean}
 */
Gate.prototype._changed = function (value) {
  let check = this._check;
  if (check === null) {
    return this._value !== value;
  }
  if (typeof check === "function") {
    return !check(this._value, value);
  }
  let count = check.length;
  for (let i = 0; i < count; i++) {
    if (!check[i](this._value, value)) {
      return true;
    }
  }
  return false;
};

/**
 * Creates a guarded signal.
 * @template T
 * @param {T} value
 * @returns {!Gate<T>}
 */
export function gate(value) {
  return new Gate(value);
}
