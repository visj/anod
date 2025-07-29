import {
  Scope,
  Send,
  SendOne,
  Receive,
  ReceiveOne,
  Respond,
  TIME,
  CONTEXT,
  CHANGES,
  State,
  Root,
  Data,
  dispose,
  extend,
  inherit,
  reset,
  exec,
  sendWillUpdate,
  IData,
  ICompute,
  Compute,
  IEffect,
  Effect,
  disposeScope,
  disposeSender,
  IReactive,
  Reactive,
  connect,
  Cleanup,
} from "./core.js";

/**
 * @enum {number}
 */
var ArgType = {
  Void: 0,
  NotReactive: 1,
  Reactive: 2,
  Callback: 3,
  Variadic: 4,
};

/**
 * 
 * @param {*} arg 
 * @returns {ArgType}
 */
function argType(arg) {
  switch (typeof arg) {
    case "function":
      return ArgType.Callback;
    case "object":
      if (arg !== null && arg instanceof Reactive) {
        return ArgType.Reactive;
      }
  }
  return ArgType.NotReactive;
}

/**
 * @template T
 * @param {T | Signal<T> | (function(): T)} val 
 * @param {ArgType} type 
 * @returns {T}
 */
function argValue(val, type) {
  switch (type) {
    case ArgType.Reactive:
      return /** @type {Reactive<T>} */(val).val();
    case ArgType.Callback:
      return /** @type {function(): T} */(val)();
  }
  return /** @type {T} */(val);
}

/**
 * @final
 * @struct
 * @template T, U
 * @constructor
 * @param {T | ReadonlySignal<T> | (function(): T)=} arg1
 * @param {ArgType=} type1
 * @param {U | ReadonlySignal<U> | (function(): U)=} arg2
 * @param {ArgType=} type2
 */
function Arguments(arg1, type1, arg2, type2) {
  /**
   * @package
   * @type {T}
   */
  this._arg1 = arg1;
  /**
   * @package
   * @type {ArgType}
   */
  this._type1 = type1 != null ? type1 : ArgType.NotReactive;
  /**
   * @package
   * @type {U}
   */
  this._arg2 = arg2;
  /**
   * @package
   * @type {ArgType}
   */
  this._type2 = type2 != null ? type2 : ArgType.NotReactive;
}

/**
 * @package
 * @returns {T}
 */
Arguments.prototype.arg1 = function () {
  return argValue(this._arg1, this._type1);
};

/**
 * @package
 * @returns {U}
 */
Arguments.prototype.arg2 = function () {
  return argValue(this._arg2, this._type2);
};

/**
 * @const
 * @enum {number}
 */
var Mut = {
  Mask: 15,
  Reset: 16,
  InsertOne: 32,
  RemoveOne: 64,
  InsertMany: 128,
  RemoveMany: 256,
  Insert: 32 | 128,
  Remove: 64 | 256,
  InsertOrRemove: 32 | 64 | 128 | 256,
  HeadOnly: 512,
  TailOnly: 1024,
  Reorder: 2048,
};

/**
 * @const
 * @enum {number}
 */
var Mutation = {
  None: 0 | Mut.Reset,
  Set: 1 | Mut.Reset,
  Modify: 2 | Mut.Reset,
  Pop: 3 | Mut.RemoveOne | Mut.TailOnly,
  PushOne: 4 | Mut.InsertOne | Mut.TailOnly,
  PushMany: 5 | Mut.InsertMany | Mut.TailOnly,
  Reverse: 6 | Mut.Reorder,
  Shift: 7 | Mut.InsertOne | Mut.HeadOnly,
  Sort: 8 | Mut.Reorder,
  Splice: 9,
  UnshiftOne: 10 | Mut.InsertOne | Mut.HeadOnly,
  UnshiftMany: 11 | Mut.InsertOne | Mut.HeadOnly,
  Extension: 12 | Mut.Reset,
};

/**
 * @interface
 * @template T
 * @extends {Send<T>}
 * @extends {IReactive<ReadonlyArray<T>>}
 * @extends {SignalIterator<T>}
 */
function IReactiveIterator() { }

/**
 * @struct
 * @abstract
 * @template T
 * @constructor
 * @extends {Reactive<ReadonlyArray<T>>}
 * @implements {IReactiveIterator<T>}
 */
function ReactiveIterator() { }

extend(ReactiveIterator, Reactive);

/**
 * @package
 * @type {Array<number>}
 */
ReactiveIterator.prototype._mutation;

/**
 * @public
 * @returns {number}
 */
ReactiveIterator.prototype.length = function () {
  return this.val().length;
};

/**
 * @template T
 * @param {ReadonlyArray<T>} source
 * @param {T | undefined} value
 * @param {Arguments<number, undefined>} args
 * @returns {T | undefined}
 */
function atIterator(source, value, args) {
  var index = args.arg1();
  var length = source.length;
  if (index < 0) {
    index += length;
  }
  return index < length ? source[index] : void 0;
}

