import {
  State,
  Stage,
  Type,
  Send,
  Receive,
  CONTEXT,
  CHANGES,
  DISPOSES,
  Reactive,
  Module,
  Data,
  Compute,
  reset,
  type,
  start,
  addReceiver,
  readSource,
  cleanupReceiver,
  sendWillUpdate,
  compute
} from "./core.js";

/**
 * @interface
 * @template T
 * @extends {Send}
 * @extends {Receive}
 * @extends {SignalIterator<T>}
 */
function ComputeArrayInterface() {}

/**
 * @interface
 * @template T
 * @extends {Send}
 * @extends {SignalArray<T>}
 * @extends {SignalIterator<T>}
 */
function DataArrayInterface() {}

/**
 * @record
 * @template T, U
 */
function BaseParams() {}

/**
 * @const
 * @package
 * @type {T}
 */
BaseParams.prototype._param1;

/**
 * @const
 * @package
 * @type {U | undefined}
 */
BaseParams.prototype._param2;

/**
 * @struct
 * @record
 * @template T, U
 * @extends {BaseParams<T | Signal<T> | (function(): T), U | Signal<U> | (function(): U)>}
 */
function Params() {}

/**
 * @const
 * @enum {number}
 */
var Mutation = {
  None: 0
};

/**
 * @template T, U, V
 * @param {ReactiveIterator<T>} source
 * @param {function(T, BaseParams<U, V>): T} fn
 * @param {U=} param1
 * @param {number=} type1
 * @param {IteratorOptions=} opts
 * @param {V=} param2
 * @param {number=} type2
 * @returns {Signal<T>}
 */
function iterate(source, fn, param1, type1, opts, param2, type2) {
  /** @type {BaseParams<U, V>} */
  var args = { _param1: param1, _param2: param2 };
  /** @type {Reactive | Array<Reactive> | (function(): void)} */
  var sources;
  /** @type {Signal | Array<Signal> | (function(): void) | null} */
  var param3 = null;
  var type3 = Type.None;
  var unstable = false;
  if (opts != null) {
    if (opts.unstable) {
      unstable = true;
    }
    if (opts.source != null) {
      param3 = opts.source;
      type3 = type(param3);
    }
  }
  if (type1 === Type.Function || type2 === Type.Function || type3 === Type.Function) {
    sources = function () {
      addReceiver(source, this);
      readSource(param1, this);
      readSource(param2, this);
      readSource(/** @type {function(): void} */(param3), this);
    };
  } else if (type1 === Type.Reactive || type2 === Type.Reactive || type3 === Type.Reactive || type3 === Type.Array) {
    sources = [source];
    if (type1 === Type.Reactive) {
      sources.push(param1);
    }
    if (type2 === Type.Reactive) {
      sources.push(param2);
    }
    if (type3 === Type.Reactive) {
      sources.push(/** @type {Reactive} */(param3));
    } else if (type3 === Type.Array) {
      for (var i = 0, j = sources.length, len = /** @type {Array<Send>} */(param3).length; i < len;) {
        sources[j++] = /** @type {Array<Send>} */(param3)[i++];
      }
    }
  } else {
    sources = source;
  }
  return compute(fn, void 0, {
    args: args,
    sample: true,
    source: sources,
    unstable: unstable
  });
}

/**
 * @const
 * @type {Object}
 */
var REF = {};

/**
 * @template T
 * @param {T | Reactive<T> | (function(): T)} args
 * @returns {T}
 */
function read(args) {
  var t = type(args);
  return t === Type.Reactive
    ? /** @type {Reactive<T>} */ (args).peek()
    : t === Type.Function
      ? /** @type {function(): T} */ (args)()
      : /** @type {T} */ (args);
}

/**
 * @struct
 * @template T
 * @constructor
 * @extends {Reactive<Array<T>>}
 * @implements {SignalIterator<T>}
 */
function ReactiveIterator() {}

ReactiveIterator.prototype = new Reactive();

/**
 *
 * @param {ReactiveIterator} source
 * @returns {function(): number}
 */
function getLength(source) {
  return function () {
    return source.val().length;
  };
}

/**
 * @type {function(): number}
 */
ReactiveIterator.prototype.length;

/**
 * @template T
 * @this {ReactiveIterator<T>}
 * @param {T | undefined} prev
 * @param {Params<number, undefined>} params
 * @returns {T | undefined}
 */
function atIterator(prev, params) {
  var source = this._source1.peek();
  var length = source.length;
  var index = /** @type {number} */(read(params._param1));
  if (index >= 0 && index < length) {
    return source[index];
  }
}

