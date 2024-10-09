import {
    Send,
    Receive,
    TIME,
    CONTEXT,
    CHANGES,
    State,
    Root,
    Data,
} from "./core.js";

// /**
//  * @interface
//  * @template T
//  * @extends {Send}
//  * @extends {Receive}
//  * @extends {SignalIterator<T>}
//  * @extends {ComputeInterface<ReadonlyArray<T>>}
//  */
// function ComputeArrayInterface() {}

// /**
//  * @interface
//  * @template T
//  * @extends {Send}
//  * @extends {SignalArray<T>}
//  * @extends {DataInterface<Array<T>>}
//  */
// function DataArrayInterface() {}

// /**
//  * @interface
//  * @template T, U
//  */
// function IteratorState() {}

// /**
//  * @package
//  * @type {?}
//  */
// IteratorState.prototype._state;

// /**
//  * @package
//  * @type {T}
//  */
// IteratorState.prototype._param1;

// /**
//  * @package
//  * @type {U | undefined}
//  */
// IteratorState.prototype._param2;

// /**
//  * @struct
//  * @constructor
//  * @template T
//  * @param {number} type
//  */
// function Change(type) {
//   /**
//    * @public
//    * @type {number}
//    */
//   this.type = type;
//   /**
//    * @public
//    * @type {number}
//    */
//   this.index = -1;
//   /**
//    * @public
//    * @type {number}
//    */
//   this.deletes = 0;
//   /**
//    * @public
//    * @type {number}
//    */
//   this.inserts = 0;
//   /**
//    * @public
//    * @type {T | Array<T> | (function(T, T): number) | (function(Array<T>, Change<T>): Array<T>) | null | undefined}
//    */
//   this.params = null;
// }

// /**
//  * @const
//  * @enum {number}
//  */
// var Mutation = {
//   None: 0,
//   Custom: 1,
//   Pop: 2,
//   Push: 3,
//   Shift: 4,
//   Reverse: 5,
//   Sort: 6,
//   Splice: 7,
//   Unshift: 8,
//   Assign: 9,
//   TypeMask: 15,
//   Insert: 16,
//   Remove: 32,
//   Reorder: 64
// };

// /**
//  * @param {Array<Source | number>} params
//  * @returns {Source | Array<Source> | undefined}
//  */
// function getSource(params) {
//   var len = params.length;
//   for (var i = 0, j = 0; i < len; i += 2) {
//     if (params[i + 1] & (Type.Reactive | Type.Function)) {
//       params[j++] = params[i];
//     }
//   }
//   return j === 1 ? /** @type {Source} */(params[0]) : (params.length = j, params);
// }

// /**
//  * @template T, U
//  * @param {U} args
//  * @param {Source | Array<Source>=} params
//  * @param {SignalOptions=} opts
//  * @returns {SignalOptions<T, U>}
//  */
// function mergeOpts(args, params, opts) {
//   if (opts != null) {
//     opts.args = args;
//     if (params != null) {
//       var source = opts.source;
//       if (source == null) {
//         opts.source = params;
//       } else {
//         if (source instanceof Array) {
//           for (var i = 0, len = source.length; i < len; i++) {
//             params.push(source[i]);
//           }
//         } else {
//           params.push(source);
//         }
//         opts.source = params;
//       }
//     }
//   } else {
//     opts = { source: params, args: args };
//   }
//   return opts;
// }

// /**
//  * @template T, U, V
//  * @param {ReactiveIterator<T, IteratorState<U, V>, ?>} source
//  * @param {function(T, IteratorState<U, V>): T} fn
//  * @param {U=} param1
//  * @param {number=} type1
//  * @param {SignalOptions=} opts
//  * @param {V=} param2
//  * @param {number=} type2
//  * @returns {ReadonlySignal<T>}
//  */
// function iterateCompute(source, fn, param1, type1, opts, param2, type2) {
//   return compute(
//     fn,
//     void 0,
//     mergeOpts(
//       /** @type {IteratorState<U, V>} */({ _state: void 0, _param1: param1, _param2: param2 }),
//       getSource([source, Type.Reactive, param1, type1, param2, type2]),
//       opts
//     )
//   );
// }