/**
 * @param {number | ReadonlySignal<number> | (function(): number)} index
 * @returns {ReadonlySignal<T | undefined>}
 */
ReactiveIterator.prototype.at = function (index) {
  return new ComputeReduce(
    this,
    atIterator,
    /** @type {number} */(index),
    argType(index)
  );
};

/**
 * @template T
 * @param {ReadonlyArray<T>} source
 * @param {Array<T>} value
 * @param {Arguments<T | Array<T>, undefined>} args
 * @returns {Array<T>}
 */
function copyIterator(source, value, args) {
  return source.slice();
}

/**
 * @template T
 * @param {ReadonlyArray<T>} source
 * @param {Array<T>} value
 * @param {Arguments<T | Array<T>, undefined>} args
 * @returns {Array<T>}
 */
function concatIterator(source, value, args) {
  return source.concat(args.arg1());
}

/**
 * @template T
 * @param {ReadonlyArray<T>} source
 * @param {Array<T>} value
 * @param {Arguments<T | Array<T>, undefined>} args
 * @returns {Array<T>}
 */
function concatVariadicIterator(source, value, args) {
  /**
   * @type {Array<T | Array<T> | Signal<T> | Array<Signal<T>>>}
   */
  var params = args.arg1();
  /**
   * @const
   * @type {number}
   */
  var len = params.length;
  /**
   * @type {Array<T | Array<T>>}
   */
  var slice = new Array(len);
  for (var i = 0; i < len; i++) {
    var param = params[i];
    slice[i] = argValue(param, argType(param));
  }
  return Array.prototype.concat.apply(source, slice);
}

/**
 * @public
 * @param {...(T | Array<T> | ReadonlySignal<T> | ReadonlySignal<Array<T>>)} items
 * @returns {SignalIterator<T>}
 */
ReactiveIterator.prototype.concat = function (items) {
  /** @type {ComputeArray<T>} */
  var iterator;
  var length = arguments.length;
  if (length === 0) {
    iterator = new ComputeArray(this, copyIterator);
  } else {
    /**
     * @type {Array<T | Array<T> | ReadonlySignal<T> | ReadonlySignal<Signal<T>>>}
     */
    var args;
    /** @type {ArgType} */
    var type;
    /**
     * @type {function(ReadonlyArray<T>, Array<T>, Arguments<T | Array<T>, undefined>): Array<T>}
     */
    var iteratorFn;
    if (length === 1) {
      args = items;
      type = argType(items);
      iteratorFn = concatIterator;
    } else {
      args = new Array(length);
      for (var i = 0; i < length; i++) {
        args[i] = arguments[i];
      }
      type = ArgType.NotReactive;
      iteratorFn = concatVariadicIterator;
    }
    iterator = new ComputeArray(
      this,
      iteratorFn,
      args,
      type
    );
  }
  return iterator;
};

/**
 * @template T
 * @param {ReadonlyArray<T>} source 
 * @param {boolean} value 
 * @param {Arguments<(function(T, number): boolean), number>} args 
 * @param {number} length
 * @param {number} mut
 * @param {number} index
 * @param {number} inserts
 * @param {number} removes
 * @returns {boolean}
 */
function everyIterator(source, value, args, length, mut, index, inserts, removes) {
  if (length === 0) {
    return true;
  }
  var i = 0;
  if (!(mut & Mut.Reset)) {
    if (value) {
      if (!(mut & Mut.Insert)) {
        if (mut & Mut.Reorder) {
          args._arg2 = -1;
        }
        return value;
      }
      i = index;
      length = index + inserts;
    } else {
      i = args._arg2;
      if (!(mut & Mut.Remove) || (i >= 0 && index > i)) {
        if (mut & Mut.Reorder) {
          args._arg2 = -1;
        }
        return value;
      }
      i = index > 0 ? index : 0;
    }
  }
  var callbackFn = args._arg1;
  for (; i < length; i++) {
    if (!callbackFn(source[i], i)) {
      args._arg2 = i;
      return false;
    }
  }
  args._arg2 = -1;
  return true;
}

/**
 * @public
 * @param {function(T, number): boolean} callbackFn
 * @returns {ReadonlySignal<boolean>}
 */
ReactiveIterator.prototype.every = function (callbackFn) {
  return new ComputeReduce(
    this,
    everyIterator,
    callbackFn
  );
};

/**
 * @template T
 * @param {ReadonlyArray<T>} source
 * @param {Array<T>} value
 * @param {Arguments<(function(T, number): boolean), undefined>} args
 * @returns {Array<T>}
 */
function filterIterator(source, value, args) {
  var callbackFn = args.arg1();
  return source.filter(callbackFn);
}

/**
 * @public
 * @param {function(T, number): boolean} callbackFn
 * @returns {SignalIterator<T>}
 */
ReactiveIterator.prototype.filter = function (callbackFn) {
  return new ComputeArray(
    this,
    filterIterator,
    callbackFn
  );
};