/**
 * @param {number | Signal<number> | (function(): number)} index
 * @param {IteratorOptions=} opts
 * @returns {Signal<T | undefined>}
 */
ReactiveIterator.prototype.at = function (index, opts) {
  return iterate(this, atIterator, index, type(index), opts);
};

/**
 * @param {T | Array<T> | SignalIterator<T>} items
 * @param {IteratorOptions=} opts
 * @returns {SignalIterator<T>}
 */
ReactiveIterator.prototype.concat = function (items, opts) {};

/**
 * @template T
 * @this {ReactiveIterator<T>}
 * @param {boolean} prev
 * @param {BaseParams<function(T, number): boolean>} params
 * @returns {boolean}
 */
function everyIterator(prev, params) {
  var result = true;
  var source = this._source1.peek();
  var length = source.length;
  if (length > 0) {
    var callback = params._param1;
    for (var i = 0; result && i < length; ) {
      result = callback(source[i], i++);
    }
  }
  return result;
}

/**
 * @public
 * @param {function(T, number): boolean} callbackFn
 * @param {IteratorOptions=} opts
 * @returns {Signal<boolean>}
 */
ReactiveIterator.prototype.every = function (callbackFn, opts) {
  return iterate(this, everyIterator, callbackFn, Type.None, opts);
};

function filterIterator(prev, params) {}

/**
 * @param {function(T,number): boolean} callbackFn
 * @returns {SignalIterator<T>}
 */
ReactiveIterator.prototype.filter = function (callbackFn) {};

/**
 * @template T
 * @this {ReactiveIterator<T>}
 * @param {T | undefined} prev
 * @param {BaseParams<(function(T, number): boolean), undefined>} params
 * @returns {T | undefined}
 */
function findIterator(prev, params) {
  var source = this._source1.peek();
  var length = source.length;
  if (length > 0) {
    var callback = params._param1;
    for (var i = 0; i < length; i++) {
      var item = source[i];
      if (callback(item, i)) {
        return item;
      }
    }
  }
}

/**
 * @param {function(T, number): boolean} callbackFn
 * @param {IteratorOptions=} opts
 * @returns {Signal<T | undefined>}
 */
ReactiveIterator.prototype.find = function (callbackFn, opts) {
  return iterate(this, findIterator, callbackFn, Type.None, opts);
};

/**
 * @template T
 * @this {ReactiveIterator<T>}
 * @param {number} prev
 * @param {BaseParams<function(T, number): boolean, undefined>} params
 * @returns {number}
 */