// /**
//  * @template T, U, V
//  * @param {ReactiveIterator<T, ?, ?>} source
//  * @param {function(T, IteratorState<U, V>): T} fn
//  * @param {U=} param1
//  * @param {number=} type1
//  * @param {SignalOptions=} opts
//  * @param {V=} param2
//  * @param {number=} type2
//  * @returns {SignalIterator<T>}
//  */
// function iterateArray(source, fn, param1, type1, opts, param2, type2) {
//   return new ComputeArray(
//     fn,
//     mergeOpts(
//       /** @type {IteratorState<U, V>} */({ _state: void 0, _param1: param1, _param2: param2 }),
//       getSource([source, Type.Reactive, param1, type1, param2, type2]),
//       opts
//     )
//   );
// }

// /**
//  * @template T
//  * @param {T | Reactive<T> | (function(): T)} args
//  * @returns {T}
//  */
// function read(args) {
//   var t = type(args);
//   return t === Type.Reactive
//     ? /** @type {Reactive<T>} */ (args).peek()
//     : t === Type.Function
//       ? /** @type {function(): T} */ (args)()
//       : /** @type {T} */ (args);
// }

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

// /**
//  * @struct
//  * @abstract
//  * @template T,U,N
//  * @constructor
//  * @implements {SignalIterator<T>}
//  */
// function ReactiveIterator() {}

// /**
//  * @package
//  * @type {Change<T>}
//  */
// ReactiveIterator.prototype._mut;

// /**
//  * @template T
//  * @this {ReactiveIterator<T, IteratorState<number | Signal<number> | (function(): number), undefined>, ?>}
//  * @param {T | undefined} prev
//  * @param {IteratorState<number | Signal<number> | (function(): number), undefined>} params
//  * @returns {T | undefined}
//  */
// function atIterator(prev, params) {
//   /** @type {ReadonlyArray<T>} */
//   var source = this._source1.peek();
//   var length = source.length;
//   var index = /** @type {number} */ (read(params._param1));
//   if (index >= 0 && index < length) {
//     return source[index];
//   }
// }

// /**
//  * @public
//  * @param {number | Signal<number> | (function(): number)} index
//  * @param {SignalOptions=} opts
//  * @returns {ReadonlySignal<T | undefined>}
//  */
// ReactiveIterator.prototype.at = function (index, opts) {
//   return iterateCompute(this, atIterator, index, type(index), opts);
// };

// /**
//  * @template T
//  * @this {ReactiveIterator<T, IteratorState<T | Array<T> | Signal<T> | Signal<Array<T>>, undefined>, ?>}
//  * @param {Array<T>} prev
//  * @param {IteratorState<T | Array<T> | Signal<T> | Signal<Array<T>>, undefined>} params
//  * @returns {Array<T>}
//  */
// function concatIterator(prev, params) {
//   return this._source1.peek().concat(read(params._param1));
// }

// /**
//  * @public
//  * @param {T | Array<T> | Signal<T> | Signal<Array<T>>} items
//  * @param {SignalOptions=} opts
//  * @returns {SignalIterator<T>}
//  */
// ReactiveIterator.prototype.concat = function (items, opts) {
//   return iterateArray(this, concatIterator, items, type(items), opts);
// };

// /**
//  * @template T
//  * @this {ReactiveIterator<T, IteratorState<(function(T, number): boolean), boolean>,?>}
//  * @param {boolean} prev
//  * @param {IteratorState<(function(T, number): boolean), boolean>} params
//  * @returns {boolean}
//  */
// function everyIterator(prev, params) {
//   var source = this._source1;
//   /** @type {ReadonlyArray<T>} */
//   var array = source.peek();
//   var length = array.length;
//   /** @type {number} */
//   var state = params._state;
//   params._state = 0;
//   if (length > 0) {
//     var start = 0;
//     var last = length - 1;
//     var callback = params._param1;
//     if (params._param2 && !(this._state & State.Initial)) {
//       /** @type {Change} */
//       var mut = source._mut;
//       var insert = mut.inserts;
//       var remove = mut.deletes;
//       if (insert === 0 && remove === 0) {
//         params._state = prev ? last : -1;
//         return prev;
//       }
//       if (!(mut.type & Mutation.Reorder)) {
//         var index = mut.index;
//         if (prev) {
//           // All items returned true last time.
//           if (insert === 0) {
//             // Every item passed and we didn't add any.
//             params._state = last;
//             return prev;
//           }
//           if (state !== -1) {
//             // We only need to check inserted items.
//             start = index;
//             last = index + insert - 1;
//           }
//         } else {
//           // Some item returned false last time
//           if (
//             remove === 0 ||
//             (state !== -1 &&
//               (index > state || (insert === 0 && index + remove < state)))
//           ) {
//             // Since it failed for some item last time, and we did
//             // not remove an item, it will return false this time as well.
//             // Or, we did not make changes prior to the found falsy item.
//             // Or, we did not insert any new item and the removals take place before
//             // the previously found item.
//             params._state = index < state ? state + (insert - remove) : state;
//             return prev;
//           }
//         }
//         start = state < 0 ? 0 : index < state ? index : state;
//       }
//     }
//     for (; start <= last; start++) {
//       if (!callback(array[start], start)) {
//         params._state = start;
//         return false;
//       }
//     }
//     params._state = length - 1;
//   }
//   return true;
// }

