import {
  Scope,
  Send,
  SendOne,
  Receive,
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
  COMPUTES,
  sendMayUpdate,
  IReactive,
  Reactive,
  connect,
} from "./core.js";

/**
 * @const
 * @enum {number}
 */
var Mutation = {
  Modify: -1,
  None: 0,
  Insert: 1,
  Remove: 2,
  Reorder: 4,
  TypeMask: 7
};

// /**
//  * @template T
//  * @param {ReactiveIterator<T,?,?>} source
//  * @returns {function(): number}
//  */
// function getLength(source) {
//   return function () {
//     return source.val().length;
//   };
// }

/**
 * @enum {number}
 */
var ArgType = {
  NotReactive: 0,
  Reactive: 1,
  Callback: 2
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
 * @param {T | (function(): T) | Reactive<T>} val 
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
 * @param {T=} arg1
 * @param {ArgType=} type1
 * @param {U=} arg2
 * @param {ArgType=} type2
 */
function Arguments(arg1, type1, arg2, type2) {
  /**
   * @package
   * @type {number}
   */
  this.index = -1;
  /**
   * @package
   * @type {T | undefined}
   */
  this._arg1 = arg1;
  /**
   * @package
   * @type {ArgType}
   */
  this._type1 = type1 || ArgType.NotReactive;
  /**
   * @package
   * @type {U | undefined}
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
 * @returns {T}
 */
Arguments.prototype.arg2 = function () {
  return argValue(this._arg2, this._type2);
};

/**
 * @interface
 * @template T
 * @extends {Send}
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
 * @template T
 * @param {Array<T>} source
 * @param {Arguments<number | Signal<number> | (function(): number), void>} args
 * @param {number} change
 * @returns {T | undefined}
 */
function atIterator(source, args, change) {
  var index = /** @type {number} */(args.arg1()) || 0;
  if (index >= 0 && index < source.length) {
    return source[index];
  }
}

/**
 * @param {number | Signal<number> | (function(): number)} index
 * @param {SignalOptions=} opts
 * @returns {ReadonlySignal<T | undefined>}
 */
ReactiveIterator.prototype.at = function (index, opts) {
  return new ComputeReduce(this, atIterator, opts, index, argType(index));
};

// /**
//  * @template T
//  * @param {Array<T>} prev
//  * @param {IteratorState<T | Array<T> | Signal<T> | Signal<Array<T>>, undefined>} params
//  * @returns {Array<T>}
//  */
// function concatIterator(prev, params) {
//   return this._source1.peek().concat(read(params.arg1()));
// }

/**
 * @public
 * @param {T | Array<T> | Signal<T> | Signal<Array<T>>} items
 * @param {SignalOptions=} opts
 * @returns {SignalIterator<T>}
 */
ReactiveIterator.prototype.concat = function (items, opts) {
  // return new ComputeArray(this, )
};

/**
 * @template T
 * @param {Array<T>} source
 * @param {Arguments<function(T, number): boolean, undefined>} args
 * @param {number} change
 * @returns {boolean}
 */
function everyIterator(source, args, change) {
  // var prev = true;
  // var index = args.index;
  // var length = source.length;
  // args.index = 0;
  // if (length > 0) {
  //   var start = 0;
  //   var last = length - 1;
  //   var callback = args.arg1();
  //   if (args.arg2() && !(this._state & State.Initial)) {
  //     var insert = mut.inserts;
  //     var remove = mut.deletes;
  //     if (insert === 0 && remove === 0) {
  //       // args._state = prev ? last : -1;
  //       return prev;
  //     }
  //     if (!(mut.type & Mutation.Reorder)) {
  //       index = mut.index;
  //       if (prev) {
  //         // All items returned true last time.
  //         if (insert === 0) {
  //           // Every item passed and we didn't add any.
  //           args._state = last;
  //           return prev;
  //         }
  //         if (index !== -1) {
  //           // We only need to check inserted items.
  //           start = index;
  //           last = index + insert - 1;
  //         }
  //       } else {
  //         // Some item returned false last time
  //         if (
  //           remove === 0 ||
  //           (index !== -1 &&
  //             (index > index || (insert === 0 && index + remove < index)))
  //         ) {
  //           // Since it failed for some item last time, and we did
  //           // not remove an item, it will return false this time as well.
  //           // Or, we did not make changes prior to the found falsy item.
  //           // Or, we did not insert any new item and the removals take place before
  //           // the previously found item.
  //           args._state = index < index ? index + (insert - remove) : index;
  //           return prev;
  //         }
  //       }
  //       start = index < 0 ? 0 : index < index ? index : index;
  //     }
  //   }
  //   for (; start <= last; start++) {
  //     if (!callback(array[start], start)) {
  //       args._state = start;
  //       return false;
  //     }
  //   }
  //   args._state = length - 1;
  // }
  return true;
}

/**
 * @public
 * @param {function(T, number): boolean} callbackFn
 * @param {SignalOptions=} opts
 * @returns {ReadonlySignal<boolean>}
 */
ReactiveIterator.prototype.every = function (callbackFn, opts) {
  return new ComputeReduce(this, everyIterator, opts, callbackFn, ArgType.NotReactive);
};

/**
 * @template T
 * @param {Array<T>} source
 * @param {Array<T>} array
 * @param {number} change
 * @param {function(T, number): boolean} args
 * @returns {void}
 */
function filterIterator(source, change, array, args) {
  var length = source.length;
  if (length > 0) {
    for (var i = 0, j = 0; i < length; i++) {
      var item = source[i];
      if (args(item, i)) {
        array[j++] = item;
      }
    }
  }
  if (array.length !== length) {
    array.length = length;
  }
}

/**
 * @public
 * @param {function(T, number): boolean} callbackFn
 * @param {SignalOptions=} opts
 * @returns {SignalIterator<T>}
 */
ReactiveIterator.prototype.filter = function (callbackFn, opts) {
  // return new ComputeArray(this, filterIterator, opts, callbackFn);
};

// /**
//  * @template T
//  * @param {ReadonlyArray<T>} array
//  * @param {number<T>} mut
//  * @param {function(T, number): boolean} callback
//  * @param {number} prev
//  * @param {boolean=} pure
//  * @returns {number}
//  */
// function findByCallback(state, array, mut, callback, prev, pure) {
//   var length = array.length;
//   if (length > 0) {
//     var i = 0;
//     if (pure && !(state & State.Initial)) {
//       var index = mut.index;
//       var inserts = mut.inserts;
//       var deletes = mut.deletes;
//       if (mut.type & Mutation.Reorder) {
//         if (inserts === 0 && deletes === 0 && prev === -1) {
//           return prev;
//         }
//       } else {
//         if (prev !== -1) {
//           // Item matched last time
//           if (index > prev) {
//             // numbers apply beyond last found index
//             return prev;
//           } else if (index + deletes < prev) {
//             if (inserts === 0) {
//               // We didn't insert new items, and we didn't remove the found one
//               return prev - deletes;
//             }
//             // Does any of the inserted items match?
//             if (inserts === 1) {
//               if (callback(array[index], index)) {
//                 return index;
//               }
//             } else {
//               for (length = index + inserts; index < length; index++) {
//                 if (callback(array[index], index)) {
//                   // Item matches and is before previous
//                   return index;
//                 }
//               }
//             }
//             // Return previous index, adjusted for length change
//             return prev + inserts - deletes;
//           } else {
//             // We removed the previously found item
//             i = index;
//           }
//         } else {
//           // Item did not match last time
//           if (inserts === 0) {
//             // And we did not add any new items
//             return prev;
//           }
//           // Does any of the inserted items match?
//           if (inserts === 1) {
//             if (callback(array[index], index)) {
//               return index;
//             }
//           } else {
//             for (length = index + inserts; index < length; index++) {
//               if (callback(array[index], index)) {
//                 return index;
//               }
//             }
//           }
//           return prev;
//         }
//       }
//     }
//     for (; i < length; i++) {
//       if (callback(array[i], i)) {
//         return i;
//       }
//     }
//   }
//   return -1;
// }

// /**
//  * @template T
//  * @this {ReactiveIterator<T, IteratorState<(function(T, number): boolean), boolean>, ?>}
//  * @param {T | undefined} prev
//  * @param {IteratorState<(function(T, number): boolean), boolean>} params
//  * @returns {T | undefined}
//  */
// function findIterator(prev, params) {
//   var source = /** @type {ReactiveIterator<T,?,?>} */ (this._source1);
//   var array = source.peek();
//   var index = (params._state = findByCallback(
//     this._state,
//     array,
//     source._mut,
//     params.arg1(),
//     params._state,
//     params.arg2()
//   ));
//   if (index !== -1) {
//     return array[index];
//   }
// }

/**
 * @public
 * @param {function(T, number): boolean} callbackFn
 * @param {SignalOptions=} opts
 * @returns {ReadonlySignal<T | undefined>}
 */
ReactiveIterator.prototype.find = function (callbackFn, opts) {
  // return iterateCompute(
  //   this,
  //   findIterator,
  //   callbackFn,
  //   Type.None,
  //   opts,
  //   callbackFn.length === 1,
  //   Type.None
  // );
};

// /**
//  * @template T
//  * @this {ReactiveIterator<T, IteratorState<(function(T, number): boolean), boolean>, ?>}
//  * @param {number} prev
//  * @param {IteratorState<function(T, number): boolean, boolean>} params
//  * @returns {number}
//  */
// function findIndexIterator(prev, params) {
//   var source = /** @type {ReactiveIterator<T,?,?>} */ (this._source1);
//   return findByCallback(
//     this._state,
//     source.peek(),
//     source._mut,
//     params.arg1(),
//     prev,
//     params.arg2()
//   );
// }

/**
 * @public
 * @param {function(T, number): boolean} callbackFn
 * @param {SignalOptions=} opts
 * @returns {ReadonlySignal<number>}
 */
ReactiveIterator.prototype.findIndex = function (callbackFn, opts) {
  // return iterateCompute(
  //   this,
  //   findIndexIterator,
  //   callbackFn,
  //   Type.None,
  //   opts,
  //   callbackFn.length === 1,
  //   Type.None
  // );
};

// /**
//  * @template T
//  * @param {ReadonlyArray<T>} array
//  * @param {number<T>} mut
//  * @param {function(T, number): boolean} callback
//  * @param {number} prev
//  * @param {boolean=} pure
//  * @returns {number}
//  */
// function findLastByCallback(state, array, mut, callback, prev, pure) {
//   var length = array.length;
//   if (length > 0) {
//     var i = length - 1;
//     if (pure && !(state & State.Initial)) {
//       var index = mut.index;
//       var inserts = mut.inserts;
//       var deletes = mut.deletes;
//       if (mut.type & Mutation.Reorder) {
//         if (inserts === 0 && deletes === 0 && prev === -1) {
//           return prev;
//         }
//       } else {
//         if (prev !== -1) {
//           if (index > prev && inserts > 0) {
//             if (inserts === 1) {
//               if (callback(array[index], index)) {
//                 return index;
//               }
//             } else {
//               for (length = index + inserts - 1; length >= index; length--) {
//                 if (callback(array[length], length)) {
//                   // Item matches and is before previous
//                   return length;
//                 }
//               }
//             }
//             return prev;
//           } else if (index + deletes < prev) {
//             return prev + inserts - deletes;
//           } else {
//             i = index + inserts;
//           }
//         } else {
//           // Item did not match last time
//           if (inserts === 0) {
//             // And we did not add any new items
//             return prev;
//           }
//           // Does any of the inserted items match?
//           if (inserts === 1) {
//             if (callback(array[index], index)) {
//               return index;
//             }
//           } else {
//             for (length = index + inserts - 1; length >= index; length--) {
//               if (callback(array[length], length)) {
//                 // Item matches and is before previous
//                 return length;
//               }
//             }
//           }
//           return prev;
//         }
//       }
//     }
//     for (; i >= 0; i--) {
//       if (callback(array[i], i)) {
//         return i;
//       }
//     }
//   }
//   return -1;
// }

// /**
//  * @template T
//  * @this {ReactiveIterator<T, IteratorState<(function(T, number): boolean), boolean>,?>}
//  * @param {T | undefined} prev
//  * @param {IteratorState<(function(T, number): boolean), boolean>} params
//  * @returns {T | undefined}
//  */
// function findLastIterator(prev, params) {
//   var source = /** @type {ReactiveIterator<T, ?, ?>} */ (this._source1);
//   var array = source.peek();
//   var index = (params._state = findLastByCallback(
//     this._state,
//     array,
//     source._mut,
//     params.arg1(),
//     params._state,
//     params.arg2()
//   ));
//   if (index !== -1) {
//     return array[index];
//   }
// }

/**
 * @public
 * @param {function(T,number): boolean} callbackFn
 * @param {SignalOptions=} opts
 * @returns {ReadonlySignal<T | undefined>}
 */
ReactiveIterator.prototype.findLast = function (callbackFn, opts) {
  // return iterateCompute(
  //   this,
  //   findLastIterator,
  //   callbackFn,
  //   Type.None,
  //   opts,
  //   callbackFn.length === 1,
  //   Type.None
  // );
};

// /**
//  * @template T
//  * @this {ReactiveIterator<T, IteratorState<(function(T, number): boolean), boolean>, ?>}
//  * @param {T | undefined} prev
//  * @param {IteratorState<(function(T, number): boolean), boolean>} params
//  * @returns {T | undefined}
//  */
// function findLastIndexIterator(prev, params) {
//   var source = /** @type {ReactiveIterator<T,?,?>} */ (this._source1);
//   return findLastByCallback(
//     this._state,
//     source.peek(),
//     source._mut,
//     params.arg1(),
//     prev,
//     params.arg2()
//   );
// }

/**
 * @param {function(T,number): boolean} callbackFn
 * @param {SignalOptions=} opts
 * @returns {ReadonlySignal<number>}
 */
ReactiveIterator.prototype.findLastIndex = function (callbackFn, opts) {
  // return iterateCompute(
  //   this,
  //   findLastIndexIterator,
  //   callbackFn,
  //   Type.None,
  //   opts,
  //   callbackFn.length === 1,
  //   Type.None
  // );
};

// /**
//  * @template T
//  * @this {ReactiveIterator<T,?,?>}
//  * @param {void} prev
//  * @param {IteratorState<T, (function(T, number): void), undefined>} params
//  * @returns {void}
//  */
// function forEachIterator(prev, params) {
//   /** @type {ReadonlyArray<T>} */
//   var source = this._source1.peek();
//   var length = source.length;
//   if (length > 0) {
//     var callback = params.arg1();
//     for (var i = 0; i < length; i++) {
//       callback(source[i], i);
//     }
//   }
// }

/**
 * @param {function(T,number): void} callbackFn
 * @param {SignalOptions=} opts
 * @returns {ReadonlySignal<void>}
 */
ReactiveIterator.prototype.forEach = function (callbackFn, opts) {
  // return iterateCompute(this, forEachIterator, callbackFn, Type.None, opts);
};

// /**
//  * @template T
//  * @this {ReactiveIterator<T,?,?>}
//  * @param {boolean} prev
//  * @param {IteratorState<T, T | Signal<T> | (function(): T), undefined>} params
//  * @returns {boolean}
//  */
// function includesIterator(prev, params) {
//   return this._source1.peek().includes(read(params.arg1()));
// }

/**
 * @param {T | Signal<T> | (function(): T)} searchElement
 * @param {SignalOptions=} opts
 * @returns {ReadonlySignal<boolean>}
 */
ReactiveIterator.prototype.includes = function (searchElement, opts) {
  // return iterateCompute(
  //   this,
  //   includesIterator,
  //   searchElement,
  //   type(searchElement),
  //   opts
  // );
};

// /**
//  * @template T
//  * @this {ReactiveIterator<T, IteratorState<T | Signal<T> | (function(): T), number | Signal<number> | (function(): number) | undefined>, ?>}
//  * @param {number} prev
//  * @param {IteratorState<T | Signal<T> | (function(): T), number | Signal<number> | (function(): number) | undefined>} params
//  * @returns {number}
//  */
// function indexOfIterator(prev, params) {
//   return this._source1
//     .peek()
//     .indexOf(read(params.arg1()), read(params.arg2()));
// }

/**
 * @param {T | Signal<T> | (function(): T)} searchElement
 * @param {number | Signal<number> | (function(): number)=} fromIndex
 * @param {SignalOptions=} opts
 * @returns {ReadonlySignal<number>}
 */
ReactiveIterator.prototype.indexOf = function (searchElement, fromIndex, opts) {
  // return iterateCompute(
  //   this,
  //   indexOfIterator,
  //   searchElement,
  //   type(searchElement),
  //   opts,
  //   fromIndex,
  //   type(fromIndex)
  // );
};

// /**
//  * @template T
//  * @this {ReactiveIterator<T,?,?>}
//  * @param {string} prev
//  * @param {IteratorState<T, string | undefined, undefined>} params
//  * @returns {string}
//  */
// function joinIterator(prev, params) {
//   return this._source1.peek().join(read(params.arg1()));
// }

/**
 * @param {string | Signal<string> | (function(): string)=} separator
 * @param {SignalOptions=} opts
 * @returns {ReadonlySignal<string>}
 */
ReactiveIterator.prototype.join = function (separator, opts) {
  // return iterateCompute(this, joinIterator, separator, type(separator), opts);
};

// /**
//  * @template T
//  * @this {ReactiveIterator<T, IteratorState<T | Signal<T> | (function(): T), number | Signal<number> | (function(): number) | undefined>, ?>}
//  * @param {number} prev
//  * @param {IteratorState<T | Signal<T> | (function(): T), number | Signal<number> | (function(): number) | undefined>} params
//  * @returns {number}
//  */
// function lastIndexOfIterator(prev, params) {
//   return this._source1
//     .peek()
//     .lastIndexOf(read(params.arg1()), read(params.arg2()));
// }

/**
 * @param {T | Signal<T> | (function(): T)} searchElement
 * @param {number | Signal<number> | (function(): number)=} fromIndex
 * @param {SignalOptions=} opts
 * @returns {ReadonlySignal<number>}
 */
ReactiveIterator.prototype.lastIndexOf = function (
  searchElement,
  fromIndex,
  opts
) {
  // return iterateCompute(
  //   this,
  //   lastIndexOfIterator,
  //   searchElement,
  //   type(searchElement),
  //   opts,
  //   fromIndex,
  //   type(fromIndex)
  // );
};

// /**
//  * @template T, U
//  * @this {ReactiveIterator<T, IteratorState<(function(T, Signal<number>): U), boolean>, ?>}
//  * @param {Array<U>} prev
//  * @param {IteratorState<(function(T, Signal<number>): U), boolean>} params
//  * @returns {Array<U>}
//  */
// function mapIterator(prev, params) {
//   var source = /** @type {ReactiveIterator<T,?,?>} */ (this._source1);
//   var next = source.peek();
//   var plen = prev.length;
//   var nlen = next.length;
//   if (nlen > 0) {
//     var start = 0;
//     var callback = params.arg1();
//     if (this._state & State.Initial) {
//       for (; start < nlen; start++) {}
//     }
//   }
//   return prev;
// }

/**
 * @template U
 * @param {function(T, Signal<number>): U} callbackFn
 * @param {SignalOptions=} opts
 * @returns {SignalIterator<U>}
 */
ReactiveIterator.prototype.map = function (callbackFn, opts) {
  // return iterateArray(
  //   this,
  //   mapIterator,
  //   callbackFn,
  //   Type.None,
  //   opts,
  //   callbackFn.length === 1,
  //   Type.None
  // );
};

// /**
//  * @template T, U, V
//  * @this {ReactiveIterator<T, IteratorState<(function((T | U), T, number): V), U | Signal<U> | (function(): U) | undefined>, ?>}
//  * @param {T} prev
//  * @param {IteratorState<(function((T | U), T, number): V), U | Signal<U> | (function(): U) | undefined>} params
//  * @returns {V}
//  */
// function reduceIterator(prev, params) {
//   return this._source1
//     .peek()
//     .reduce(read(params.arg1()), read(params.arg2()));
// }

/**
 * @template U, V
 * @param {function((T | U), T, number): V} callbackFn
 * @param {U | Signal<U> | (function(): U)=} initialValue
 * @param {SignalOptions=} opts
 * @returns {ReadonlySignal<V>}
 */
ReactiveIterator.prototype.reduce = function (callbackFn, initialValue, opts) {
  // return iterateCompute(
  //   this,
  //   reduceIterator,
  //   callbackFn,
  //   Type.None,
  //   opts,
  //   initialValue,
  //   type(initialValue)
  // );
};

// /**
//  * @template T, U
//  * @this {ReactiveIterator<T,?,?>}
//  * @param {U} prev
//  * @param {IteratorState<T, function((T | U), T, number): U, U | Signal<U> | (function(): U)>} params
//  * @returns {U}
//  */
// function reduceRightIterator(prev, params) {
//   return this._source1
//     .peek()
//     .reduceRight(read(params.arg1()), read(params.arg2()));
// }

/**
 * @template U
 * @param {function((T | U), T, number): U} callbackFn
 * @param {U | Signal<U> | (function(): U)=} initialValue
 * @param {SignalOptions=} opts
 * @returns {ReadonlySignal<U>}
 */
ReactiveIterator.prototype.reduceRight = function (
  callbackFn,
  initialValue,
  opts
) {
  // return iterateCompute(
  //   this,
  //   reduceRightIterator,
  //   callbackFn,
  //   Type.None,
  //   opts,
  //   initialValue,
  //   type(initialValue)
  // );
};

// /**
//  * @template T
//  * @this {ReactiveIterator<T, IteratorState<number | Signal<number> | (function(): number) | undefined, number | Signal<number> | (function(): number) | undefined>, ?>}
//  * @param {Array<T>} prev
//  * @param {IteratorState<number | Signal<number> | (function(): number) | undefined, number | Signal<number> | (function(): number) | undefined>} params
//  * @returns {Array<T>}
//  */
// function sliceIterator(prev, params) {
//   /** @type {ReadonlyArray<T>} */
//   var source = this._source1.peek();
//   if (this._state & State.Initial) {
//     return source.slice(
//       /** @type {number | undefined} */ (read(params.arg1())),
//       /** @type {number | undefined} */ (read(params.arg2()))
//     );
//   }
//   // todo
//   return source.slice(
//     /** @type {number | undefined} */ (read(params.arg1())),
//     /** @type {number | undefined} */ (read(params.arg2()))
//   );
// }

/**
 * @param {number | Signal<number> | (function(): number)=} start
 * @param {number | Signal<number> | (function(): number)=} end
 * @param {SignalOptions=} opts
 * @returns {SignalIterator<T>}
 */
ReactiveIterator.prototype.slice = function (start, end, opts) {
  // return iterateArray(
  //   this,
  //   sliceIterator,
  //   start,
  //   type(start),
  //   opts,
  //   end,
  //   type(end)
  // );
};

// /**
//  * @template T
//  * @this {ReactiveIterator<T, IteratorState<(function(T, number): boolean), boolean>, ?>}
//  * @param {boolean} prev
//  * @param {IteratorState<(function(T, number): boolean), boolean>} params
//  * @returns {boolean}
//  */
// function someIterator(prev, params) {
//   var source = /** @type {ReactiveIterator<T,?,?>} */ (this._source1);
//   return (
//     (params._state = findByCallback(
//       this._state,
//       source.peek(),
//       source._mut,
//       params.arg1(),
//       params._state,
//       params.arg2()
//     )) !== -1
//   );
// }

/**
 * @param {function(T, number): boolean} callbackFn
 * @param {SignalOptions=} opts
 * @returns {ReadonlySignal<boolean>}
 */
ReactiveIterator.prototype.some = function (callbackFn, opts) {
  // return iterateCompute(
  //   this,
  //   someIterator,
  //   callbackFn,
  //   Type.None,
  //   opts,
  //   callbackFn.length === 1,
  //   Type.None
  // );
};

/**
 * @interface
 * @template T
 * @extends {Receive}
 * @extends {ICompute<T>}
 */
function IComputeReduce() { }

/**
 * @struct
 * @template T, U, V, W
 * @constructor
 * @param {ReactiveIterator<T>} source
 * @param {function(Array<T>, Arguments<V, W>, number): U} fn
 * @param {SignalOptions | undefined} opts
 * @param {V | Signal<V> | (function(): V)=} arg1
 * @param {ArgType=} type1
 * @param {W | Signal<W> | (function(): W)=} arg2
 * @param {ArgType=} type2
 * @extends {Compute<U>}
 * @implements {IComputeReduce<U>}
 */
function ComputeReduce(source, fn, opts, arg1, type1, arg2, type2) {
  Compute.call(this, fn, opts);
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
  this._value = this._next(this._value, this._args);
};

/**
 * @interface
 * @template T
 * @extends {IReactiveIterator<T>}
 */
function IComputeArrayStub() { }

/**
 * This only exists because Closure Compiler
 * cannot handle multiple prototype inheritance
 * @struct
 * @abstract
 * @template T
 * @constructor
 * @extends {ReactiveIterator<T>}
 * @implements {IComputeArrayStub<T>}
 */
function ComputeArrayStub() { }

/**
 * @package
 * @type {number}
 */
ComputeArray.prototype._time;

/**
 * @package
 * @type {number}
 */
ComputeArray.prototype._utime;

/**
 * @package
 * @type {number}
 */
ComputeArrayStub.prototype._dtime;

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
 * @type {Receive | null}
 */
ComputeArrayStub.prototype._owner;

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
 * @extends {ICompute<ReadonlyArray<T>>}
 * @extends {IComputeArrayStub<T>}
 */
function IComputeArray() { }

/**
 * @struct
 * @template T, U, V, W
 * @constructor
 * @param {ReactiveIterator<T>} source
 * @param {function(Array<T>, Array<U>, Arguments<V, W>, number): void} fn
 * @param {SignalOptions | undefined} opts
 * @param {V | Signal<V> | (function(): V)=} arg1
 * @param {ArgType=} type1
 * @param {W | Signal<W> | (function(): W)=} arg2
 * @param {ArgType=} type2
 * @extends {ComputeArrayStub<U>}
 * @implements {IComputeArray<U>}
 */
function ComputeArray(source, fn, opts, arg1, type1, arg2, type2) {
  Compute.call(/** @type {?} */(this), fn, opts);
  /**
   * @package
   * @type {Arguments<V, W>}
   */
  this._args = new Arguments(arg1, type1, arg2, type2);
  connect(source, this);
}

extend(ComputeArray, ReactiveIterator);
inherit(ComputeArray, Compute);

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
 * @type {T | Object}
 */
DataArrayStub.prototype._next;

/**
 * @package
 * @type {Receive | null}
 */
DataArrayStub.prototype._node1;

/**
 * @package
 * @type {number}
 */
DataArrayStub.prototype._node1slot;

/**
 * @package
 * @type {Array<Receive> | null}
 */
DataArrayStub.prototype._nodes;

/**
 * @package
 * @type {Array<number> | null}
 */
DataArrayStub.prototype._nodeslots;

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
  Data.call(/** @type {?} */(this), val || []);
  /**
   * @package
   * @type {number}
   */
  this._log = 0;
  /**
   * @package
   * @type {T | Array<T>}
   */
  this._data = null;
  /**
   * @package
   * @type {number}
   */
  this._mut = 0;
}

extend(DataArray, ReactiveIterator);
inherit(DataArray, Data);

/**
 * @public
 * @param {ReadonlyArray<T>} val
 * @returns {void}
 */
DataArray.prototype.set = function (val) {
  
};

/**
 * @package
 * @param {number} mut
 * @param {T | Array<T> | (function(T, T): boolean)=} data
 * @returns {void}
 */
DataArray.prototype._mutate = function (mut, data) {
  var state = this._state;
  if (!(state & (State.QueueDispose | State.Disposed))) {
    if (CONTEXT._idle) {
      this._next = data;
      this._mut = mut;
      this._apply();
      if (state & State.Send) {
        reset();
        sendWillUpdate(this, TIME + 1);
        exec();
      }
    } else {
      if (this._mut !== 0) {
        throw new Error("Duplicate mutation");
      }
      this._next = data;
      this._mut = mut;
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
  /** @type {number} */
  var mut = this._mut;
  var args = /** @type {T | Array<T>} */(this._next);
  var array = /** @type {Array<T>} */ (this._value);
  var length = array.length;
  if (mut === Mutation.Modify) {

  } else {
    var index = mut << 7;
    var count = mut << 14;
    switch (mut & Mutation.TypeMask) {
      case Mutation.Insert:
        if (count === 1) {
          if (index === 0) {
            array.unshift(args);
          } else if (index === length) {
            array.push(args);
          } else {

          }
        } else {

        }
        array.pop();
        break;
      case Mutation.Remove:
        if (count === 1) {
          if (index === 0) {
            array.shift();
          } else if (index === length - 1) {
            array.pop();
          } else {
            // todo
          }
        } else {

        }
        break;
      case Mutation.Reorder:
        break;
    }
  }
  this._log = mut;
  this._data = args;
  this._mut = 0;
  this._next = null;
};

/**
 * @public
 * @param {function(Array<T>): Array<T>} callbackFn
 * @returns {void}
 */
DataArray.prototype.modify = function (callbackFn) {
  // this._mutate(Mutation.Custom | Mutation.Reorder, -1, -1, -1, callbackFn);
};

/**
 * @public
 * @returns {void}
 */
DataArray.prototype.pop = function () {
  this._mutate(Mutation.Remove);
};

/**
 * @public
 * @param {...T} elementN
 * @returns {void}
 */
DataArray.prototype.push = function (elementN) {
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
    this._mutate(Mutation.Insert, args);
  }
};

/**
 * @const
 * @type {Function}
 */
var ReverseFn = function() { };

/**
 * @public
 * @returns {void}
 */
DataArray.prototype.reverse = function () {
  this._mutate(Mutation.Reorder, ReverseFn);
};

/**
 * @public
 * @returns {void}
 */
DataArray.prototype.shift = function () {
  // this._mutate(Mutation.Shift | Mutation.Remove, 0, 1, 0);
};

/**
 * @public
 * @param {function(T,T): number=} compareFn
 * @returns {void}
 */
DataArray.prototype.sort = function (compareFn) {
  // this._mutate(Mutation.Sort | Mutation.Reorder, -1, 0, 0, compareFn);
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
  var args;
  var len = arguments.length;
  if (len > 1) {
    var mutation = 0; // Mutation.Splice;
    if (deleteCount == null) {
      deleteCount = 0;
    }
    if (deleteCount > 0) {
      mutation |= Mutation.Remove;
    }
    if (len > 2) {
      mutation |= Mutation.Insert;
      if (len === 3) {
        args = items;
      } else {
        args = new Array(len - 2);
        for (var j = 0, i = 2; i < len; i++, j++) {
          args[j] = arguments[i];
        }
      }
    }
    // this._mutate(mutation, start, deleteCount, len - 2, args);
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
    // this._mutate(Mutation.Unshift | Mutation.Insert, 0, 0, len, args);
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