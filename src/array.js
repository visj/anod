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
  cleanupReceiver,
  sendWillUpdate,
  compute,
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
 * @template T, U, V, W
 */
function IteratorOptions() {}

/**
 * @package
 * @type {ReactiveIterator<T>}
 */
IteratorOptions.prototype._src;

/**
 * @const
 * @package
 * @type {number}
 */
IteratorOptions.prototype._type1;

/**
 * @const
 * @package
 * @type {V}
 */
IteratorOptions.prototype._param1;

/**
 * @const
 * @package
 * @type {number}
 */
IteratorOptions.prototype._type2;

/**
 * @const
 * @package
 * @type {W | undefined}
 */
IteratorOptions.prototype._param2;

/**
 * @const
 * @enum {number}
 */
var Mutation = {
  None: 0,
};

/**
 * @template T, U, V, W
 * @param {ReactiveIterator<T>} source
 * @param {function(T, IteratorOptions<T, U, V, W>): T} fn
 * @param {V=} param1
 * @param {W=} param2
 * @param {T=} seed
 * @returns {Signal<T>}
 */
function iterate(source, fn, param1, param2, seed) {
  var type1 = type(param1);
  var type2 = type(param2);
  /** @type {IteratorOptions<T, U, V, W>} */
  var args = {
    _src: source,
    _type1: type1,
    _param1: param1,
    _type2: type2,
    _param2: param2,
  };
  /** @type {Signal | Array<Signal> | (function(): void)} */
  var sources;
  if (type1 === Type.Function || type2 === Type.Function) {
    sources = function () {
      addReceiver(source, this);
      read(type1, param1);
      read(type2, param2);
    };
  } else if (type1 === Type.Reactive || type2 === Type.Reactive) {
    sources = [source];
    if (type1 === Type.Reactive) {
      sources.push(param1);
    }
    if (type2 === Type.Reactive) {
      sources.push(param2);
    }
  } else {
    sources = source;
  }
  return compute(fn, seed, {
    args: args,
    source: sources,
    sample: true
  });
}

/**
 * @const
 * @type {Object}
 */
var REF = {};

/**
 * @template T
 * @param {number} type
 * @param {T | Signal<T> | (function(): T)} args
 * @returns {T}
 */