// /**
//  * @public
//  * @param {function(T, number): boolean} callbackFn
//  * @param {SignalOptions=} opts
//  * @returns {ReadonlySignal<boolean>}
//  */
// ReactiveIterator.prototype.every = function (callbackFn, opts) {
//   return iterateCompute(
//     this,
//     everyIterator,
//     callbackFn,
//     Type.None,
//     opts,
//     callbackFn.length === 1,
//     Type.None
//   );
// };

// /**
//  * @template T
//  * @this {ReactiveIterator<T,?,?>}
//  * @param {Array<T>} prev
//  * @param {IteratorState<T, (function(T, number): boolean), undefined>} params
//  * @returns {Array<T>}
//  */
// function filterIterator(prev, params) {
//   /** @type {ReadonlyArray<T>} */
//   var source = this._source1.peek();
//   var length = source.length;
//   /** @type {Array<T>} */
//   var result = [];
//   if (length > 0) {
//     var callback = params._param1;
//     for (var i = 0; i < length; i++) {
//       var item = source[i];
//       if (callback(item, i)) {
//         result.push(item);
//       }
//     }
//   }
//   return result;
// }

// /**
//  * @public
//  * @param {function(T, number): boolean} callbackFn
//  * @param {SignalOptions=} opts
//  * @returns {SignalIterator<T>}
//  */
// ReactiveIterator.prototype.filter = function (callbackFn, opts) {
//   return iterateArray(this, filterIterator, callbackFn, Type.None, opts);
// };

// /**
//  * @template T
//  * @param {ReadonlyArray<T>} array
//  * @param {Change<T>} mut
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
//             // Changes apply beyond last found index
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
//     params._param1,
//     params._state,
//     params._param2
//   ));
//   if (index !== -1) {
//     return array[index];
//   }
// }

// /**
//  * @public
//  * @param {function(T, number): boolean} callbackFn
//  * @param {SignalOptions=} opts
//  * @returns {ReadonlySignal<T | undefined>}
//  */
// ReactiveIterator.prototype.find = function (callbackFn, opts) {
//   return iterateCompute(
//     this,
//     findIterator,
//     callbackFn,
//     Type.None,
//     opts,
//     callbackFn.length === 1,
//     Type.None
//   );
// };

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
//     params._param1,
//     prev,
//     params._param2
//   );
// }

// /**
//  * @public
//  * @param {function(T, number): boolean} callbackFn
//  * @param {SignalOptions=} opts
//  * @returns {ReadonlySignal<number>}
//  */
// ReactiveIterator.prototype.findIndex = function (callbackFn, opts) {
//   return iterateCompute(
//     this,
//     findIndexIterator,
//     callbackFn,
//     Type.None,
//     opts,
//     callbackFn.length === 1,
//     Type.None
//   );
// };

// /**
//  * @template T
//  * @param {ReadonlyArray<T>} array
//  * @param {Change<T>} mut
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
//     params._param1,
//     params._state,
//     params._param2
//   ));
//   if (index !== -1) {
//     return array[index];
//   }
// }

// /**
//  * @public
//  * @param {function(T,number): boolean} callbackFn
//  * @param {SignalOptions=} opts
//  * @returns {ReadonlySignal<T | undefined>}
//  */
// ReactiveIterator.prototype.findLast = function (callbackFn, opts) {
//   return iterateCompute(
//     this,
//     findLastIterator,
//     callbackFn,
//     Type.None,
//     opts,
//     callbackFn.length === 1,
//     Type.None
//   );
// };

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
//     params._param1,
//     prev,
//     params._param2
//   );
// }

