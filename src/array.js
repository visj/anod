import {
  Send,
  Receive,
  VOID,
  CONTEXT,
  CHANGES,
  State,
  Type,
  Reactive,
  Data,
  Compute,
  type,
  extend,
  addReceiver,
  readSource,
  sendWillUpdate,
  compute,
  exec,
  reset
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
 * @record
 * @template T, U, V
 */
function BaseParams() {}

/**
 * @package
 * @type {?}
 */
BaseParams.prototype._state;

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
 * @struct
 * @constructor
 * @template T
 * @param {number} type
 */
function Change(type) {
  /**
   * @public
   * @type {number}
   */
  this.type = type;
  /**
   * @public
   * @type {number}
   */
  this.index = -1;
  /**
   * @public
   * @type {number}
   */
  this.deletes = 0;
  /**
   * @public
   * @type {number}
   */
  this.inserts = 0;
  /**
   * @public
   * @type {T | Array<T> | null}
   */
  this.params = null;
}

/**
 * @const
 * @enum {number}
 */
var Mutation = {
  None: 0,
  Custom: 1,
  Pop: 2,
  Push: 3,
  Shift: 4,
  Reverse: 5,
  Sort: 6,
  Splice: 7,
  Unshift: 8,
  Assign: 9,
  TypeMask: 15,
  Insert: 16,
  Remove: 32,
  Reorder: 64
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
function mergeOpts(source, param1, type1, opts, param2, type2) {
  /** @type {BaseParams<T, U, V>} */
  var args = { _state: void 0, _param1: param1, _param2: param2 };
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
  return compute(
    fn,
    void 0,
    mergeOpts(source, param1, type1, opts, param2, type2)
  );
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
  var args = mergeOpts(source, param1, type1, opts, param2, type2);
  return new ComputeArray(fn, void 0, args);
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
 * @package
 * @type {Change<T>}
 */
ReactiveIterator.prototype._mut;

/**
 * @template T
 * @this {ReactiveIterator<T>}
 * @param {T | undefined} prev
 * @param {Params<T, number, undefined>} params
 * @returns {T | undefined}
 */
function atIterator(prev, params) {
  /** @type {ReadonlyArray<T>} */
  var source = this._source1.peek();
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
  return this._source1.peek().concat(read(params._param1));
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
 * @param {BaseParams<T, (function(T, number): boolean), boolean>} params
 * @returns {boolean}
 */
function everyIterator(prev, params) {
  var source = this._source1;
  /** @type {ReadonlyArray<T>} */
  var array = source.peek();
  var length = array.length;
  /** @type {number} */
  var state = params._state;
  params._state = 0;
  if (length > 0) {
    var start = 0;
    var last = length - 1;
    if (params._param2 && !(this._state & State.Initial)) {
      /** @type {Change} */
      var mut = source._mut;
      var insert = mut.inserts;
      var remove = mut.deletes;
      if (insert === 0 && remove === 0) {
        params._state = prev ? last : -1;
        return prev;
      }
      if (!(mut.type & Mutation.Reorder)) {
        var index = mut.index;
        if (prev) {
          // All items returned true last time.
          if (insert === 0) {
            // Every item passed and we didn't add any.
            params._state = last;
            return prev;
          }
          if (state !== -1) {
            // We only need to check inserted items.
            start = index;
            last = index + insert;
          }
        } else {
          // Some item returned false last time
          if (
            remove === 0 ||
            (state !== -1 &&
              (index > state || (insert === 0 && index + remove < state)))
          ) {
            // Since it failed for some item last time, and we did
            // not remove an item, it will return false this time as well.
            // Or, we did not make changes prior to the found falsy item.
            // Or, we did not insert any new item and the removals take place before
            // the previously found item.
            params._state = index < state ? state + (insert - remove) : state;
            return prev;
          }
        }
        start = state < 0 ? 0 : index < state ? index : state;
      }
    }
    var callback = params._param1;
    for (; start <= last; start++) {
      if (!callback(array[start], start)) {
        params._state = start;
        return false;
      }
    }
    params._state = length - 1;
  }
  return true;
}

/**
 * @public
 * @param {function(T, number): boolean} callbackFn
 * @param {IteratorOptions=} opts
 * @returns {Signal<boolean>}
 */
ReactiveIterator.prototype.every = function (callbackFn, opts) {
  return iterateCompute(
    this,
    everyIterator,
    callbackFn,
    Type.None,
    opts,
    callbackFn.length === 1,
    Type.None
  );
};

/**
 * @template T
 * @this {ReactiveIterator<T>}
 * @param {Array<T>} prev
 * @param {BaseParams<T, (function(T, number): boolean), undefined>} params
 * @returns {Array<T>}
 */
function filterIterator(prev, params) {
  /** @type {ReadonlyArray<T>} */
  var source = this._source1.peek();
  var length = source.length;
  /** @type {Array<T>} */
  var result = [];
  if (length > 0) {
    var callback = params._param1;
    for (var i = 0; i < length; i++) {
      var item = source[i];
      if (callback(item, i)) {
        result.push(item);
      }
    }
  }
  return result;
}

/**
 * @public
 * @param {function(T, number): boolean} callbackFn
 * @param {IteratorOptions=} opts
 * @returns {SignalIterator<T>}
 */
ReactiveIterator.prototype.filter = function (callbackFn, opts) {
  return iterateArray(this, filterIterator, callbackFn, Type.None, opts);
};

/**
 * @template T
 * @this {ReactiveIterator<T>}
 * @param {T | undefined} prev
 * @param {BaseParams<T, (function(T, number): boolean), undefined>} params
 * @returns {T | undefined}
 */
function findIterator(prev, params) {
  /** @type {ReadonlyArray<T>} */
  var source = this._source1.peek();
  var length = source.length;
  if (length > 0) {
    var i = 0;
    if (!(this._state & State.Initial)) {
      var mut = this._source1._mut;
      var typ = mut._type;
      if (typ !== Mutation.None && !(typ & Mutation.Reorder)) {
        i = params._state;
        var index = mut._index;
        if (
          (mut._insert === 0 &&
            (i < 0 || i < index || i > index + mut._remove)) ||
          (i > 0 && i < index)
        ) {
          if (index < i) {
            params._state = i - mut._remove + mut._insert;
          }
          console.log("fast track: ", params._state);
          return prev;
        }
        if (i > index) {
          i = index;
        }
      }
    }
    var callback = params._param1;
    for (; i < length; i++) {
      var item = source[i];
      if (callback(item, i)) {
        params._state = i;
        return item;
      }
    }
  }
  params._state = -1;
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
 * @returns {Signal<void>}
 */
ReactiveIterator.prototype.forEach = function (callbackFn, opts) {
  return iterateCompute(this, forEachIterator, callbackFn, Type.None, opts);
};

/**
 * @template T
 * @this {ReactiveIterator<T>}
 * @param {boolean} prev
 * @param {BaseParams<T, T | Signal<T> | (function(): T), undefined>} params
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
  return this._source1.peek().join(read(params._param1));
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
 * @template T, U
 * @this {ReactiveIterator<T>}
 * @param {Array<U>} prev
 * @param {BaseParams<T, (function(T, Signal<number>): U), boolean>} params
 * @returns {Array<U>}
 */
function mapIterator(prev, params) {
  /** @type {ReadonlyArray<T>} */
  var source = this._source1.peek();
  var length = source.length;
  /** @type {Array<U>} */
  var result = [];
  if (length > 0) {
    var callback = params._param1;
    // for (var i = 0; i < length; i++) {
    //   var item = source[i];
    //   if (callback(item, i)) {
    //     result.push(item);
    //   }
    // }
  }
  return result;
}

/**
 * @template U
 * @param {function(T, Signal<number>): U} callbackFn
 * @param {IteratorOptions=} opts
 * @returns {SignalIterator<U>}
 */
ReactiveIterator.prototype.map = function (callbackFn, opts) {
  return iterateArray(
    this,
    mapIterator,
    callbackFn,
    Type.None,
    opts,
    callbackFn.length === 0,
    Type.None
  );
};

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
 * @template T
 * @this {ReactiveIterator<T>}
 * @param {boolean} prev
 * @param {BaseParams<T, function(T, number): boolean, undefined>} params
 * @returns {boolean}
 */
function someIterator(prev, params) {
  var source = this._source1.peek();
  var length = source.length;
  if (length > 0) {
    var i = 0;
    var callback = params._param1;
    for (; i < length; i++) {
      if (callback(source[i], i)) {
        params._state = i;
        return true;
      }
    }
  }
  return false;
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
  /**
   * @package
   * @override
   * @type {Change<T>}
   */
  this._mut = new Change(Mutation.None);
}

extend(ComputeArray, ReactiveIterator, Compute);

/**
 *
 * @param {Change} change
 * @param {number} type
 * @param {number} index
 * @param {number} remove
 * @param {number} insert
 * @param {?=} params
 */
function mutate(change, type, index, remove, insert, params) {
  change.type = type;
  change.index = index;
  change.deletes = remove;
  change.inserts = insert;
  change.params = params;
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
   * @override
   * @type {Change<T>}
   */
  this._mut = new Change(Mutation.None);
  /**
   * @package
   * @type {Change<T>}
   */
  this._next = new Change(Mutation.None);
}

extend(DataArray, ReactiveIterator, Data);

/**
 * @public
 * @param {ReadonlyArray<T>} val
 * @returns {void}
 */
DataArray.prototype.update = function (val) {
  this._mutate(Mutation.Assign | Mutation.Reorder, 0, 0, 0, val);
};

/**
 * @package
 * @param {number} type
 * @param {number} index
 * @param {number} remove
 * @param {number} insert
 * @param {?=} params
 * @returns {void}
 */
DataArray.prototype._mutate = function (type, index, remove, insert, params) {
  var state = this._state;
  if (
    !(state & (State.ScheduledDispose | State.WillDispose | State.Disposed))
  ) {
    var next = this._next;
    if (CONTEXT._idle) {
      mutate(next, type, index, remove, insert, params);
      this._apply();
      if (state & (State.SendOne | State.SendMany)) {
        reset();
        sendWillUpdate(this);
        exec();
      }
    } else {
      if (next.type !== Mutation.None) {
        throw new Error("Conflict");
      }
      mutate(next, type, index, remove, insert, params);
      this._state |= State.WillUpdate;
      CHANGES._add(this);
    }
  }
};

/**
 * @package
 * @returns {void}
 */
DataArray.prototype._apply = function () {
  /** @type {number} */
  var i;
  /** @type {number} */
  var len;
  /** @type {Array<T>} */
  var items;
  /** @type {Change} */
  var mut = this._mut;
  /** @type {Change} */
  var next = this._next;
  var value = /** @type {Array<T>} */ (this._value);
  switch (next.type & Mutation.TypeMask) {
    case Mutation.Pop:
      value.pop();
      break;
    case Mutation.Push:
      if (next.inserts === 1) {
        value.push(next.params);
      } else {
        Array.prototype.push.apply(value, next.params);
      }
      break;
    case Mutation.Reverse:
      value.reverse();
      break;
    case Mutation.Shift:
      value.shift();
      break;
    case Mutation.Sort:
      value.sort(next.params);
      break;
    case Mutation.Splice:
      len = next.inserts;
      if (len === 0) {
        value.splice(next.index, next.deletes);
      } else if (len === 1) {
        value.splice(next.index, next.deletes, next.params);
      } else {
        var args = [next.index, next.deletes];
        items = /** @type {Array<T>} */ (next.params);
        for (i = 0; i < len; i++) {
          args[i + 2] = items[i];
        }
        Array.prototype.splice.apply(value, args);
      }
      break;
    case Mutation.Unshift:
      if (next.inserts === 1) {
        value.unshift(next.params);
      } else {
        Array.prototype.unshift.apply(value, next.params);
      }
      break;
    case Mutation.Assign:
      this._value = next.params;
      break;
    case Mutation.Custom:
      this._value = /** @type {function(Array<T>, Change): Array<T>} */ (
        next.params
      )(value, next);
      break;
  }
  mut.type = Mutation.None;
  mut.params = null;
  this._mut = next;
  this._next = mut;
};

/**
 * @package
 * @override
 * @returns {void}
 */
DataArray.prototype._update = function () {
  this._apply();
  this._state &= ~State.WillUpdate;
  sendWillUpdate(this);
};

/**
 * @public
 * @param {function(Array<T>, Change): Array<T>} callbackFn
 * @returns {void}
 */
DataArray.prototype.modify = function (callbackFn) {
  this._mutate(Mutation.Custom | Mutation.Reorder, -1, -1, -1, callbackFn);
};

/**
 * @public
 * @returns {void}
 */
DataArray.prototype.pop = function () {
  this._mutate(Mutation.Pop | Mutation.Remove, this._value.length - 1, 1, 0);
};

/**
 * @public
 * @param {...T} elementN
 * @returns {void}
 */
DataArray.prototype.push = function (elementN) {
  /** @type {T | Array<T>} */
  var params;
  /** @type {number} */
  var len = arguments.length;
  if (len > 0) {
    if (len === 1) {
      params = elementN;
    } else {
      params = new Array(len);
      for (var i = 0; i < len; i++) {
        params[i] = arguments[i];
      }
    }
    this._mutate(
      Mutation.Push | Mutation.Insert,
      this._value.length - 1,
      0,
      len,
      params
    );
  }
};

/**
 * @public
 * @returns {void}
 */
DataArray.prototype.reverse = function () {
  this._mutate(Mutation.Reverse | Mutation.Reorder, -1, 0, 0);
};

/**
 * @public
 * @returns {void}
 */
DataArray.prototype.shift = function () {
  this._mutate(Mutation.Shift | Mutation.Remove, 0, 1, 0);
};

/**
 * @public
 * @param {function(T,T): number=} compareFn
 * @returns {void}
 */
DataArray.prototype.sort = function (compareFn) {
  this._mutate(Mutation.Sort | Mutation.Reorder, -1, 0, 0, compareFn);
};

/**
 * @public
 * @param {number} start
 * @param {number=} deleteCount
 * @param {...T} items
 * @returns {void}
 */
DataArray.prototype.splice = function (start, deleteCount, items) {
  /** @type {T | Array<T>} */
  var params;
  var len = arguments.length;
  if (len > 1) {
    var mutation = Mutation.Splice;
    if (deleteCount == null) {
      deleteCount = 0;
    }
    if (deleteCount > 0) {
      mutation |= Mutation.Remove;
    }
    if (len > 2) {
      mutation |= Mutation.Insert;
      if (len === 3) {
        params = items;
      } else {
        params = new Array(len - 2);
        for (var j = 0, i = 2; i < len; i++, j++) {
          params[j] = arguments[i];
        }
      }
    }
    this._mutate(mutation, start, deleteCount, len - 2, params);
  }
};

/**
 * @public
 * @param {...T} elementN
 * @returns {void}
 */
DataArray.prototype.unshift = function (elementN) {
  /** @type {T | Array<T>} */
  var args;
  /** @type {number} */
  var len = arguments.length;
  if (len > 0) {
    if (len === 1) {
      args = elementN;
    } else {
      args = new Array(len);
      for (var i = 0; i < len; i++) {
        args[i] = arguments[i];
      }
    }
    this._mutate(Mutation.Unshift | Mutation.Insert, 0, 0, len, args);
  }
};

/**
 * @template T
 * @param {Array<T>=} val
 * @returns {SignalArray<T>}
 */
function array(val) {
  return new DataArray(val);
}

window["anod"]["array"] = array;
window["anod"]["DataArray"] = DataArray;

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