function read(type, args) {
  switch (type) {
    case Type.Reactive:
      return /** @type {Signal<T>} */ (args).val();
    case Type.Function:
      return /** @type {function(): T} */ (args)();
  }
  return /** @type {T} */ (args);
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
 * @template T, U, V, W
 * @param {T | undefined} prev
 * @param {IteratorOptions<T, U, V, W>} opts
 * @returns {T | undefined}
 */
function atIterator(prev, opts) {
  return opts._src.peek()[read(opts._type1, opts._param1)];
}

/**
 * @param {number | Signal<number> | (function(): number)} index
 * @returns {Signal<T | undefined>}
 */
ReactiveIterator.prototype.at = function (index) {
  return iterate(this, atIterator, index);
};

/**
 * @param {...(T | Array<T> | SignalIterator<T>)} items
 * @returns {SignalIterator<T>}
 */
ReactiveIterator.prototype.concat = function (items) {};

/**
 * @template T
 * @param {boolean} prev
 * @param {IteratorOptions<T, (function(T, number): boolean)>} opts
 * @returns {boolean}
 */
function everyIterator(prev, opts) {
  var result = true;
  var source = opts._src.peek();
  var length = source.length;
  if (length > 0) {
    var callback = opts._param1;
    for (var i = 0; result && i < length; ) {
      result = callback(source[i], i++);
    }
  }
  return result;
}

/**
 * @public
 * @param {function(T, number): boolean} callbackFn
 * @returns {Signal<boolean>}
 */
ReactiveIterator.prototype.every = function (callbackFn) {
  return iterate(this, everyIterator, callbackFn);
};

function filterIterator(prev, params) {}

/**
 * @param {function(T,number): boolean} callbackFn
 * @returns {SignalIterator<T>}
 */
ReactiveIterator.prototype.filter = function (callbackFn) {};

/**
 * @template T
 * @param {T | undefined} prev
 * @param {IteratorOptions<T, (function(T, number): boolean)>} opts
 * @returns {T | void}
 */
function findIterator(prev, opts) {
  var source = opts._src.peek();
  var length = source.length;
  if (length > 0) {
    var callback = opts._param1;
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
 * @returns {Signal<T | undefined>}
 */
ReactiveIterator.prototype.find = function (callbackFn) {
  return iterate(this, findIterator, callbackFn);
};

/**
 * @template T
 * @param {number} prev
 * @param {IteratorOptions<T, (function(T, number): boolean)>} opts
 * @returns {number}
 */
function findIndexIterator(prev, opts) {
  var source = opts._src.peek();
  var length = source.length;
  if (length > 0) {
    var callback = opts._param1;
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
 * @returns {Signal<number>}
 */
ReactiveIterator.prototype.findIndex = function (callbackFn) {
  return iterate(this, findIndexIterator, callbackFn);
};

/**
 * @template T
 * @param {T | undefined} prev
 * @param {IteratorOptions<T, (function(T, number): boolean)>} opts
 * @returns {T | undefined}
 */
function findLastIterator(prev, opts) {
  return opts._src.peek().findLast(opts._param1);
}

/**
 * @param {function(T,number): boolean} callbackFn
 * @returns {Signal<T | undefined>}
 */
ReactiveIterator.prototype.findLast = function (callbackFn) {
  return iterate(this, findLastIterator, callbackFn);
};

/**
 * @template T
 * @param {T | undefined} prev
 * @param {IteratorOptions<T, (function(T, number): boolean)>} opts
 * @returns {T | undefined}
 */
function findLastIndexIterator(prev, opts) {
  return opts._src.peek().findLastIndex(opts._param1);
}

/**
 * @param {function(T,number): boolean} callbackFn
 * @returns {Signal<number>}
 */
ReactiveIterator.prototype.findLastIndex = function (callbackFn) {
  return iterate(this, findLastIndexIterator, callbackFn);
};

/**
 * @template T, U
 * @param {void} prev
 * @param {IteratorOptions<T, U, (function(T, number): void), undefined>} opts
 * @returns {void}
 */
function forEachIterator(prev, opts) {
  var source = opts._src.peek();
  var length = source.length;
  var callback = opts._param1;
  for (var i = 0; i < length; i++) {
    callback(source[i], i);
  }
}

/**
 * @param {function(T,number): void} callbackFn
 * @returns {void}
 */
ReactiveIterator.prototype.forEach = function (callbackFn) {
  iterate(this, forEachIterator, callbackFn);
};

/**
 * @template T
 * @param {boolean} prev
 * @param {IteratorOptions<T, T | Signal<T> | (function(): T)>} opts
 * @returns {boolean}
 */
function includesIterator(prev, opts) {
  return opts._src.peek().includes(read(opts._type1, opts._param1));
}

/**
 * @param {T | Signal<T> | (function(): T)} searchElement
 * @returns {Signal<boolean>}
 */
ReactiveIterator.prototype.includes = function (searchElement) {
  return iterate(this, includesIterator, searchElement);
};

/**
 * @template T
 * @param {number} prev
 * @param {IteratorOptions<T, T>} opts
 * @returns {number}
 */
function indexOfIterator(prev, opts) {
  return opts._src
    .peek()
    .indexOf(read(opts._type1, opts._param1), read(opts._type2, opts._param2));
}

/**
 * @param {T | Signal<T> | (function(): T)} searchElement
 * @param {number | Signal<number> | (function(): number)=} fromIndex
 * @returns {Signal<number>}
 */
ReactiveIterator.prototype.indexOf = function (searchElement, fromIndex) {
  return iterate(this, indexOfIterator, searchElement, fromIndex);
};

/**
 * @param {string} prev
 * @param {IteratorOptions} opts
 * @returns {string}
 */
function joinIterator(prev, opts) {
  return opts._src.peek().join(read(opts._type1, opts._param1));
}

/**
 * @param {string | Signal<string> | (function(): string)=} separator
 * @returns {Signal<string>}
 */
ReactiveIterator.prototype.join = function (separator) {
  return iterate(this, joinIterator, separator);
};

/**
 * @param {number} prev
 * @param {IteratorOptions} opts
 * @returns {number}
 */
function lastIndexOfIterator(prev, opts) {
  return opts._src
    .peek()
    .lastIndexOf(
      read(opts._type1, opts._param1),
      read(opts._type2, opts._param2),
    );
}

/**
 * @param {T | Signal<T> | (function(): T)} searchElement
 * @param {number | Signal<number> | (function(): number)=} fromIndex
 * @returns {Signal<number>}
 */
ReactiveIterator.prototype.lastIndexOf = function (searchElement, fromIndex) {
  return iterate(this, lastIndexOfIterator, searchElement, fromIndex);
};

/**
 * @template U
 * @param {function(T,Signal<number>): U} callbackFn
 * @returns {SignalIterator<U>}
 */
ReactiveIterator.prototype.map = function (callbackFn) {};

/**
 * @template T
 * @param {T} prev
 * @param {IteratorOptions} opts
 * @returns {T}
 */
function reduceIterator(prev, opts) {
  return opts._src
    .peek()
    .reduce(read(opts._type1, opts._param1), read(opts._type2, opts._param2));
}

/**
 * @template U, V
 * @param {function((T | U),T,number): V} callbackFn
 * @param {U | Signal<U> | (function(): U)=} initialValue
 * @returns {Signal<V>}
 */
ReactiveIterator.prototype.reduce = function (callbackFn, initialValue) {
  return iterate(this, reduceIterator, callbackFn, initialValue);
};

/**
 * @template T
 * @param {T} prev
 * @param {IteratorOptions} opts
 * @returns {T}
 */
function reduceRightIterator(prev, opts) {
  return opts._src
    .peek()
    .reduceRight(
      read(opts._type1, opts._param1),
      read(opts._type2, opts._param2),
    );
}

/**
 * @template U
 * @param {function((T|U),T,number): U} callbackFn
 * @param {Signal<U>|U=} initialValue
 * @returns {Signal<U>}
 */
ReactiveIterator.prototype.reduceRight = function (callbackFn, initialValue) {
  return iterate(this, reduceRightIterator, callbackFn, initialValue);
};

/**
 * @param {number | Signal<number> | (function(): number)=} start
 * @param {number | Signal<number> | (function(): number)=} end
 * @returns {SignalIterator<T>}
 */
ReactiveIterator.prototype.slice = function (start, end) {};

/**
 * @template T, U
 * @param {boolean} prev
 * @param {IteratorOptions<T, U, (function(T, number): boolean), undefined>} opts
 * @returns {boolean}
 */
function someIterator(prev, opts) {
  return opts._src.peek().some(read(opts._type1, opts._param1));
}

/**
 * @param {function(T, number): boolean} callbackFn
 * @returns {Signal<boolean>}
 */
ReactiveIterator.prototype.some = function (callbackFn) {
  return iterate(this, someIterator, callbackFn);
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

/**
 * @public
 * @override
 * @param {Array<T>} val
 * @returns {void}
 */
DataArray.prototype.update = function (val) {
  this._mutate(1, val);
};

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
  IteratorOptions,
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
  array,
};