/**
 * @template T
 * @param {ReadonlyArray<T>} source
 * @param {T | undefined} value
 * @param {Arguments<(function(T, number): boolean), undefined>} args
 * @returns {T | undefined}
 */
function findIterator(source, value, args) {
  var callbackFn = args._arg1;
  return source.find(callbackFn);
}

/**
 * @public
 * @param {function(T, number): boolean} callbackFn
 * @returns {ReadonlySignal<T | undefined>}
 */
ReactiveIterator.prototype.find = function (callbackFn) {
  return new ComputeReduce(
    this,
    findIterator,
    callbackFn
  )
};

/**
 * @template T
 * @param {ReadonlyArray<T>} source
 * @param {number} value
 * @param {Arguments<function(T, number): boolean, undefined>} args
 * @returns {number}
 */
function findIndexIterator(source, value, args) {
  var callbackFn = args.arg1();
  return source.findIndex(callbackFn);
}

/**
 * @public
 * @param {function(T, number): boolean} callbackFn
 * @returns {ReadonlySignal<number>}
 */
ReactiveIterator.prototype.findIndex = function (callbackFn) {
  return new ComputeReduce(
    this,
    findIndexIterator,
    callbackFn
  );
};

/**
 * @template T
 * @param {ReadonlyArray<T>} source
 * @param {T | undefined} value
 * @param {Arguments<(function(T, number): boolean), undefined>} args
 * @returns {T | undefined}
 */
function findLastIterator(source, value, args) {
  var callbackFn = args.arg1();
  return source.findLast(callbackFn);
}

/**
 * @public
 * @param {function(T, number): boolean} callbackFn
 * @returns {ReadonlySignal<T | undefined>}
 */
ReactiveIterator.prototype.findLast = function (callbackFn) {
  return new ComputeReduce(
    this,
    findLastIterator,
    callbackFn
  );
};

/**
 * @template T
 * @param {ReadonlyArray<T>} source
 * @param {number} value
 * @param {Arguments<(function(T, number): boolean), undefined>} args
 * @returns {number}
 */
function findLastIndexIterator(source, value, args) {
  var callbackFn = args.arg1();
  return source.findLastIndex(callbackFn);
}

/**
 * @param {function(T, number): boolean} callbackFn
 * @returns {ReadonlySignal<number>}
 */
ReactiveIterator.prototype.findLastIndex = function (callbackFn) {
  return new ComputeReduce(
    this,
    findLastIndexIterator,
    callbackFn
  )
};

/**
 * @template T
 * @param {ReadonlyArray<T>} source
 * @param {undefined} value
 * @param {Arguments<(function(T, number): void), undefined>} args
 * @returns {void}
 */
function forEachIterator(source, value, args) {
  var length = source.length;
  var callbackFn = args._arg1;
  for (var i = 0; i < length; i++) {
    callbackFn(source[i], i);
  }
}

/**
 * @param {function(T, number): void} callbackFn
 * @returns {DisposableSignal<void>}
 */
ReactiveIterator.prototype.forEach = function (callbackFn) {
  return new EffectReduce(
    this,
    forEachIterator,
    callbackFn
  );
};

/**
 * @template T
 * @param {ReadonlyArray<T>} source
 * @param {boolean} prev
 * @param {Arguments<T, number>} args
 * @returns {boolean}
 */
function includesIterator(source, prev, args) {
  var searchElement = args.arg1();
  if (args._arg2 === ArgType.Void) {
    return source.includes(searchElement);
  }
  var fromIndex = args.arg2();
  return source.includes(searchElement, fromIndex);
}

/**
 * @param {T | ReadonlySignal<T> | (function(): T)} searchElement
 * @param {number | ReadonlySignal<number> | (function(): number)=} fromIndex
 * @returns {ReadonlySignal<boolean>}
 */
ReactiveIterator.prototype.includes = function (searchElement, fromIndex) {
  return new ComputeReduce(
    this,
    includesIterator,
    /** @type {T} */(searchElement),
    argType(searchElement),
    /** @type {number} */(fromIndex),
    arguments.length < 2 ? ArgType.Void : argType(fromIndex),
  );
};

/**
 * @template T
 * @param {ReadonlyArray<T>} source
 * @param {number} value
 * @param {Arguments<T, number | undefined>} args
 * @returns {number}
 */
function indexOfIterator(source, value, args) {
  var searchElement = args.arg1();
  var fromIndex = args.arg2();
  return source.indexOf(searchElement, fromIndex);
}

/**
 * @param {T | ReadonlySignal<T> | (function(): T)} searchElement
 * @param {number | ReadonlySignal<number> | (function(): number)=} fromIndex
 * @returns {ReadonlySignal<number>}
 */
ReactiveIterator.prototype.indexOf = function (searchElement, fromIndex) {
  return new ComputeReduce(
    this,
    indexOfIterator,
    /** @type {T} */(searchElement),
    argType(searchElement),
    /** @type {number} */(fromIndex),
    argType(fromIndex)
  );
};

