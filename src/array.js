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
  extend,
  ModuleInterface,
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
 * @returns {SignalOptions<T, BaseParams<U, V>>}
 */
function mergeParams(source, param1, type1, opts, param2, type2) {
  /** @type {BaseParams<U, V>} */
  var args = { _param1: param1, _param2: param2 };
  /** @type {Signal | Array<Signal> | (function(): void)} */
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
    unstable: unstable
  };
}

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
function iterateSignal(source, fn, param1, type1, opts, param2, type2) {
  var args = mergeParams(source, param1, type1, opts, param2, type2);
  return compute(fn, void 0, args);
}

/**
 * @template T, U, V
 * @param {ReactiveIterator<T>} source
 * @param {function(T, BaseParams<U, V>): T} fn
 * @param {U=} param1
 * @param {number=} type1
 * @param {IteratorOptions=} opts
 * @param {V=} param2
 * @param {number=} type2
 * @returns {SignalIterator<T>}
 */
function iterateArray(source, fn, param1, type1, opts, param2, type2) {
  var args = mergeParams(source, param1, type1, opts, param2, type2);
  return new ComputeArray(fn, null, args)._init();
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
 * @abstract
 * @template T
 * @constructor
 * @extends {Module<ReadonlyArray<T>>}
 * @implements {ModuleInterface<ReadonlyArray<T>>}
 */
function ModuleIterator() {}

/**
 * @type {function(): number}
 */
ModuleIterator.prototype.length;

/**
 * @package
 * @returns {ReactiveIterator<T>}
 */
ModuleIterator.prototype._init = function () {};

/**
 * @struct
 * @template T
 * @constructor
 * @extends {ModuleIterator<ReadonlyArray<T>>}
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
 * @template T
 * @this {ReactiveIterator<T>}
 * @param {T | undefined} prev
 * @param {Params<number, undefined>} params
 * @returns {T | undefined}
 */
function atIterator(prev, params) {
  /** @type {Array<T>} */
  var source = this._source1.peek();
  var length = source.length;
  var index = /** @type {number} */ (read(params._param1));
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
  return iterateSignal(this, atIterator, index, type(index), opts);
};

/**
 * @template T
 * @this {ComputeArray<T>}
 * @param {Array<T>} prev
 * @param {Params<T | Array<T> | Signal<T> | Signal<Array<T>>, undefined>} params
 * @returns {Array<T>}
 */
function concatIterator(prev, params) {
  return this._source1.peek().concat(read(params._param1));
}

/**
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
 * @param {BaseParams<function(T, number): boolean>} params
 * @returns {boolean}
 */
function everyIterator(prev, params) {
  var result = true;
  /** @type {Array<T>} */
  var source = this._source1.peek();
  var length = source.length;
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
  return iterateSignal(this, everyIterator, callbackFn, Type.None, opts);
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
  /** @type {Array<T>} */
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
  return iterateSignal(this, findIterator, callbackFn, Type.None, opts);
};

/**
 * @template T
 * @this {ReactiveIterator<T>}
 * @param {number} prev
 * @param {BaseParams<function(T, number): boolean, undefined>} params
 * @returns {number}
 */
function findIndexIterator(prev, params) {
  /** @type {Array<T>} */
  var source = this._source1.peek();
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
 * @param {function(T, number): boolean} callbackFn
 * @param {IteratorOptions=} opts
 * @returns {Signal<number>}
 */
ReactiveIterator.prototype.findIndex = function (callbackFn, opts) {
  return iterateSignal(this, findIndexIterator, callbackFn, Type.None, opts);
};

/**
 * @template T
 * @this {ReactiveIterator<T>}
 * @param {T | undefined} prev
 * @param {BaseParams<T, (function(T, number): boolean)>} params
 * @returns {T | undefined}
 */
function findLastIterator(prev, params) {
  /** @type {Array<T>} */
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
  return iterateSignal(this, findLastIterator, callbackFn, Type.None, opts);
};

/**
 * @template T
 * @this {ReactiveIterator<T>}
 * @param {T | undefined} prev
 * @param {BaseParams<T, (function(T, number): boolean)>} params
 * @returns {T | undefined}
 */
function findLastIndexIterator(prev, params) {
  /** @type {Array<T>} */
  var source = this._source1.peek();
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
  return iterateSignal(
    this,
    findLastIndexIterator,
    callbackFn,
    Type.None,
    opts
  );
};

/**
 * @template T, U
 * @this {ReactiveIterator<T>}
 * @param {undefined} prev
 * @param {BaseParams<T, U, (function(T, number): void), undefined>} params
 * @returns {void}
 */
function forEachIterator(prev, params) {
  /** @type {Array<T>} */
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
  iterateSignal(this, forEachIterator, callbackFn, Type.None, opts);
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
  return iterateSignal(
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
  return iterateSignal(
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
  return iterateSignal(this, joinIterator, separator, type(separator), opts);
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
ReactiveIterator.prototype.lastIndexOf = function (
  searchElement,
  fromIndex,
  opts
) {
  return iterateSignal(
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
  return iterateSignal(
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
ReactiveIterator.prototype.reduceRight = function (
  callbackFn,
  initialValue,
  opts
) {
  return iterateSignal(
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
 * @param {Params<number | undefined, number | undefined>} params
 * @returns {Array<T>}
 */
function sliceIterator(prev, params) {
  /** @type {Array<T>} */
  var source = this._source1.peek();
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
  return iterateSignal(this, someIterator, callbackFn, Type.None, opts);
};

/**
 * @struct
 * @template T, U
 * @constructor
 * @param {function(T, U): T} fn
 * @param {T} seed
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
  iterateSignal as iterate,
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