// /**
//  * @param {function(T,number): boolean} callbackFn
//  * @param {SignalOptions=} opts
//  * @returns {ReadonlySignal<number>}
//  */
// ReactiveIterator.prototype.findLastIndex = function (callbackFn, opts) {
//   return iterateCompute(
//     this,
//     findLastIndexIterator,
//     callbackFn,
//     Type.None,
//     opts,
//     callbackFn.length === 1,
//     Type.None
//   );
// };

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
//     var callback = params._param1;
//     for (var i = 0; i < length; i++) {
//       callback(source[i], i);
//     }
//   }
// }

// /**
//  * @param {function(T,number): void} callbackFn
//  * @param {SignalOptions=} opts
//  * @returns {ReadonlySignal<void>}
//  */
// ReactiveIterator.prototype.forEach = function (callbackFn, opts) {
//   return iterateCompute(this, forEachIterator, callbackFn, Type.None, opts);
// };

// /**
//  * @template T
//  * @this {ReactiveIterator<T,?,?>}
//  * @param {boolean} prev
//  * @param {IteratorState<T, T | Signal<T> | (function(): T), undefined>} params
//  * @returns {boolean}
//  */
// function includesIterator(prev, params) {
//   return this._source1.peek().includes(read(params._param1));
// }

// /**
//  * @param {T | Signal<T> | (function(): T)} searchElement
//  * @param {SignalOptions=} opts
//  * @returns {ReadonlySignal<boolean>}
//  */
// ReactiveIterator.prototype.includes = function (searchElement, opts) {
//   return iterateCompute(
//     this,
//     includesIterator,
//     searchElement,
//     type(searchElement),
//     opts
//   );
// };

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
//     .indexOf(read(params._param1), read(params._param2));
// }

// /**
//  * @param {T | Signal<T> | (function(): T)} searchElement
//  * @param {number | Signal<number> | (function(): number)=} fromIndex
//  * @param {SignalOptions=} opts
//  * @returns {ReadonlySignal<number>}
//  */
// ReactiveIterator.prototype.indexOf = function (searchElement, fromIndex, opts) {
//   return iterateCompute(
//     this,
//     indexOfIterator,
//     searchElement,
//     type(searchElement),
//     opts,
//     fromIndex,
//     type(fromIndex)
//   );
// };

// /**
//  * @template T
//  * @this {ReactiveIterator<T,?,?>}
//  * @param {string} prev
//  * @param {IteratorState<T, string | undefined, undefined>} params
//  * @returns {string}
//  */
// function joinIterator(prev, params) {
//   return this._source1.peek().join(read(params._param1));
// }

// /**
//  * @param {string | Signal<string> | (function(): string)=} separator
//  * @param {SignalOptions=} opts
//  * @returns {ReadonlySignal<string>}
//  */
// ReactiveIterator.prototype.join = function (separator, opts) {
//   return iterateCompute(this, joinIterator, separator, type(separator), opts);
// };

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
//     .lastIndexOf(read(params._param1), read(params._param2));
// }

// /**
//  * @param {T | Signal<T> | (function(): T)} searchElement
//  * @param {number | Signal<number> | (function(): number)=} fromIndex
//  * @param {SignalOptions=} opts
//  * @returns {ReadonlySignal<number>}
//  */
// ReactiveIterator.prototype.lastIndexOf = function (
//   searchElement,
//   fromIndex,
//   opts
// ) {
//   return iterateCompute(
//     this,
//     lastIndexOfIterator,
//     searchElement,
//     type(searchElement),
//     opts,
//     fromIndex,
//     type(fromIndex)
//   );
// };

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
//     var callback = params._param1;
//     if (this._state & State.Initial) {
//       for (; start < nlen; start++) {}
//     }
//   }
//   return prev;
// }

// /**
//  * @template U
//  * @param {function(T, Signal<number>): U} callbackFn
//  * @param {SignalOptions=} opts
//  * @returns {SignalIterator<U>}
//  */
// ReactiveIterator.prototype.map = function (callbackFn, opts) {
//   return iterateArray(
//     this,
//     mapIterator,
//     callbackFn,
//     Type.None,
//     opts,
//     callbackFn.length === 1,
//     Type.None
//   );
// };

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
//     .reduce(read(params._param1), read(params._param2));
// }