/**
 * @template T
 * @param {ReadonlyArray<T>} source
 * @param {string} value
 * @param {Arguments<T, string | undefined>} args
 * @returns {string}
 */
function joinIterator(source, value, args) {
  var separator = args.arg1();
  return source.join(separator);
}

/**
 * @param {string | ReadonlySignal<string> | (function(): string)=} separator
 * @returns {ReadonlySignal<string>}
 */
ReactiveIterator.prototype.join = function (separator) {
  return new ComputeReduce(
    this,
    joinIterator,
    separator,
    argType(separator)
  );
};

/**
 * @template T
 * @param {ReadonlyArray<T>} source
 * @param {number} value
 * @param {Arguments<T, number | undefined>} args
 * @returns {number}
 */
function lastIndexOfIterator(source, value, args) {
  var searchElement = args.arg1();
  var fromIndex = args.arg2();
  return fromIndex == null ? source.lastIndexOf(searchElement) : source.lastIndexOf(searchElement, fromIndex);
}

/**
 * @param {T | ReadonlySignal<T> | (function(): T)} searchElement
 * @param {number | ReadonlySignal<number> | (function(): number)=} fromIndex
 * @returns {ReadonlySignal<number>}
 */
ReactiveIterator.prototype.lastIndexOf = function (searchElement, fromIndex) {
  return new ComputeReduce(
    this,
    lastIndexOfIterator,
    searchElement,
    argType(searchElement),
    /** @type {number} */(fromIndex),
    argType(fromIndex)
  );
};

/**
 * @template T, U
 * @param {ReadonlyArray<T>} source
 * @param {Array<U>} values
 * @param {Arguments<(function(T, number): U), Array<T>>} args
 * @returns {Array<U>}
 */
function mapIterator(source, values, args) {
  /** @type {number} */
  var i;
  /** @type {T} */
  var val;
  var slen = source.length;
  var vlen = values.length;
  var cache = args._arg2;
  var callbackFn = args._arg1;
  if (vlen === 0) {
    if (slen > 0) {
      for (i = 0; i < slen; i++) {
        val = source[i];
        cache[i] = val;
        values[i] = callbackFn(val, i);
      }
    }
  } else if (slen === 0) {
    if (vlen > 0) {
      cache.length = 0;
      values.length = 0;
    }
  } else {
    var minlen = slen < vlen ? slen : vlen;
    for (i = 0; i < minlen; i++) {
      val = source[i];
      if (val !== cache[i]) {
        cache[i] = val;
        values[i] = callbackFn(val, i);
      }
    }
    if (slen > vlen) {
      for (; i < slen; i++) {
        val = source[i];
        cache[i] = val;
        values[i] = callbackFn(val, i);
      }
    } else if (vlen > slen) {
      cache.length = slen;
      values.length = slen;
    }
  }
  return values;
}

/**
 * @template U
 * @param {function(T, number): U} callbackFn
 * @returns {SignalIterator<U>}
 */
ReactiveIterator.prototype.map = function (callbackFn) {
  return new ComputeArray(
    this,
    mapIterator,
    callbackFn,
    ArgType.NotReactive,
    []
  );
};

/**
 * @template T, U, V
 * @param {ReadonlyArray<T>} source
 * @param {V} prev
 * @param {Arguments<(function((T | U), T, number): V), U | undefined>} args
 * @param {number} length
 * @returns {V}
 */
function reduceIterator(source, prev, args, length) {
  var i = 0;
  var initialValue;
  if (args._type2 === ArgType.Void) {
    if (length === 0) {
      return;
    }
    initialValue = source[i++];
  } else {
    initialValue = args.arg2();
  }
  var callbackFn = args._arg1;
  for (; i < length; i++) {
    initialValue = callbackFn(initialValue, source[i], i);
  }
  return initialValue;
}

/**
 * @template U, V
 * @param {function((T | U), T, number): V} callbackFn
 * @param {U | ReadonlySignal<U> | (function(): U)=} initialValue
 * @returns {ReadonlySignal<V>}
 */
ReactiveIterator.prototype.reduce = function (callbackFn, initialValue) {
  return new ComputeReduce(
    this,
    reduceIterator,
    callbackFn,
    ArgType.NotReactive,
    initialValue,
    arguments.length < 2 ? ArgType.Void : argType(initialValue)
  );
};

/**
 * @template T, U
 * @param {ReadonlyArray<T>} source
 * @param {U} prev
 * @param {Arguments<(function((T | U), T, number): U), U | undefined>} args
 * @returns {U}
 */
function reduceRightIterator(source, prev, args) {
  var callbackFn = args.arg1();
  if (args._type2 === ArgType.Void) {
    return source.reduceRight(callbackFn);
  }
  var initialValue = args.arg2();
  return source.reduceRight(callbackFn, initialValue);
}

