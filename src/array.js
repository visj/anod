import {
  Send,
  Receive,
  State,
  Type,
  Reactive,
  Data,
  Compute,
  type,
  extend,
  addReceiver,
  readSource,
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
 */
function DataArrayInterface() {}

/**
 * @struct
 * @abstract
 * @template T
 * @constructor
 * @extends {Reactive<ReadonlyArray<T>>}
 * @implements {SignalIterator<T>}
 */
function ReactiveIterator() {}

extend(ReactiveIterator, Reactive);

/**
 * @record
 * @template T, U, V
 */
function BaseParams() {}

/**
 * @const
 * @package
 * @type {ReactiveIterator<T>}
 */
BaseParams.prototype._source;

/**
 * @const
 * @package
 * @type {U}
 */
BaseParams.prototype._param1;

/**
 * @const
 * @package
 * @type {V | undefined}
 */
BaseParams.prototype._param2;

/**
 * @struct
 * @record
 * @template T, U, V
 * @extends {BaseParams<T, U | Signal<U> | (function(): U), V | Signal<V> | (function(): V)>}
 */
function Params() {}

/**
 * @const
 * @enum {number}
 */
var Mutation = {
  None: 0,
  Insert: 1,
  Remove: 2,
  Replace: 4
};

/**
 * @template T, U, V
 * @param {ReactiveIterator<T>} source
 * @param {U=} param1
 * @param {number=} type1
 * @param {IteratorOptions=} opts
 * @param {V=} param2
 * @param {number=} type2
 * @returns {SignalOptions<T, BaseParams<T, U, V>>}
 */
function mergeParams(source, param1, type1, opts, param2, type2) {
  /** @type {BaseParams<T, U, V>} */
  var args = { _source: source, _param1: param1, _param2: param2 };
  /** @type {Signal | Array<Signal> | (function(): void)} */
  var sources;
  /** @type {Signal | Array<Signal> | (function(): void) | null} */
  var param3 = null;
  /** @type {number} */
  var type3 = Type.None;
  /** @type {(function(T, T): boolean) | undefined} */
  var compare;
  /** @type {boolean | undefined} */
  var unstable;
  if (opts != null) {
    if (opts.unstable) {
      unstable = true;
    }
    if (opts.compare) {
      compare = opts.compare;
    }
    if (opts.source != null) {
      param3 = opts.source;
      type3 = type(param3);
    }
  }
  var types = type1 | type2 | type3;
  if (types & Type.Function) {
    sources = function () {
      addReceiver(source, this);
      if (type1 & (Type.Reactive | Type.Function)) {
        readSource(param1, this);
      }
      if (type2 & (Type.Reactive | Type.Function)) {
        readSource(param2, this);
      }
      if (type3 & (Type.Reactive | Type.Function)) {
        readSource(/** @type {function(): void} */ (param3), this);
      }
    };
  } else if (types & Type.Reactive || type3 & Type.Array) {
    sources = [source];
    if (type1 & Type.Reactive) {
      sources.push(param1);
    }
    if (type2 & Type.Reactive) {
      sources.push(param2);
    }
    if (type3 & Type.Reactive) {
      sources.push(/** @type {Signal} */ (param3));
    } else if (type3 & Type.Array) {
      var i = 0,
        j = /** @type {Array<Signal>} */ (sources).length,
        len = /** @type {Array<Signal>} */ (param3).length;
      while (i < len) {
        sources[j++] = /** @type {Array<Signal>} */ (param3)[i++];
      }
    }
  } else {
    sources = source;
  }
  return {
    args: args,
    sample: true,
    source: sources,
    unstable: unstable,
    compare: compare
  };
}

/**
 * @template T, U, V
 * @param {ReactiveIterator<T>} source
 * @param {function(T, BaseParams<T, U, V>): T} fn
 * @param {U=} param1
 * @param {number=} type1
 * @param {IteratorOptions=} opts
 * @param {V=} param2
 * @param {number=} type2
 * @returns {Signal<T>}
 */
function iterateCompute(source, fn, param1, type1, opts, param2, type2) {
  var args = mergeParams(source, param1, type1, opts, param2, type2);
  return compute(fn, void 0, args);
}

/**
 * @template T, U, V
 * @param {ReactiveIterator<T>} source
 * @param {function(T, BaseParams<T, U, V>): T} fn
 * @param {U=} param1
 * @param {number=} type1
 * @param {IteratorOptions=} opts
 * @param {V=} param2
 * @param {number=} type2
 * @returns {SignalIterator<T>}
 */
function iterateArray(source, fn, param1, type1, opts, param2, type2) {
  var args = mergeParams(source, param1, type1, opts, param2, type2);
  return new ComputeArray(fn, null, args);
}

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
 * @template T
 * @param {ReactiveIterator<T>} source
 * @returns {function(): number}
 */
function getLength(source) {
  return function () {
    return source.val().length;
  };
}

/**
 * @template T
 * @this {ReactiveIterator<T>}
 * @param {T | undefined} prev
 * @param {Params<T, number, undefined>} params
 * @returns {T | undefined}
 */
function atIterator(prev, params) {
  /** @type {ReadonlyArray<T>} */
  var source = params._source.peek();
  var length = source.length;
  var index = /** @type {number} */ (read(params._param1));
  if (index >= 0 && index < length) {
    return source[index];
  }
}

/**
 * @public
 * @param {number | Signal<number> | (function(): number)} index
 * @param {IteratorOptions=} opts
 * @returns {Signal<T | undefined>}
 */
ReactiveIterator.prototype.at = function (index, opts) {
  return iterateCompute(this, atIterator, index, type(index), opts);
};

/**
 * @template T
 * @this {ComputeArray<T>}
 * @param {Array<T>} prev
 * @param {Params<T | Array<T> | Signal<T> | Signal<Array<T>>, undefined>} params
 * @returns {Array<T>}
 */
function concatIterator(prev, params) {
  return params._source.peek().concat(read(params._param1));
}

/**
 * @public
 * @param {T | Array<T> | Signal<T> | Signal<Array<T>>} items
 * @param {IteratorOptions=} opts
 * @returns {SignalIterator<T>}
 */
ReactiveIterator.prototype.concat = function (items, opts) {
  return iterateArray(this, concatIterator, items, type(items), opts);
};

/**
 * @template T
 * @this {ReactiveIterator<T>}
 * @param {boolean} prev
 * @param {BaseParams<T, (function(T, number): boolean), undefined>} params
 * @returns {boolean}
 */
function everyIterator(prev, params) {
  /** @type {ReadonlyArray<T>} */
  var source = params._source.peek();
  var length = source.length;
  var result = true;
  if (length > 0) {
    var callback = params._param1;
    for (var i = 0; result && i < length; i++) {
      result = callback(source[i], i);
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
  return iterateCompute(this, everyIterator, callbackFn, Type.None, opts);
};

function filterIterator(prev, params) {}

/**
 * @public
 * @param {function(T, number): boolean} callbackFn
 * @returns {SignalIterator<T>}
 */
ReactiveIterator.prototype.filter = function (callbackFn) {};

/**
 * @template T
 * @this {ReactiveIterator<T>}
 * @param {T | undefined} prev
 * @param {BaseParams<T, (function(T, number): boolean), undefined>} params
 * @returns {T | undefined}
 */
function findIterator(prev, params) {
  /** @type {ReadonlyArray<T>} */
  var source = params._source.peek();
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
 * @public
 * @param {function(T, number): boolean} callbackFn
 * @param {IteratorOptions=} opts
 * @returns {Signal<T | undefined>}
 */
ReactiveIterator.prototype.find = function (callbackFn, opts) {
  return iterateCompute(this, findIterator, callbackFn, Type.None, opts);
};

/**
 * @template T
 * @this {ReactiveIterator<T>}
 * @param {number} prev
 * @param {BaseParams<T, function(T, number): boolean, undefined>} params
 * @returns {number}
 */
function findIndexIterator(prev, params) {
  /** @type {ReadonlyArray<T>} */
  var source = params._source.peek();
  var length = source.length;
  if (length > 0) {
    var callback = params._param1;
    for (var i = 0; i < length; i++) {
      if (callback(source[i], i)) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * @public
 * @param {function(T, number): boolean} callbackFn
 * @param {IteratorOptions=} opts
 * @returns {Signal<number>}
 */
ReactiveIterator.prototype.findIndex = function (callbackFn, opts) {
  return iterateCompute(this, findIndexIterator, callbackFn, Type.None, opts);
};

/**
 * @template T
 * @this {ReactiveIterator<T>}
 * @param {T | undefined} prev
 * @param {BaseParams<T, (function(T, number): boolean), undefined>} params
 * @returns {T | undefined}
 */
function findLastIterator(prev, params) {
  /** @type {ReadonlyArray<T>} */
  var source = params._source.peek();
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
 * @public
 * @param {function(T,number): boolean} callbackFn
 * @param {IteratorOptions=} opts
 * @returns {Signal<T | undefined>}
 */
ReactiveIterator.prototype.findLast = function (callbackFn, opts) {
  return iterateCompute(this, findLastIterator, callbackFn, Type.None, opts);
};

/**
 * @template T
 * @this {ReactiveIterator<T>}
 * @param {T | undefined} prev
 * @param {BaseParams<T, (function(T, number): boolean), undefined>} params
 * @returns {T | undefined}
 */
function findLastIndexIterator(prev, params) {
  /** @type {ReadonlyArray<T>} */
  var source = params._source.peek();
  var length = source.length;
  if (length > 0) {
    var callback = params._param1;
    for (var i = length - 1; i >= 0; i--) {
      if (callback(source[i], i)) {
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
  return iterateCompute(
    this,
    findLastIndexIterator,
    callbackFn,
    Type.None,
    opts
  );
};

/**
 * @template T
 * @this {ReactiveIterator<T>}
 * @param {undefined} prev
 * @param {BaseParams<T, (function(T, number): void), undefined>} params
 * @returns {void}
 */
function forEachIterator(prev, params) {
  /** @type {ReadonlyArray<T>} */
  var source = params._source.peek();
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
  iterateCompute(this, forEachIterator, callbackFn, Type.None, opts);
};

/**
 * @template T
 * @this {ReactiveIterator<T>}
 * @param {boolean} prev
 * @param {BaseParams<T, T | Signal<T> | (function(): T), undefined>} params
 * @returns {boolean}
 */
function includesIterator(prev, params) {
  return params._source.peek().includes(read(params._param1));
}

/**
 * @param {T | Signal<T> | (function(): T)} searchElement
 * @param {IteratorOptions=} opts
 * @returns {Signal<boolean>}
 */
ReactiveIterator.prototype.includes = function (searchElement, opts) {
  return iterateCompute(
    this,
    includesIterator,
    searchElement,
    type(searchElement),
    opts
  );
};

/**
 * @template T
 * @this {ReactiveIterator<T>}
 * @param {number} prev
 * @param {Params<T, number>} params
 * @returns {number}
 */
function indexOfIterator(prev, params) {
  return params._source
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
  return iterateCompute(
    this,
    indexOfIterator,
    searchElement,
    type(searchElement),
    opts,
    fromIndex,
    type(fromIndex)
  );
};

/**
 * @template T
 * @this {ReactiveIterator<T>}
 * @param {string} prev
 * @param {Params<T, string | undefined, undefined>} params
 * @returns {string}
 */
function joinIterator(prev, params) {
  return params._source.peek().join(read(params._param1));
}

/**
 * @param {string | Signal<string> | (function(): string)=} separator
 * @param {IteratorOptions=} opts
 * @returns {Signal<string>}
 */
ReactiveIterator.prototype.join = function (separator, opts) {
  return iterateCompute(this, joinIterator, separator, type(separator), opts);
};

/**
 * @template T
 * @this {ReactiveIterator<T>}
 * @param {number} prev
 * @param {Params<T, number>} params
 * @returns {number}
 */
function lastIndexOfIterator(prev, params) {
  return params._source
    .peek()
    .lastIndexOf(read(params._param1), read(params._param2));
}

/**
 * @param {T | Signal<T> | (function(): T)} searchElement
 * @param {number | Signal<number> | (function(): number)=} fromIndex
 * @param {IteratorOptions=} opts
 * @returns {Signal<number>}
 */
ReactiveIterator.prototype.lastIndexOf = function (
  searchElement,
  fromIndex,
  opts
) {
  return iterateCompute(
    this,
    lastIndexOfIterator,
    searchElement,
    type(searchElement),
    opts,
    fromIndex,
    type(fromIndex)
  );
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
  return params._source
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
  return iterateCompute(
    this,
    reduceIterator,
    callbackFn,
    Type.None,
    opts,
    initialValue,
    type(initialValue)
  );
};

/**
 * @template T, U
 * @this {ReactiveIterator<T>}
 * @param {U} prev
 * @param {BaseParams<T, function((T | U), T, number): U, U | Signal<U> | (function(): U)>} params
 * @returns {U}
 */
function reduceRightIterator(prev, params) {
  return params._source
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
ReactiveIterator.prototype.reduceRight = function (
  callbackFn,
  initialValue,
  opts
) {
  return iterateCompute(
    this,
    reduceRightIterator,
    callbackFn,
    Type.None,
    opts,
    initialValue,
    type(initialValue)
  );
};

/**
 * @template T
 * @this {ComputeArray<T>}
 * @param {Array<T>} prev
 * @param {Params<T, number | undefined, number | undefined>} params
 * @returns {Array<T>}
 */
function sliceIterator(prev, params) {
  /** @type {ReadonlyArray<T>} */
  var source = params._source.peek();
  if (this._state & State.Initial) {
    return source.slice(
      /** @type {number | undefined} */ (read(params._param1)),
      /** @type {number | undefined} */ (read(params._param2))
    );
  }
  // todo
  return source.slice(
    /** @type {number | undefined} */ (read(params._param1)),
    /** @type {number | undefined} */ (read(params._param2))
  );
}

/**
 * @param {number | Signal<number> | (function(): number)=} start
 * @param {number | Signal<number> | (function(): number)=} end
 * @param {IteratorOptions=} opts
 * @returns {SignalIterator<T>}
 */
ReactiveIterator.prototype.slice = function (start, end, opts) {
  return iterateArray(
    this,
    sliceIterator,
    start,
    type(start),
    opts,
    end,
    type(end)
  );
};

/**
 * @template T
 * @this {ReactiveIterator<T>}
 * @param {boolean} prev
 * @param {BaseParams<T, function(T, number): boolean, undefined>} params
 * @returns {boolean}
 */
function someIterator(prev, params) {
  return params._source.peek().some(read(params._param1));
}

/**
 * @param {function(T, number): boolean} callbackFn
 * @param {IteratorOptions=} opts
 * @returns {Signal<boolean>}
 */
ReactiveIterator.prototype.some = function (callbackFn, opts) {
  return iterateCompute(this, someIterator, callbackFn, Type.None, opts);
};

/**
 * @struct
 * @template T, U, V
 * @constructor
 * @param {function(T, BaseParams<T, U, V>): T} fn
 * @param {T=} seed
 * @param {IteratorOptions=} opts
 * @extends {ReactiveIterator<T>}
 * @implements {ComputeArrayInterface<T>}
 */
function ComputeArray(fn, seed, opts) {
  Compute.call(/** @type {?} */ (this), fn, seed, opts);
  /**
   * @public
   * @type {function(): number}
   */
  this.length = getLength(this);
}

extend(ComputeArray, ReactiveIterator, Compute);

/**
 * @struct
 * @constructor
 */
function Change() {
  /**
   * @package
   * @type {number}
   */
  this._mut = Mutation.None;
  /**
   * @package
   * @type {number}
   */
  this._head = -1;
  /**
   * @package
   * @type {number}
   */
  this._tail = -1;
  /**
   * @package
   * @type {number}
   */
  this._count = 0;
  /**
   * @package
   * @type {Array}
   */
  this._args = [];
}

/**
 * @struct
 * @template T
 * @constructor
 * @param {Array<T>=} val
 * @extends {ReactiveIterator<T>}
 * @implements {DataArrayInterface<T>}
 */
function DataArray(val) {
  Data.call(/** @type {?} */ (this), val || []);
  /**
   * @public
   * @type {function(): number}
   */
  this.length = getLength(this);
  /**
   * @package
   * @type {Change}
   */
  this._next = new Change();
  /**
   * @package
   * @type {Change}
   */
  this._change = new Change();
}

extend(DataArray, ReactiveIterator, Data);

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

DataArray.prototype.modify = function (callbackFn) {};

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
  return new DataArray(val);
}

window["anod"]["array"] = array;

export {
  ComputeArrayInterface,
  DataArrayInterface,
  BaseParams,
  Mutation,
  iterateCompute,
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