// /**
//  * @template U, V
//  * @param {function((T | U), T, number): V} callbackFn
//  * @param {U | Signal<U> | (function(): U)=} initialValue
//  * @param {SignalOptions=} opts
//  * @returns {ReadonlySignal<V>}
//  */
// ReactiveIterator.prototype.reduce = function (callbackFn, initialValue, opts) {
//   return iterateCompute(
//     this,
//     reduceIterator,
//     callbackFn,
//     Type.None,
//     opts,
//     initialValue,
//     type(initialValue)
//   );
// };

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
//     .reduceRight(read(params._param1), read(params._param2));
// }

// /**
//  * @template U
//  * @param {function((T | U), T, number): U} callbackFn
//  * @param {U | Signal<U> | (function(): U)=} initialValue
//  * @param {SignalOptions=} opts
//  * @returns {ReadonlySignal<U>}
//  */
// ReactiveIterator.prototype.reduceRight = function (
//   callbackFn,
//   initialValue,
//   opts
// ) {
//   return iterateCompute(
//     this,
//     reduceRightIterator,
//     callbackFn,
//     Type.None,
//     opts,
//     initialValue,
//     type(initialValue)
//   );
// };

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
//       /** @type {number | undefined} */ (read(params._param1)),
//       /** @type {number | undefined} */ (read(params._param2))
//     );
//   }
//   // todo
//   return source.slice(
//     /** @type {number | undefined} */ (read(params._param1)),
//     /** @type {number | undefined} */ (read(params._param2))
//   );
// }

// /**
//  * @param {number | Signal<number> | (function(): number)=} start
//  * @param {number | Signal<number> | (function(): number)=} end
//  * @param {SignalOptions=} opts
//  * @returns {SignalIterator<T>}
//  */
// ReactiveIterator.prototype.slice = function (start, end, opts) {
//   return iterateArray(
//     this,
//     sliceIterator,
//     start,
//     type(start),
//     opts,
//     end,
//     type(end)
//   );
// };

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
//       params._param1,
//       params._state,
//       params._param2
//     )) !== -1
//   );
// }

// /**
//  * @param {function(T, number): boolean} callbackFn
//  * @param {SignalOptions=} opts
//  * @returns {ReadonlySignal<boolean>}
//  */
// ReactiveIterator.prototype.some = function (callbackFn, opts) {
//   return iterateCompute(
//     this,
//     someIterator,
//     callbackFn,
//     Type.None,
//     opts,
//     callbackFn.length === 1,
//     Type.None
//   );
// };

// /**
//  * @struct
//  * @template T, U
//  * @constructor
//  * @param {function(Array<T>, U): T} fn
//  * @param {SignalOptions=} opts
//  * @extends {ReactiveIterator<T, U, function(Array<T>, U): Array<T>>}
//  * @implements {ComputeArrayInterface<T>}
//  */
// function ComputeArray(fn, opts) {
//   Compute.call(/** @type {?} */ (this), fn, [], opts);
//   this._state |= State.ManualScope;
//   /**
//    * @public
//    * @type {function(): number}
//    */
//   this.length = getLength(this);
//   /**
//    * @package
//    * @override
//    * @type {Change<T>}
//    */
//   this._mut = new Change(Mutation.None);
// }

// extend(ComputeArray, ReactiveIterator, Compute);

// /**
//  *
//  * @param {Change} change
//  * @param {number} type
//  * @param {number} index
//  * @param {number} remove
//  * @param {number} insert
//  * @param {?=} params
//  */
// function mutate(change, type, index, remove, insert, params) {
//   change.type = type;
//   change.index = index;
//   change.deletes = remove;
//   change.inserts = insert;
//   change.params = params;
// }

/**
 * @struct
 * @template T
 * @constructor
 * @param {Array<T>=} val
 */
function DataArray(val) {
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
    // /**
    //  * @public
    //  * @type {function(): number}
    //  */
    // this.length = getLength(this);
    // /**
    //  * @package
    //  * @override
    //  * @type {Change<T>}
    //  */
    // this._mut = new Change(Mutation.None);
    // /**
    //  * @package
    //  * @override
    //  * @type {Change<T>}
    //  */
    // this._next = new Change(Mutation.None);
}