/**
 * @template U
 * @param {function((T | U), T, number): U} callbackFn
 * @param {U | ReadonlySignal<U> | (function(): U)=} initialValue
 * @returns {ReadonlySignal<U>}
 */
ReactiveIterator.prototype.reduceRight = function (callbackFn, initialValue) {
  return new ComputeReduce(
    this,
    reduceRightIterator,
    callbackFn,
    ArgType.NotReactive,
    initialValue,
    arguments.length < 2 ? ArgType.Void : argType(initialValue)
  );
};

/**
 * @template T
 * @param {ReadonlyArray<T>} source
 * @param {Array<T>} value
 * @param {Arguments<number, number>} args
 * @returns {Array<T>}
 */
function sliceIterator(source, value, args) {
  var start = args.arg1();
  var end = args.arg2();
  return source.slice(start, end);
}

/**
 * @param {number | ReadonlySignal<number> | (function(): number)=} start
 * @param {number | ReadonlySignal<number> | (function(): number)=} end
 * @returns {SignalIterator<T>}
 */
ReactiveIterator.prototype.slice = function (start, end) {
  return new ComputeArray(
    this,
    sliceIterator,
    /** @type {number} */(start),
    argType(start),
    /** @type {number} */(end),
    argType(end)
  );
};

/**
 * @template T
 * @param {ReadonlyArray<T>} source
 * @param {boolean} value
 * @param {Arguments<function(T, number): boolean, number>} args
 * @param {number} length
 * @param {number} mut
 * @param {number} index
 * @param {number} inserts
 * @param {number} removes
 * @returns {boolean}
 */
function someIterator(source, value, args, length, mut, index, inserts, removes) {
  var i = 0;
  if (!(mut & Mut.Reset)) {
    if (value) {
      if (!(mut & Mut.Remove)) {
        if (mut & Mut.Reorder) {
          args._arg2 = -1;
        }
        return value;
      }
    }
  }
  var callbackFn = args.arg1();
  for (; i < length; i++) {
    if (callbackFn(source[i], i)) {
      args._arg2 = i;
      return true;
    }
  }
  return false;
}

/**
 * @param {function(T, number): boolean} callbackFn
 * @returns {ReadonlySignal<boolean>}
 */
ReactiveIterator.prototype.some = function (callbackFn) {
  return new ComputeReduce(
    this,
    someIterator,
    callbackFn,
    ArgType.Void,
    -1
  );
};

/**
 * @template T
 * @param {ICompute<T> | IEffect} node
 * @returns {T}
 */
function next(node) {
  var source = /** @type {ReactiveIterator<T>} */ (node._source1);
  var array = source.peek();
  var length = array.length;
  /** @type {number} */
  var mut;
  /** @type {number} */
  var index;
  /** @type {number} */
  var inserts;
  /** @type {number} */
  var removes;
  var mutation = source._mutation;
  if ((node._state & State.Initial) || mutation == null) {
    mut = Mutation.None;
    index = inserts = removes = -1;
  } else {
    mut = mutation[MutPos.Mutation];
    index = mutation[MutPos.Index];
    inserts = mutation[MutPos.Inserts];
    removes = mutation[MutPos.Removes];
  }
  return node._next(array, node._value, node._args, length, mut, index, inserts, removes);
}

/**
 * @interface
 * @template T
 * @extends {ICompute<T>}
 */
function IComputeReduce() { }

/**
 * @struct
 * @template T, U, V, W
 * @constructor
 * @param {ReactiveIterator<T>} source
 * @param {function(Array<T>, U, Arguments<V, W>, number, number, number, number, number): U} fn
 * @param {V | Signal<V> | (function(): V)=} arg1
 * @param {ArgType=} type1
 * @param {W | Signal<W> | (function(): W)=} arg2
 * @param {ArgType=} type2
 * @extends {Compute<U>}
 * @implements {IComputeReduce<U>}
 */
function ComputeReduce(source, fn, arg1, type1, arg2, type2) {
  Compute.call(this, fn, void 0, State.Stable);
  /**
   * @package
   * @type {Arguments<V, W>}
   */
  this._args = new Arguments(arg1, type1, arg2, type2);
  connect(source, this);
}

extend(ComputeReduce, Compute);

/**
 * @package
 * @override
 * @returns {void}
 */
ComputeReduce.prototype._apply = function() {
  var prev = this._value;
  this._value = next(this);
  if (this._value !== prev) {
    this._state |= State.Changed;
  }
};

/**
 * @interface
 * @template T
 * @extends {IEffect}
 */
function IEffectReduce() { }

/**
 * @struct
 * @template T, V, W
 * @constructor
 * @param {ReactiveIterator<T>} source
 * @param {function(Array<T>, undefined, Arguments<V, W>, number, number, number, number, number): void} fn
 * @param {V | Signal<V> | (function(): V)=} arg1
 * @param {ArgType=} type1
 * @param {W | Signal<W> | (function(): W)=} arg2
 * @param {ArgType=} type2
 * @extends {Effect}
 * @implements {IEffectReduce}
 */
