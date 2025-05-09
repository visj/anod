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
    case ArgType.Callback:
      return /** @type {function(): T} */(val)();
    case ArgType.Reactive:
      return /** @type {Reactive<T>} */(val).val();
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
  this._type1 = type1 || ArgType.NotReactive;
  /**
   * @package
   * @type {U}
   */
  this._arg2 = arg2;
  /**
   * @package
   * @type {ArgType}
   */
  this._type2 = type2 || ArgType.NotReactive;
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
  InsertOne: 16,
  RemoveOne: 32,
  InsertMany: 64,
  RemoveMany: 128,
  RemoveOrInsert: 16 | 32 | 64 | 128,
  HeadOnly: 256,
  TailOnly: 512,
  Reorder: 1024,
};

/**
 * @const
 * @enum {number}
 */
var Mutation = {
  None: 0,
  Set: 1,
  Modify: 2,
  Pop: 3 | Mut.RemoveOne | Mut.TailOnly,
  PushOne: 4 | Mut.InsertOne | Mut.TailOnly,
  PushMany: 5 | Mut.InsertMany | Mut.TailOnly,
  Reverse: 6 | Mut.Reorder,
  Shift: 7 | Mut.InsertOne | Mut.HeadOnly,
  Sort: 8 | Mut.Reorder,
  Splice: 9,
  UnshiftOne: 10 | Mut.InsertOne | Mut.HeadOnly,
  UnshiftMany: 11 | Mut.InsertOne | Mut.HeadOnly,
  Fill: 12,
  CopyWithin: 13,
  Extension: 14,
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
  if (args._type1 === ArgType.Variadic) {
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
  return source.concat(args.arg1());
}

/**
 * @public
 * @param {...(T | Array<T> | ReadonlySignal<T> | ReadonlySignal<Array<T>>)} items
 * @returns {SignalIterator<T>}
 */
ReactiveIterator.prototype.concat = function (items) {
  var length = arguments.length;
  if (length === 0) {
    return new ComputeArray(this, copyIterator);
  }
  /**
   * @type {Array<T | Array<T> | ReadonlySignal<T> | ReadonlySignal<Signal<T>>>}
   */
  var args;
  /** @type {ArgType} */
  var type;
  if (length === 1) {
    args = items;
    type = argType(items);
  } else {
    args = new Array(length);
    for (var i = 0; i < length; i++) {
      args[i] = arguments[i];
    }
    type = ArgType.Variadic;
  }
  return new ComputeArray(
    this,
    concatIterator,
    args,
    type
  );
};

/**
 * @template T
 * @param {ReadonlyArray<T>} source 
 * @param {boolean} value 
 * @param {Arguments<function(T, number): boolean, undefined>} args 
 * @returns {boolean}
 */
function everyIterator(source, value, args) {
  var callbackFn = args.arg1();
  return source.every(callbackFn);
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
  var callbackFn = args.arg1();
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
 * @param {void} value
 * @param {Arguments<(function(T, number): void), undefined>} args
 * @returns {void}
 */
function forEachIterator(source, value, args) {
  var callbackFn = args.arg1();
  source.forEach(callbackFn);
}

/**
 * @param {function(T, number): void} callbackFn
 * @returns {ReadonlySignal<void>}
 */
ReactiveIterator.prototype.forEach = function (callbackFn) {
  return new ComputeReduce(
    this,
    forEachIterator,
    callbackFn
  );
};

/**
 * @template T
 * @param {ReadonlyArray<T>} source
 * @param {boolean} prev
 * @param {Arguments<T, undefined>} args
 * @returns {boolean}
 */
function includesIterator(source, prev, args) {
  var searchElement = args.arg1();
  return source.includes(searchElement);
}

/**
 * @param {T | ReadonlySignal<T> | (function(): T)} searchElement
 * @returns {ReadonlySignal<boolean>}
 */
ReactiveIterator.prototype.includes = function (searchElement) {
  return new ComputeReduce(
    this,
    includesIterator,
    searchElement,
    argType(searchElement)
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
    argType(searchElement)
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
  return new ComputeReduce(this, joinIterator, separator, argType(separator));
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
  return source.lastIndexOf(searchElement, fromIndex);
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
  var i;
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

// /**
//  * @template T, U
//  * @param {ComputeMapArray<T, U>} owner
//  * @param {ReadonlyArray<T>} source
//  */
// function mapRootIterator(owner, source) {
//   /** @type {number} */
//   var i;
//   /** @type {number} */
//   var j;
//   /** @type {T} */
//   var val;
//   /** @type {Array<MapRoot<T>>} */
//   var roots = owner._roots;
//   /** @type {Array<T>} */
//   var slice = owner._slice;
//   /** @type {Array<U>} */
//   var values = owner._value;
//   /** @type {Arguments<(function(T, ReadonlySignal<number>): U), boolean>} */
//   var args = owner._args;
//   var oldlen = slice.length;
//   var newlen = source.length;
//   var pure = args._arg2;
//   var callbackFn = args._arg1;
//   if (oldlen === 0) {
//     if (newlen > 0) {
//       for (i = 0; i < newlen; i++) {
//         mapCreate(owner);
//       }
//     }
//   } else if (newlen === 0) {
//     if (oldlen > 0) {
//       values.length = 0;
//       for (i = 0; i < oldlen; i++) {
//       }
//     }
//   } else {
//     var rmin = 0;
//     var rmax = oldlen - 1;
//     var smin = 0;
//     var smax = newlen - 1;
//     /** @type {Array<MapRoot>} */
//     var newRoots = new Array(newlen);
//     /** @type {Array<U>} */
//     var newValues = new Array(newlen);
//     while (
//       rmin <= rmax &&
//       smin <= smax // &&
//       // roots[rmin]._value === source[smin]
//     ) {
//       // Common prefix, just increment forward
//       rmin++;
//       smin++;
//     }
//     while (
//       rmin <= rmax &&
//       smin <= smax // &&
//       // roots[rmax]._value === source[smax]
//     ) {
//       // Common suffix, we don't know if the index
//       // will change until we have diffed the middle part
//       rmax--;
//       smax--;
//     }
//     if (smin > smax) {
//       // We matched all source values
//       if (rmin <= rmax) {
//         // But not all root values,
//         // simple remove cases
//         for (i = rmin; i <= rmax; i++) {
//           // mapDispose(owner, i);
//         }
//         // roots.splice(rmin, rmax - rmin + 1);
//         // values.splice(rmin, rmax - rmin + 1);
//         if (!pure) {
//           for (i = rmin; i < oldlen; i++) {
//             // todo
//           }
//         }
//       }
//     } else if (rmin > rmax) {
//       // We matched all existing
//       if (smin <= smax) {
//         // But not all source values,
//         // simple insert cases
//         newRoots = [rmin, 0];
//         newValues = [rmin, 0];
//         for (i = smin, j = 2; i <= smax; i++, j++) {
//           // mapCreate(owner, newRoots, newValues, j, i, source[i], pure, callbackFn);
//         }
//         // splice.apply(roots, newRoots);
//         // splice.apply(values, newValues);
//       }
//     } else {
//       // Need to reconcile the middle slice
//       var len = smax - smin;
//       /** @type {number} */
//       var offset;
//       var rcount = rmax - rmin + 1;
//       var scount = smax - smin + 1;
//       newRoots = new Array(len);
//       newValues = new Array(len);
//       if (rcount <= 32) {
//         // Use a single 32-bit mask for up to 32 roots
//         var mask = 0;
//         /** @type {number} */
//         var free;
//         /** @type {number} */
//         var lowbit;
//         /** @type {number} */
//         var bitIndex;
//         for (i = smin, j = 0; i <= smax; i++, j++) {
//           offset = -1;
//           val = source[i];
//           // Only consider bits for actual roots (rcount may be < 32)
//           free = ~mask & ((1 << rcount) - 1);
//           while (free !== 0) {
//             lowbit = free & -free;
//             bitIndex = Math.clz32(lowbit) ^ 31;
//             // if (val === roots[rmin + bitIndex]._value) {
//             //   mask |= lowbit;
//             //   offset = bitIndex;
//             //   break;
//             // }
//             free &= free - 1;
//           }
//           if (offset >= 0) {
//             // newRoots[j] = roots[rmin + offset];
//             // newValues[j] = values[rmin + offset];
//           } else {
//             //  mapCreate(owner, newRoots, newValues, j, i, val, pure, callbackFn);
//           }
//         }
//         // Dispose any roots not reused
//         free = ~mask & ((1 << rcount) - 1);
//         while (free !== 0) {
//           let lowbit = free & -free;
//           let bitIndex = Math.clz32(lowbit) ^ 31;
//           // mapDispose(owner, rmin + bitIndex);
//           free &= free - 1;
//         }
//       } else {
//         var indexMap = new Map();
//         var indexNext = new Int32Array(rcount);
//         // link all old roots by value
//         for (i = rmax; i >= rmin; i--) {
//           offset = i - rmin;
//           // val = roots[i]._value;
//           j = indexMap.get(val);
//           indexNext[offset] = j === void 0 ? -1 : j;
//           indexMap.set(val, offset);
//         }
//         // walk through source items
//         for (i = smin, j = 0; i <= smax; i++, j++) {
//           val = source[i]
//           offset = indexMap.get(val);
//           if (offset >= 0) {
//             // reuse first available slot
//             newRoots[j] = roots[rmin + offset];
//             newValues[j] = values[rmin + offset];
//             // unlink this slot: use indexNext both as chain and reuse marker
//             var next = indexNext[offset];
//             if (next === -1) {
//               indexMap.delete(val);
//             } else {
//               indexMap.set(val, next);
//             }
//           } else {
//             // create brand-new
//             // mapDispose(owner, rmin + offset);
//             // mapCreate(owner, newRoots, newValues, j, i, val, pure, callbackFn);
//           }
//         }
//         // dispose any large-case roots never reused
//         for (i = 0; i < rcount; i++) {
//           if (indexNext[i] !== -2) {
//             //  mapDispose(owner, rmin + i);
//           }
//         }
//       }

//       // ── patch back into place ──
//       // overwrite the first min(rcount, scount) slots in-place
//       j = Math.min(rcount, scount);
//       for (i = 0; i < j; i++) {
//         roots[rmin + i] = newRoots[i];
//         values[rmin + i] = newValues[i];
//       }
//       // handle any extra insertions or removals at the tail
//       if (scount > rcount) {
//         splice.apply(roots, [rmin + rcount, 0].concat(newRoots.slice(rcount)));
//         splice.apply(values, [rmin + rcount, 0].concat(newValues.slice(rcount)));
//       } else if (scount < rcount) {
//         roots.splice(rmin + scount, rcount - scount);
//         values.splice(rmin + scount, rcount - scount);
//       }
//     }
//   }
// }

// /**
//  * @template U
//  * @param {function(T, ReadonlySignal<number>): U} callbackFn
//  * @returns {SignalIterator<U>}
//  */
// ReactiveIterator.prototype.mapRoot = function (callbackFn) {
//   return new ComputeMapArray(
//     this,
//     callbackFn,
//     ArgType.NotReactive,
//     callbackFn.length < 2
//   );
// };

/**
 * @template T, U, V
 * @param {ReadonlyArray<T>} source
 * @param {V} prev
 * @param {Arguments<(function((T | U), T, number): V), U | undefined>} args
 * @returns {V}
 */
function reduceIterator(source, prev, args) {
  var callbackFn = args.arg1();
  if (args._type2 === ArgType.Void) {
    return source.reduce(callbackFn);
  }
  var initialValue = args.arg2();
  return source.reduce(callbackFn, initialValue);
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
 * @param {Arguments<function(T, number): boolean, void>} args
 * @returns {boolean}
 */
function someIterator(source, value, args) {
  var callbackFn = args.arg1();
  return source.some(callbackFn);
}

/**
 * @param {function(T, number): boolean} callbackFn
 * @returns {ReadonlySignal<boolean>}
 */
ReactiveIterator.prototype.some = function (callbackFn) {
  return new ComputeReduce(this, someIterator, callbackFn);
};

/**
 * @interface
 * @template T
 * @extends {Receive<T>}
 * @extends {ICompute<T>}
 */
function IComputeReduce() { }

/**
 * @struct
 * @template T, U, V, W
 * @constructor
 * @param {ReactiveIterator<T>} source
 * @param {function(Array<T>, U, Arguments<V, W>): U} fn
 * @param {V | Signal<V> | (function(): V)=} arg1
 * @param {ArgType=} type1
 * @param {W | Signal<W> | (function(): W)=} arg2
 * @param {ArgType=} type2
 * @extends {Compute<U>}
 * @implements {IComputeReduce<U>}
 */
function ComputeReduce(source, fn, arg1, type1, arg2, type2) {
  Compute.call(this, fn);
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
ComputeReduce.prototype._apply = function () {
  var source = /** @type {ReactiveIterator<T>} */ (this._source1);
  this._value = this._next(source.peek(), this._value, this._args);
};

/**
 * This only exists because Closure Compiler
 * cannot handle multiple prototype inheritance
 * @struct
 * @abstract
 * @template T
 * @constructor
 * @extends {ReactiveIterator<T>}
 * @implements {IReactiveIterator<T>}
 */
function ComputeArrayStub() { }

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
 * @param {function(ReadonlyArray<T>, Array<U>, Arguments<V, W>, ...?): Array<U>} fn
 * @param {V | ReadonlySignal<V> | (function(): V)=} arg1
 * @param {ArgType=} type1
 * @param {W | ReadonlySignal<W> | (function(): W)=} arg2
 * @param {ArgType=} type2
 * @extends {ComputeArrayStub<U>}
 * @implements {IComputeArray<U>}
 */
function ComputeArray(source, fn, arg1, type1, arg2, type2) {
  /**
   * @package
   * @type {number}
   */
  this._state = State.Initial | State.WillUpdate | State.Bound;
  /**
   * @package
   * @type {Array<U>}
   */
  this._value = [];
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
   * @type {Receive | null}
   */
  this._owner = null;
  /**
   * @package
   * @type {Send | null}
   */
  this._source1 = null;
  /**
   * @package
   * @type {number}
   */
  this._source1slot = 0;
  /**
   * @package
   * @type {number}
   */
  this._time = 0;
  /**
   * @package
   * @type {number}
   */
  this._utime = 0;
  /**
   * @package
   * @type {number}
   */
  this._dtime = 0;
  /**
   * @package
   * @type {function(ReadonlyArray<T>, Array<U>, Arguments<V, W>, ...?): Array<U>}
   */
  this._next = fn;
  /**
   * @package
   * @type {Arguments<V, W>}
   */
  this._args = new Arguments(arg1, type1, arg2, type2);
  connect(source, this);
  if (CONTEXT._owner !== null) {
    CONTEXT._owner._parent(this);
  }
}

extend(ComputeArray, ReactiveIterator);
inherit(ComputeArray, Compute);

/**
 * @package
 * @override
 * @returns {void}
 */
ComputeArray.prototype._apply = function () {
  var source = /** @type {ReactiveIterator<T>} */ (this._source1);
  this._value = this._next(source.peek(), this._value, this._args);
};

/**
 * @struct
 * @constructor
 * @param {number} val
 * @extends {Compute<number>}
 */
function MapIndex(val) {
  /**
   * @package
   * @type {number}
   */
  this._state = State.Void;
  /**
   * @package
   * @type {T}
   */
  this._value = val;
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
   * @type {number}
   */
  this._time = 0;
}

extend(MapIndex, Compute);

/**
 * @package
 * @override
 * @returns {void}
 */
MapIndex.prototype._dispose = function () {
  var state = this._state;
  if (state !== State.Disposed) {
    if (state & State.Send) {
      disposeSender(this);
    }
    this._value = null;
    this._state = State.Disposed;
  }
};

/**
 * @struct
 * @template T
 * @constructor
 * @extends {Root}
 */
function MapRoot() {
  /**
   * @package
   * @type {number}
   */
  this._state = State.Void;
  /**
   * @package
   * @type {Array<Receive>}
   */
  this._children = null;
  /**
   * @package 
   * @type {Array<Cleanup>}
   */
  this._cleanups = null;
}



/**
 * @interface
 * @template T
 * @extends {IComputeArray<T>}
 */
function IComputeMapArray() { }

/**
 * @struct
 * @template T, U, V, W
 * @constructor
 * @param {ReactiveIterator<T>} source
 * @param {V | ReadonlySignal<V> | (function(): V)=} arg1
 * @param {ArgType=} type1
 * @param {W | ReadonlySignal<W> | (function(): W)=} arg2
 * @param {ArgType=} type2
 * @extends {ComputeArray<U>}
 * @implements {IComputeMapArray<U>}
 */
function ComputeMapArray(source, arg1, type1, arg2, type2) {
  ComputeArray.call(this, source, /** @type {?} */(null), arg1, type1, arg2, type2);
  /**
   * @package
   * @type {number}
   */
  this._slot = -1;
  /**
   * @package
   * @type {Array<T>}
   */
  this._slice = [];
  /**
   * @package
   * @type {Array<MapRoot<T>> | null}
   */
  this._roots = null;
  /**
   * @package
   * @type {Array<MapIndex | null> | null}
   */
  this._indices = null;
}

extend(ComputeMapArray, ComputeArray);

/**
 * @package
 * @param {Receive} child 
 * @returns {void}
 */
ComputeMapArray.prototype._parent = function (child) {
  if (this._slot !== -1) {
    /** @type {MapRoot<T>} */
    var root;
    if (this._roots === null) {
      root = new MapRoot();
      this._roots = []
    }
  }
};

/**
 * @package
 * @param {Cleanup} cleanup 
 * @returns {void}
 */
ComputeMapArray.prototype._cleanup = function (cleanup) { };

// /**
//  * @package
//  * @override
//  * @returns {void}
//  */
// ComputeMapArray.prototype._apply = function () {
//   try {
//     var source = /** @type {ReactiveIterator<T>} */ (this._source1).peek();
//     CONTEXT._owner = this;
//     mapRootIterator(this, source);
//   } finally {
//     CONTEXT._owner = null;
//   }
// };

// /**
//  * @template T, U
//  * @param {ComputeMapArray} owner
//  * @param {Array<MapRoot<T>>} roots
//  * @param {Array<U>} values
//  * @param {number} slot
//  * @param {number} index 
//  * @param {T} val
//  * @param {boolean} pure
//  * @param {(function(T): U) | (function(T, ReadonlySignal<number>): U)} callbackFn 
//  */
// function mapCreate(owner, value, callbackFn, pure) {
//   var root = new MapRoot(val, pure ? null : new MapIndex(index));
//   roots[slot] = root;
//   try {
//     values[slot] = callbackFn(root._value, root._index);
//   } finally {
//   }
// };

// /**
//  * @param {ComputeMapArray} owner
//  * @param {number} index 
//  * @returns {void}
//  */
// function mapDispose(owner, index) {
//   // owner._roots[index] = null;
// };

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
 * @final
 * @struct
 * @template T
 * @constructor
 */
function Change() {
  /**
   * @package
   * @type {number}
   * Mutation flag
   */
  this.m = Mutation.None;
  /**
   * @package 
   * @type {number}
   * Index of mutation
   */
  this.i = -1;
  /**
   * @package
   * @type {number}
   * Number of added items
   */
  this.n = -1;
  /**
   * @package
   * @type {number}
   * Number of removed items
   */
  this.r = -1;
  /**
   * @package
   * @type {T | Array<T> | (function(T, T): number) | (function(Array<T>): Array<T>) | Array<(function(Array<T>): Array<T>)> | null | undefined}
   * Mutation data
   */
  this.d = null;
}

/**
 * @package
 * @param {number} mut 
 * @param {number=} index 
 * @param {number=} deletes
 * @param {number=} inserts
 * @param {T | Array<T> | (function(T, T): number) | (function(Array<T>): Array<T>)=} data
 * @returns {void}
 */
Change.prototype.add = function (mut, index, deletes, inserts, data) {
  if (this.m === Mutation.None) {
    this.m = mut;
    this.d = data;
    this.i = index || -1;
    this.r = deletes || -1;
    this.n = inserts || -1;
  } else {
    throw new Error("Conflicting mutation");
  }
};

/**
 * @package
 * @returns {void}
 */
Change.prototype.reset = function () {
  this.m = Mutation.None;
  this.i =
    this.n =
    this.r = -1;
  this.d = null;
};

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
   * @type {T}
   */
  this._value = val;
  /**
   * @package
   * @type {T | Object}
   */
  this._next = new Change();
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
  this._change = new Change();
}

extend(DataArray, ReactiveIterator);
inherit(DataArray, Data);

/**
 * @package
 * @param {number} mut
 * @param {number=} index
 * @param {number=} deletes
 * @param {number=} inserts
 * @param {T | Array<T> | (function(T, T): boolean)=} data
 * @returns {void}
 */
DataArray.prototype._mutate = function (mut, index, deletes, inserts, data) {
  this._next.add(mut, index, deletes, inserts, data);
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
  var next = this._next;
  var mut = next.m;
  var args = next.d;
  var value = /** @type {Array<T>} */(this._value);
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
        value.splice(next.i, next.r, /** @type {T} */(args))
      } else {
        value.splice(next.i, next.r);
      }
      break;
    case Mutation.UnshiftOne:
      value.unshift(/** @type {T} */(args));
      break;
    case Mutation.UnshiftMany & Mut.Mask:
      Array.prototype.unshift.apply(value, /** @type {Array<T>} */(args));
      break;
    case Mutation.Fill:
      // todo
      break;
    case Mutation.CopyWithin:
      // todo
      break;
    case Mutation.Modify:
      value = /** @type {function(Array<T>): Array<T>} */(args)(value);
      this._value = value;
      break;
  }
  this._change.m = next.m;
  this._change.i = next.i;
  this._change.r = next.r;
  this._change.n = next.n;
  next.reset();
};

/**
 * @public
 * @param {ReadonlyArray<T>} val
 * @returns {void}
 */
DataArray.prototype.set = function (val) {
  if (!(this._state & (State.QueueDispose | State.Disposed))) {
    this._mutate(Mutation.Set, -1, -1, -1, val);
  }
};

/**
 * @public
 * @param {function(Array<T>): Array<T>} callbackFn
 * @returns {void}
 */
DataArray.prototype.modify = function (callbackFn) {
  if (!(this._state & (State.QueueDispose | State.Disposed))) {
    this._mutate(Mutation.Modify, -1, -1, -1, callbackFn);
  }
};

/**
 * @public
 * @returns {void}
 */
DataArray.prototype.pop = function () {
  if (!(this._state & (State.QueueDispose | State.Disposed))) {
    this._mutate(Mutation.Pop, this._value.length - 1, 1, 0);
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
    this._mutate(Mutation.Reverse);
  }
};

/**
 * @public
 * @returns {void}
 */
DataArray.prototype.shift = function () {
  if (!(this._state & (State.QueueDispose | State.Disposed))) {
    this._mutate(Mutation.Shift, 0, 1, 0);
  }
};

/**
 * @public
 * @param {function(T,T): number=} compareFn
 * @returns {void}
 */
DataArray.prototype.sort = function (compareFn) {
  if (!(this._state & (State.QueueDispose | State.Disposed))) {
    this._mutate(Mutation.Sort, void 0, 0, 0, compareFn);
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
    var args;
    /**
     * @const
     * @type {number}
     */
    var len = arguments.length;
    if (len > 1) {
      /**
       * @type {number}
       */
      var mut = Mutation.Splice;
      if (deleteCount == null || deleteCount < 0) {
        deleteCount = 0;
      } else if (deleteCount > 0) {
        if (deleteCount > 1) {
          mut |= Mut.RemoveMany;
        } else {
          mut |= Mut.RemoveOne;
        }
      }
      if (len > 2) {
        if (len === 3) {
          args = items;
          mut |= Mut.InsertOne;
        } else {
          args = new Array(len);
          for (var i = 0; i < len; i++) {
            args[i] = arguments[i];
          }
          mut |= Mut.InsertMany;
        }
      }
      if (mut & Mut.RemoveOrInsert) {
        this._mutate(mut, start, deleteCount, len - 2, args);
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
window["anod"]["ComputeMapArray"] = ComputeMapArray;

export {
  array,
  DataArray,
  ComputeReduce,
  ComputeArray,
  ComputeMapArray
}