// extend(DataArray, ReactiveIterator, Data);

// /**
//  * @public
//  * @override
//  * @param {ReadonlyArray<T>} val
//  * @returns {void}
//  */
// DataArray.prototype.update = function (val) {
//     this._mutate(Mutation.Assign | Mutation.Reorder, -1, -1, -1, val);
// };

// /**
//  * @package
//  * @param {number} type
//  * @param {number} index
//  * @param {number} remove
//  * @param {number} insert
//  * @param {?=} params
//  * @returns {void}
//  */
// DataArray.prototype._mutate = function (type, index, remove, insert, params) {
//     var state = this._state;
//     if (
//         !(state & (State.WillDispose | State.ShallDispose | State.Disposed))
//     ) {
//         var next = this._next;
//         if (CONTEXT._idle) {
//             // mutate(next, type, index, remove, insert, params);
//             this._apply();
//             if (state & (State.SendOne | State.SendMany)) {
//                 // reset();
//                 // sendWillUpdate(this, TIME + 1);
//                 // exec();
//             }
//         } else {
//             if (next.type !== Mutation.None) {
//                 throw new Error("Conflict");
//             }
//             // mutate(next, type, index, remove, insert, params);
//             this._state |= State.ShallUpdate;
//             // CHANGES._add(this);
//         }
//     }
// };

// /**
//  * @package
//  * @returns {void}
//  */
// DataArray.prototype._apply = function () {
//     /** @type {number} */
//     var i;
//     /** @type {number} */
//     var len;
//     /** @type {Array<T>} */
//     var items;
//     /** @type {Change} */
//     var mut = this._mut;
//     /** @type {Change} */
//     var next = this._next;
//     var value = /** @type {Array<T>} */ (this._value);
//     switch (next.type & Mutation.TypeMask) {
//         case Mutation.Pop:
//             value.pop();
//             break;
//         case Mutation.Push:
//             if (next.inserts === 1) {
//                 value.push(/** @type {T} */(next.params));
//             } else {
//                 Array.prototype.push.apply(
//                     value,
//           /** @type {Array<T>} */(next.params)
//                 );
//             }
//             break;
//         case Mutation.Reverse:
//             value.reverse();
//             break;
//         case Mutation.Shift:
//             value.shift();
//             break;
//         case Mutation.Sort:
//             value.sort(
//         /** @type {(function(T,T): number) | undefined} */(next.params)
//             );
//             break;
//         case Mutation.Splice:
//             len = next.inserts;
//             if (len === 0) {
//                 value.splice(next.index, next.deletes);
//             } else if (len === 1) {
//                 value.splice(next.index, next.deletes, /** @type {T} */(next.params));
//             } else {
//                 var args = /** @type {Array<number | T>} */ ([
//                     next.index,
//                     next.deletes
//                 ]);
//                 items = /** @type {Array<T>} */ (next.params);
//                 for (i = 0; i < len; i++) {
//                     args[i + 2] = items[i];
//                 }
//                 Array.prototype.splice.apply(value, args);
//             }
//             break;
//         case Mutation.Unshift:
//             if (next.inserts === 1) {
//                 value.unshift(/** @type {T} */(next.params));
//             } else {
//                 Array.prototype.unshift.apply(
//                     value,
//           /** @type {Array<T>} */(next.params)
//                 );
//             }
//             break;
//         case Mutation.Assign:
//             this._value = /** @type {Array<T>} */ (next.params);
//             break;
//         case Mutation.Custom:
//             this._value = /** @type {function(Array<T>, Change): Array<T>} */ (
//                 next.params
//             )(value, next);
//             break;
//     }
//     mut.type = Mutation.None;
//     mut.params = null;
//     this._mut = next;
//     this._next = mut;
// };

// /**
//  * @package
//  * @override
//  * @param {number} time
//  * @returns {void}
//  */
// DataArray.prototype._update = function (time) {
//     this._apply();
//     this._state &= ~State.ShallUpdate;
//     sendWillUpdate(this, time);
// };

// /**
//  * @public
//  * @param {function(Array<T>, Change): Array<T>} callbackFn
//  * @returns {void}
//  */
// DataArray.prototype.modify = function (callbackFn) {
//     this._mutate(Mutation.Custom | Mutation.Reorder, -1, -1, -1, callbackFn);
// };