function EffectReduce(source, fn, arg1, type1, arg2, type2) {
  Effect.call(this, fn, void 0, State.Stable);
  /**
   * @package
   * @type {undefined}
   */
  this._value = void 0;
  /**
   * @package
   * @type {Arguments<V, W>}
   */
  this._args = new Arguments(arg1, type1, arg2, type2);
  connect(source, this);
  this._update(TIME);
}

extend(EffectReduce, Effect);

/**
 * @package
 * @override
 * @returns {void}
 */
EffectReduce.prototype._apply = function () {
  next(this); 
};

/**
 * This only exists because Closure Compiler
 * cannot handle multiple prototype inheritance
 * @struct
 * @abstract
 * @template T, V, W
 * @constructor
 * @extends {ReactiveIterator<T>}
 * @implements {IReactiveIterator<T>}
 */
function ComputeArrayStub() { }

/**
 * @package
 * @type {Receive | null}
 */
ComputeArrayStub.prototype._node1;

/**
 * @package
 * @type {number}
 */
ComputeArrayStub.prototype._node1slot;

/**
 * @package
 * @type {Array<Receive> | null}
 */
ComputeArrayStub.prototype._nodes;

/**
 * @package
 * @type {Array<number> | null}
 */
ComputeArrayStub.prototype._nodeslots;

/**
 * @package
 * @type {(function(...?): T) | null}
 */
ComputeArrayStub.prototype._next;

/**
 * @package
 * @type {Receive | null}
 */
ComputeArrayStub.prototype._owner;

/**
 * @package
 * @type {number}
 */
ComputeArrayStub.prototype._time;

/**
 * @package
 * @type {number}
 */
ComputeArrayStub.prototype._utime;

/**
 * @package
 * @type {number}
 */
ComputeArrayStub.prototype._dtime;

/**
 * @package
 * @type {Send | null}
 */
ComputeArrayStub.prototype._source1;

/**
 * @package
 * @type {number}
 */
ComputeArrayStub.prototype._source1slot;

/**
 * @package
 * @type {Array<Send> | null | undefined}
 */
ComputeArrayStub.prototype._sources;

/**
 * @package
 * @type {Array<number> | null | undefined}
 */
ComputeArrayStub.prototype._sourceslots;

/**
 * @package 
 * @type {Arguments<V, W>}
 */
ComputeArrayStub.prototype._args;

/**
 * @package
 * @returns {void}
 */
ComputeArrayStub.prototype._dispose = function () { };

/**
 * @package
 * @returns {void}
 */
ComputeArrayStub.prototype._apply = function () { };

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
ComputeArrayStub.prototype._update = function (time) { };

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
ComputeArrayStub.prototype._receiveMayDispose = function (time) { };

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
ComputeArrayStub.prototype._receiveWillDispose = function (time) { };

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
ComputeArrayStub.prototype._receiveMayUpdate = function (time) { };

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
ComputeArrayStub.prototype._receiveWillUpdate = function (time) { };

/**
 * @interface
 * @template T
 * @extends {IReactiveIterator<T>}
 * @extends {ICompute<ReadonlyArray<T>>}
 */
function IComputeArray() { }

/**
 * @struct
 * @template T, U, V, W
 * @constructor
 * @param {ReactiveIterator<T>} source
 * @param {function(ReadonlyArray<T>, Array<U>, Arguments<V, W>, number, number, number, number, number): Array<U>} fn
 * @param {V | ReadonlySignal<V> | (function(): V)=} arg1
 * @param {ArgType=} type1
 * @param {W | ReadonlySignal<W> | (function(): W)=} arg2
 * @param {ArgType=} type2
 * @extends {ComputeArrayStub<U, V, W>}
 * @implements {IComputeArray<U>}
 */
function ComputeArray(source, fn, arg1, type1, arg2, type2) {
  ComputeReduce.call(/** @type {?} */(this), source, fn, arg1, type1, arg2, type2);
  this._value = [];
}

extend(ComputeArray, ReactiveIterator);
inherit(ComputeArray, ComputeReduce);

/**
 * @package
 * @override
 * @returns {void}
 */
ComputeArray.prototype._apply = function() {
  this._state |= State.Changed;
  this._value = next(this);
};

/**
 * @const
 * @enum {number}
 */
var MutPos = {
  Mutation: 0,
  Index: 1,
  Inserts: 2,
  Removes: 3,
  NextMutation: 4,
  NextIndex: 5,
  NextInserts: 6,
  NextRemoves: 7
};

/**
 * @interface
 * @template T
 * @extends {IData<ReadonlyArray<T>>}
 * @extends {IReactiveIterator<T>}
 */
function IDataArrayStub() { }

/**
 * @struct
 * @abstract
 * @constructor
 * @template T
 * @extends {ReactiveIterator<T>}
 * @implements {IDataArrayStub<T>}
 */
function DataArrayStub() { }