function findIndexIterator(prev, params) {
  var source = this._source1.peek();
  var length = source.length;
  if (length > 0) {
    var callback = params._param1;
    for (var i = 0; i < length; i++) {
      var item = source[i];
      if (callback(item, i)) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * @param {function(T, number): boolean} callbackFn
 * @param {IteratorOptions=} opts
 * @returns {Signal<number>}
 */
ReactiveIterator.prototype.findIndex = function (callbackFn, opts) {
  return iterate(this, findIndexIterator, callbackFn, Type.None, opts);
};

/**
 * @template T
 * @this {ReactiveIterator<T>}
 * @param {T | undefined} prev
 * @param {BaseParams<T, (function(T, number): boolean)>} params
 * @returns {T | undefined}
 */
function findLastIterator(prev, params) {
  var source = this._source1.peek();
  var length = source.length;
  if (length > 0) {
    var callback = params._param1;
    for (var i = length - 1; i >= 0; i--) {
      var item = source[i];
      if (callback(item, i)) {
        return item;
      }
    }
  }
}

/**
 * @param {function(T,number): boolean} callbackFn
 * @param {IteratorOptions=} opts
 * @returns {Signal<T | undefined>}
 */
ReactiveIterator.prototype.findLast = function (callbackFn, opts) {
  return iterate(this, findLastIterator, callbackFn, Type.None, opts);
};

/**
 * @template T
 * @this {ReactiveIterator<T>}
 * @param {T | undefined} prev
 * @param {BaseParams<T, (function(T, number): boolean)>} params
 * @returns {T | undefined}
 */
function findLastIndexIterator(prev, params) {
  var source = this._source1.peek();
  var length = source.length;
  if (length > 0) {
    var callback = params._param1;
    for (var i = length - 1; i >= 0; i--) {
      var item = source[i];
      if (callback(item, i)) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * @param {function(T,number): boolean} callbackFn
 * @param {IteratorOptions=} opts
 * @returns {Signal<number>}
 */
ReactiveIterator.prototype.findLastIndex = function (callbackFn, opts) {
  return iterate(this, findLastIndexIterator, callbackFn, Type.None, opts);
};

/**
 * @template T, U
 * @this {ReactiveIterator<T>}
 * @param {undefined} prev
 * @param {BaseParams<T, U, (function(T, number): void), undefined>} params
 * @returns {void}
 */
function forEachIterator(prev, params) {
  var source = this._source1.peek();
  var length = source.length;
  var callback = params._param1;
  for (var i = 0; i < length; i++) {
    callback(source[i], i);
  }
}

/**
 * @param {function(T,number): void} callbackFn
 * @param {IteratorOptions=} opts
 * @returns {void}
 */
ReactiveIterator.prototype.forEach = function (callbackFn, opts) {
  iterate(this, forEachIterator, callbackFn, Type.None, opts);
};

/**
 * @template T
 * @this {ReactiveIterator<T>}
 * @param {boolean} prev
 * @param {BaseParams<T, T | Signal<T> | (function(): T)>} params
 * @returns {boolean}
 */
function includesIterator(prev, params) {
  return this._source1.peek().includes(read(params._param1));
}

/**
 * @param {T | Signal<T> | (function(): T)} searchElement
 * @param {IteratorOptions=} opts
 * @returns {Signal<boolean>}
 */
ReactiveIterator.prototype.includes = function (searchElement, opts) {
  return iterate(this, includesIterator, searchElement, type(searchElement), opts);
};

/**
 * @template T
 * @this {ReactiveIterator<T>}
 * @param {number} prev
 * @param {Params<T, number>} params
 * @returns {number}
 */
function indexOfIterator(prev, params) {
  return this._source1
    .peek()
    .indexOf(read(params._param1), read(params._param2));
}

/**
 * @param {T | Signal<T> | (function(): T)} searchElement
 * @param {number | Signal<number> | (function(): number)=} fromIndex
 * @param {IteratorOptions=} opts
 * @returns {Signal<number>}
 */
ReactiveIterator.prototype.indexOf = function (searchElement, fromIndex, opts) {
  return iterate(this, indexOfIterator, searchElement, type(searchElement), opts, fromIndex, type(fromIndex));
};

/**
 * @template T
 * @this {ReactiveIterator<T>}
 * @param {string} prev
 * @param {Params<string | undefined, undefined>} params
 * @returns {string}
 */
function joinIterator(prev, params) {
  return this._source1.peek().join(read(params._param1));
}

/**
 * @param {string | Signal<string> | (function(): string)=} separator
 * @param {IteratorOptions=} opts
 * @returns {Signal<string>}
 */
ReactiveIterator.prototype.join = function (separator, opts) {
  return iterate(this, joinIterator, separator, type(separator), opts);
};

/**
 * @template T
 * @this {ReactiveIterator<T>}
 * @param {number} prev
 * @param {Params<T, number>} params
 * @returns {number}
 */
function lastIndexOfIterator(prev, params) {
  return this._source1
    .peek()
    .lastIndexOf(read(params._param1), read(params._param2));
}

/**
 * @param {T | Signal<T> | (function(): T)} searchElement
 * @param {number | Signal<number> | (function(): number)=} fromIndex
 * @param {IteratorOptions=} opts
 * @returns {Signal<number>}
 */
ReactiveIterator.prototype.lastIndexOf = function (searchElement, fromIndex, opts) {
  return iterate(this, lastIndexOfIterator, searchElement, type(searchElement), opts, fromIndex, type(fromIndex));
};

/**
 * @template U
 * @param {function(T, Signal<number>): U} callbackFn
 * @returns {SignalIterator<U>}
 */
ReactiveIterator.prototype.map = function (callbackFn) {};

/**
 * @template T
 * @this {ReactiveIterator<T>}
 * @param {T} prev
 * @param {Params} params
 * @returns {T}
 */
function reduceIterator(prev, params) {
  return this._source1
    .peek()
    .reduce(read(params._param1), read(params._param2));
}

/**
 * @template U, V
 * @param {function((T | U),T,number): V} callbackFn
 * @param {U | Signal<U> | (function(): U)=} initialValue
 * @param {IteratorOptions=} opts
 * @returns {Signal<V>}
 */
ReactiveIterator.prototype.reduce = function (callbackFn, initialValue, opts) {
  return iterate(this, reduceIterator, callbackFn, Type.None, opts, initialValue, type(initialValue));
};

/**
 * @template T, U
 * @this {ReactiveIterator<T>}
 * @param {U} prev
 * @param {BaseParams<function((T | U), T, number): U, U | Signal<U> | (function(): U)>} params
 * @returns {U}
 */
function reduceRightIterator(prev, params) {
  return this._source1
    .peek()
    .reduceRight(read(params._param1), read(params._param2));
}

/**
 * @template U
 * @param {function((T | U), T, number): U} callbackFn
 * @param {U | Signal<U> | (function(): U)=} initialValue
 * @param {IteratorOptions=} opts
 * @returns {Signal<U>}
 */
ReactiveIterator.prototype.reduceRight = function (callbackFn, initialValue, opts) {
  return iterate(this, reduceRightIterator, callbackFn, Type.None, opts, initialValue, type(initialValue));
};

/**
 * @template T
 * @param {Array<T>} prev
 * @param {*} params
 */
function sliceIterator(prev, params) {

}

/**
 * @param {number | Signal<number> | (function(): number)=} start
 * @param {number | Signal<number> | (function(): number)=} end
 * @returns {SignalIterator<T>}
 */
ReactiveIterator.prototype.slice = function (start, end) {};

/**
 * @template T, U
 * @this {ReactiveIterator<T>}
 * @param {boolean} prev
 * @param {BaseParams<function(T, number): boolean, undefined>} params
 * @returns {boolean}
 */
function someIterator(prev, params) {
  return this._source1.peek().some(read(params._param1));
}

/**
 * @param {function(T, number): boolean} callbackFn
 * @param {IteratorOptions=} opts
 * @returns {Signal<boolean>}
 */
ReactiveIterator.prototype.some = function (callbackFn, opts) {
  return iterate(this, someIterator, callbackFn, Type.None, opts);
};

/**
 * @struct
 * @template T, U
 * @constructor
 * @param {function(T, U): T} fn
 * @param {T} value
 * @param {SignalOptions<T, U>=} opts
 * @extends {ReactiveIterator<T>}
 * @implements {ComputeArrayInterface<T>}
 */
function ComputeArray(fn, value, opts) {
  Compute.call(/** @type {?} */ (this), fn, value, opts);
  /**
   * @public
   * @type {function(): number}
   */
  this.length = getLength(this);
}

ComputeArray.prototype = new ReactiveIterator();
for (var method in Compute.prototype) {
  ComputeArray.prototype[method] = Compute.prototype[method];
}

/**
 * @struct
 * @template T
 * @constructor
 * @param {Array<T>} val
 * @extends {ReactiveIterator<T>}
 * @implements {DataArrayInterface<T>}
 */
function DataArray(val) {
  Data.call(/** @type {?} */ (this), val);
  /**
   * @public
   * @type {function(): number}
   */
  this.length = getLength(this);
}

DataArray.prototype = new ReactiveIterator();
for (var method in Data.prototype) {
  DataArray.prototype[method] = Data.prototype[method];
}

// /**
//  * @public
//  * @override
//  * @param {Array<T>} val
//  * @returns {void}
//  */
// DataArray.prototype.update = function (val) {
//   this._mutate(1, val);
// };

/**
 * @package
 * @param {number} mutation
 * @param {*=} param
 * @returns {void}
 */
DataArray.prototype._mutate = function (mutation, param) {
  // this._next = param !== void 0 ? param : REF;
};

/**
 * @public
 * @returns {void}
 */
DataArray.prototype.pop = function () {};

/**
 * @public
 * @param {...T} elementN
 * @returns {void}
 */
DataArray.prototype.push = function (elementN) {};

/**
 * @public
 * @returns {void}
 */
DataArray.prototype.shift = function () {};

/**
 * @public
 * @returns {void}
 */
DataArray.prototype.reverse = function () {};

/**
 * @public
 * @param {function(T,T): number=} compareFn
 * @returns {void}
 */
DataArray.prototype.sort = function (compareFn) {};

/**
 * @public
 * @param {number} start
 * @param {number=} deleteCount
 * @param {...T} items
 * @returns {void}
 */
DataArray.prototype.splice = function (start, deleteCount, items) {};

/**
 * @public
 * @param {...T} elementN
 * @returns {void}
 */
DataArray.prototype.unshift = function (elementN) {};

/**
 * @template T
 * @param {Array<T>=} val
 * @returns {SignalArray<T>}
 */
function array(val) {
  return new DataArray(val || []);
}

window["anod"]["array"] = array;

export {
  ComputeArrayInterface,
  DataArrayInterface,
  BaseParams,
  Type,
  Mutation,
  type,
  iterate,
  REF,
  read,
  ReactiveIterator,
  getLength,
  atIterator,
  everyIterator,
  filterIterator,
  findIterator,
  findIndexIterator,
  findLastIterator,
  findLastIndexIterator,
  forEachIterator,
  includesIterator,
  indexOfIterator,
  joinIterator,
  lastIndexOfIterator,
  reduceIterator,
  reduceRightIterator,
  someIterator,
  ComputeArray,
  DataArray,
  array
};