// /**
//  * @public
//  * @returns {void}
//  */
// DataArray.prototype.pop = function () {
//     this._mutate(Mutation.Pop | Mutation.Remove, this._value.length - 1, 1, 0);
// };

// /**
//  * @public
//  * @param {...T} elementN
//  * @returns {void}
//  */
// DataArray.prototype.push = function (elementN) {
//     /** @type {T | Array<T>} */
//     var params;
//     /** @type {number} */
//     var len = arguments.length;
//     if (len > 0) {
//         if (len === 1) {
//             params = elementN;
//         } else {
//             params = new Array(len);
//             for (var i = 0; i < len; i++) {
//                 params[i] = arguments[i];
//             }
//         }
//         this._mutate(
//             Mutation.Push | Mutation.Insert,
//             this._value.length,
//             0,
//             len,
//             params
//         );
//     }
// };

// /**
//  * @public
//  * @returns {void}
//  */
// DataArray.prototype.reverse = function () {
//     this._mutate(Mutation.Reverse | Mutation.Reorder, -1, 0, 0);
// };

// /**
//  * @public
//  * @returns {void}
//  */
// DataArray.prototype.shift = function () {
//     this._mutate(Mutation.Shift | Mutation.Remove, 0, 1, 0);
// };

// /**
//  * @public
//  * @param {function(T,T): number=} compareFn
//  * @returns {void}
//  */
// DataArray.prototype.sort = function (compareFn) {
//     this._mutate(Mutation.Sort | Mutation.Reorder, -1, 0, 0, compareFn);
// };

// /**
//  * @public
//  * @param {number} start
//  * @param {number=} deleteCount
//  * @param {...T} items
//  * @returns {void}
//  */
// DataArray.prototype.splice = function (start, deleteCount, items) {
//     /** @type {T | Array<T>} */
//     var params;
//     var len = arguments.length;
//     if (len > 1) {
//         var mutation = Mutation.Splice;
//         if (deleteCount == null) {
//             deleteCount = 0;
//         }
//         if (deleteCount > 0) {
//             mutation |= Mutation.Remove;
//         }
//         if (len > 2) {
//             mutation |= Mutation.Insert;
//             if (len === 3) {
//                 params = items;
//             } else {
//                 params = new Array(len - 2);
//                 for (var j = 0, i = 2; i < len; i++, j++) {
//                     params[j] = arguments[i];
//                 }
//             }
//         }
//         this._mutate(mutation, start, deleteCount, len - 2, params);
//     }
// };

// /**
//  * @public
//  * @param {...T} elementN
//  * @returns {void}
//  */
// DataArray.prototype.unshift = function (elementN) {
//     /** @type {T | Array<T>} */
//     var args;
//     /** @type {number} */
//     var len = arguments.length;
//     if (len > 0) {
//         if (len === 1) {
//             args = elementN;
//         } else {
//             args = new Array(len);
//             for (var i = 0; i < len; i++) {
//                 args[i] = arguments[i];
//             }
//         }
//         this._mutate(Mutation.Unshift | Mutation.Insert, 0, 0, len, args);
//     }
// };

// /**
//  * @template T
//  * @param {Array<T>=} val
//  * @returns {SignalArray<T>}
//  */
// function array(val) {
//     return new DataArray(val);
// }

// // window["anod"]["array"] = array;
// // window["anod"]["ComputeArray"] = ComputeArray;
// // window["anod"]["DataArray"] = DataArray;

// // export {
// //   ComputeArrayInterface,
// //   DataArrayInterface,
// //   IteratorState,
// //   Mutation,
// //   iterateCompute,
// //   read,
// //   ReactiveIterator,
// //   getLength,
// //   atIterator,
// //   everyIterator,
// //   filterIterator,
// //   findIterator,
// //   findIndexIterator,
// //   findLastIterator,
// //   findLastIndexIterator,
// //   forEachIterator,
// //   includesIterator,
// //   indexOfIterator,
// //   joinIterator,
// //   lastIndexOfIterator,
// //   reduceIterator,
// //   reduceRightIterator,
// //   someIterator,
// //   ComputeArray,
// //   DataArray,
// //   array
// // };