/**
 * @package
 * @returns {void}
 */
DataArrayStub.prototype._dispose = function () { };

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
DataArrayStub.prototype._update = function (time) { };

/**
 * @interface
 * @template T
 * @extends {SignalArray<T>}
 * @extends {IDataArrayStub<T>}
 */
function IDataArray() { }

/**
 * @struct
 * @template T
 * @constructor
 * @param {Array<T>=} val
 * @extends {DataArrayStub<T>}
 * @implements {IDataArray<T>}
 */
function DataArray(val) {
  /**
   * @package
   * @type {number}
   */
  this._state = State.Respond;
  /**
   * @package
   * @type {ReadonlyArray<T>}
   */
  this._value = val || [];
  /**
   * @package
   * @type {T}
   */
  this._next = void 0;
  /**
   * @package
   * @type {Receive | null}
   */
  this._node1 = null;
  /**
   * @package
   * @type {number}
   */
  this._node1slot = -1;
  /**
   * @package
   * @type {Array<Receive> | null}
   */
  this._nodes = null;
  /**
   * @package
   * @type {Array<number> | null}
   */
  this._nodeslots = null;
  /**
   * @package 
   * @type {Array<number>}
   */
  this._mutation = [Mutation.None, -1, -1, -1, Mutation.None, -1, -1, -1];
}

extend(DataArray, ReactiveIterator);
inherit(DataArray, Data);

/**
 * @package
 * @param {number} mut
 * @param {number=} index
 * @param {number=} removes
 * @param {number=} inserts
 * @param {T | Array<T> | (function(T, T): boolean)=} data
 * @returns {void}
 */
DataArray.prototype._mutate = function (mut, index, removes, inserts, data) {
  var mutation = this._mutation;
  if (mutation[MutPos.NextMutation] !== Mutation.None) {
    throw new Error("Conflicting values");
  }
  mutation[MutPos.NextMutation] = mut;
  if (index != null) {
    mutation[MutPos.NextIndex] = index;
  }
  if (inserts != null) {
    mutation[MutPos.NextInserts] = inserts;
  }
  if (removes != null) {
    mutation[MutPos.NextRemoves] = removes;
  }
  if (data != null) {
    this._next = data;
  }
  if (CONTEXT._idle) {
    this._apply();
    if (this._state & State.Send) {
      reset();
      sendWillUpdate(this, TIME + 1);
      exec();
    }
  } else {
    this._state |= State.WillUpdate;
    CHANGES._add(this);
  }
};

/**
 * @package
 * @returns {void}
 */
DataArray.prototype._apply = function () {
  var mutation = this._mutation;
  var args = this._next;
  var value = /** @type {Array<T>} */(this._value);
  var mut = mutation[MutPos.NextMutation];
  switch (mut & Mut.Mask) {
    case Mutation.Set & Mut.Mask:
      this._value = /** @type {ReadonlyArray<T>} */(args);
      break;
    case Mutation.Pop & Mut.Mask:
      value.pop();
      break;
    case Mutation.PushOne & Mut.Mask:
      value.push(/** @type {T} */(args));
      break;
    case Mutation.PushMany & Mut.Mask:
      Array.prototype.push.apply(value, /** @type {Array<T>} */(args));
      break;
    case Mutation.Reverse & Mut.Mask:
      value.reverse();
      break;
    case Mutation.Shift & Mut.Mask:
      value.shift();
      break;
    case Mutation.Sort & Mut.Mask:
      value.sort(/** @type {function(T, T): number} */(args));
      break;
    case Mutation.Splice & Mut.Mask:
      if (mut & Mut.InsertMany) {
        Array.prototype.splice.apply(value, /** @type {Array<number | T>} */(args));
      } else if (mut & Mut.InsertOne) {
        value.splice(mutation[MutPos.NextIndex], mutation[MutPos.NextRemoves], /** @type {T} */(args))
      } else {
        value.splice(mutation[MutPos.NextIndex], mutation[MutPos.NextRemoves]);
      }
      break;
    case Mutation.UnshiftOne & Mut.Mask:
      value.unshift(/** @type {T} */(args));
      break;
    case Mutation.UnshiftMany & Mut.Mask:
      Array.prototype.unshift.apply(value, /** @type {Array<T>} */(args));
      break;
    case Mutation.Modify & Mut.Mask:
      this._value = /** @type {function(Array<T>): Array<T>} */(args)(value);
      break;
  }
  mutation[MutPos.Mutation] = mutation[MutPos.NextMutation];
  mutation[MutPos.Index] = mutation[MutPos.NextIndex];
  mutation[MutPos.Inserts] = mutation[MutPos.NextInserts];
  mutation[MutPos.Removes] = mutation[MutPos.NextRemoves];
  mutation[MutPos.NextMutation] = Mutation.None;
  mutation[MutPos.NextIndex] =
    mutation[MutPos.NextInserts] =
    mutation[MutPos.NextRemoves] = -1;
};

/**
 * @public
 * @param {ReadonlyArray<T>} val
 * @returns {void}
 */
DataArray.prototype.set = function (val) {
  if (!(this._state & (State.QueueDispose | State.Disposed))) {
    this._mutate(Mutation.Set, 0, 0, 0, val);
  }
};

/**
 * @public
 * @param {function(Array<T>): Array<T>} callbackFn
 * @returns {void}
 */
DataArray.prototype.modify = function (callbackFn) {
  if (!(this._state & (State.QueueDispose | State.Disposed))) {
    this._mutate(Mutation.Modify, 0, 0, 0, callbackFn);
  }
};

/**
 * @public
 * @returns {void}
 */
DataArray.prototype.pop = function () {
  if (!(this._state & (State.QueueDispose | State.Disposed))) {
    if (this._value.length > 0) {
      this._mutate(Mutation.Pop, this._value.length - 1, 1, 0);
    }
  }
};

/**
 * @public
 * @param {...T} elementN
 * @returns {void}
 */
DataArray.prototype.push = function (elementN) {
  if (!(this._state & (State.QueueDispose | State.Disposed))) {
    /** @type {number} */
    var len = arguments.length;
    if (len > 0) {
      /**
       * @type {number}
       */
      var mut;
      /** @type {T | Array<T>} */
      var args;
      if (len === 1) {
        args = elementN;
        mut = Mutation.PushOne;
      } else {
        args = new Array(len);
        for (var i = 0; i < len; i++) {
          args[i] = arguments[i];
        }
        mut = Mutation.PushMany;
      }
      this._mutate(mut, this._value.length, 0, len, args);
    }
  }
};

/**
 * @public
 * @returns {void}
 */
DataArray.prototype.reverse = function () {
  if (!(this._state & (State.QueueDispose | State.Disposed))) {
    if (this._value.length > 0) {
      this._mutate(Mutation.Reverse);
    }
  }
};

/**
 * @public
 * @returns {void}
 */
DataArray.prototype.shift = function () {
  if (!(this._state & (State.QueueDispose | State.Disposed))) {
    if (this._value.length > 0) {
      this._mutate(Mutation.Shift, 0, 1, 0);
    }
  }
};

/**
 * @public
 * @param {function(T,T): number=} compareFn
 * @returns {void}
 */
DataArray.prototype.sort = function (compareFn) {
  if (!(this._state & (State.QueueDispose | State.Disposed))) {
    if (this._value.length > 0) {
      this._mutate(Mutation.Sort, void 0, 0, 0, compareFn);
    }
  }
};

/**
 * @public
 * @param {number} start
 * @param {number=} deleteCount
 * @param {...T} items
 * @returns {void}
 */
DataArray.prototype.splice = function (start, deleteCount, items) {
  if (!(this._state & (State.QueueDispose | State.Disposed))) {
    /**
     * @type {T | Array<number | T>} 
     */
    var slice;
    /**
     * @type {number}
     */
    var length = this._value.length;
    /**
     * @const
     * @type {number}
     */
    var args = arguments.length;
    if (args > 0) {
      /**
       * @type {number}
       */
      var mut = Mutation.Splice;
      if (args === 1) {
        deleteCount = length;
      } else if (deleteCount == null || deleteCount < 0) {
        deleteCount = 0;
      }
      if (deleteCount > 0) {
        if (deleteCount > 1) {
          mut |= Mut.RemoveMany;
        } else {
          mut |= Mut.RemoveOne;
        }
      }
      if (args > 2) {
        if (args === 3) {
          slice = items;
          mut |= Mut.InsertOne;
        } else {
          slice = new Array(args);
          for (var i = 0; i < args; i++) {
            slice[i] = arguments[i];
          }
          mut |= Mut.InsertMany;
        }
      }
      if (mut & Mut.InsertOrRemove) {
        this._mutate(mut, start, deleteCount, args - 2, slice);
      }
    }
  }
};

/**
 * @public
 * @param {...T} elementN
 * @returns {void}
 */
DataArray.prototype.unshift = function (elementN) {
  if (!(this._state & (State.QueueDispose | State.Disposed))) {
    /** @type {T | Array<T>} */
    var args;
    /** @type {number} */
    var len = arguments.length;
    if (len > 0) {
      /** 
       * @type {number}
       */
      var mut;
      if (len === 1) {
        args = elementN;
        mut = Mutation.UnshiftOne;
      } else {
        args = new Array(len);
        for (var i = 0; i < len; i++) {
          args[i] = arguments[i];
        }
        mut = Mutation.UnshiftMany;
      }
      this._mutate(mut, 0, 0, len, args);
    }
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
window["anod"]["ComputeReduce"] = ComputeReduce;
window["anod"]["ComputeArray"] = ComputeArray;
window["anod"]["EffectReduce"] = EffectReduce;

export {
  array,
  DataArray,
  ComputeReduce,
  ComputeArray,
  EffectReduce
}