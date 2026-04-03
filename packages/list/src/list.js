// 1. Destructure the RUNTIME variables from the fake globals
import {
    Signal, Compute, Effect, OPT_SETUP, OPT_STABLE
} from '@anod/signal';

import {
    CLOCK, STATE_IDLE,
    FLAG_LIST,
    OP_COPY_WITHIN, OP_FILL, OP_FILL_RANGE, OP_POP, OP_PUSH, OP_PUSH_ARRAY,
    OP_REVERSE, OP_SHIFT, OP_SORT, OP_SPLICE, OP_UNSHIFT, OP_UNSHIFT_ARRAY,
    notify, scheduleSignal,
    isPrimitive, isFunction, isSignal
} from '@anod/signal/internal';

/** @const */
var SignalProto = Signal.prototype;
/** @const */
var ComputeProto = Compute.prototype;

/**
 * @template T
 * @param {*} arg 
 * @returns {T}
 */
function getVal(arg) {
    return isPrimitive(arg) ? arg :
        isSignal(arg) ? /** @type {ReadonlySignal<T>} */(arg).val() :
            isFunction(arg) ? /** @type {function(): T} */(arg)() : arg;
}

/**
 * @template T
 * @param {ReadonlySignal<T> | (function(): T)} source
 * @returns {T} 
 */
function read(source) {
    return isFunction(source) ? 
        /** @type {function(): T} */(source)() : 
        isSignal(source) ? /** @type {ReadonlySignal<T>} */(source).val() : source; 
}

/**
 * @template T,U,W
 * @param {Send<Array<U>>} source 
 * @param {function(Array<U>,T,W): T} fn 
 * @param {W} args
 * @param {number=} opts
 * @returns {Compute<T,Array<U>,null,W>}
 */
function computeArray(source, fn, args, opts) {
    return source.derive(fn, void 0, 0 | opts, args);
}

/**
 * @template T
 * @param {Array<T>} source
 * @param {number} seed
 * @param {number | ReadonlySignal<number> | (function(): number)} args
 * @returns {T | undefined}
 */
function at(source, seed, args) {
    return source.at(typeof args === 'number' ? args : read(args));
}

/**
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @param {number | ReadonlySignal<number> | (function(): number)} index 
 * @returns {Compute<T|undefined,Array<T>,null,number | ReadonlySignal<number> | (function(): number)>}
 */
SignalProto.at = ComputeProto.at = function (index) {
    return computeArray(this, at, index, isSignal(index) ? OPT_SETUP : 0);
};

/**
 * @template T
 * @param {Array<T>} source 
 * @param {Array<T>} seed 
 * @param {*} args
 * @returns {Array<T>}
 */
function concat(source, seed, args) {
    return source.concat(args);
}

/**
 * @template T
 * @param {Array<T>} source
 * @param {Array<T>} seed
 * @param {*} args
 * @returns {Array<T>}
 */
function concatN(source, seed, args) {
    // Cast args back to an array inside the runner to satisfy spread syntax
    return source.concat(.../** @type {!Iterable} */(args)); 
}

/**
 * @template T
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @param {...*} items 
 * @returns {Compute<Array<T>,Array<T>,null,*>}
 */
SignalProto.concat = ComputeProto.concat = function (...items) {
    let len = items.length;
    if (len === 1) {
        let item = items[0];
        return computeArray(this, concat, /** @type {!Array} */(item), isSignal(item) ? OPT_SETUP : 0);
    }
    // Cast items to * so W is uniformly inferred as *
    return computeArray(this, concatN, /** @type {!Array} */(items));
};

/**
 * @template T
 * @param {Array<T>} source
 * @returns {!IteratorIterable<!Array<number|T>>}
 */
function entries(source) {
    return source.entries();
}

/**
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @returns {Compute<!IteratorIterable<!Array<number|T>>,Array<T>,null,undefined>}
 */
SignalProto.entries = ComputeProto.entries = function () {
    return computeArray(this, entries, void 0);
};

/**
 * @template T
 * @param {Array<T>} source
 * @param {boolean} seed
 * @param {function(T, number): boolean} cb
 * @returns {boolean}
 */
function every(source, seed, cb) {
    return source.every(cb);
}

/**
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @param {function(T, number): boolean} cb 
 * @param {number=} opts
 * @returns {Compute<boolean,Array<T>,null,(function(T, number): boolean)>}
 */
SignalProto.every = ComputeProto.every = function (cb, opts) {
    return computeArray(this, every, cb, opts);
};

/**
 * @template T
 * @param {Array<T>} source
 * @param {Array<T>} seed
 * @param {function(T, number, Array<T>): boolean} cb
 * @returns {Array<T>}
 */
function filter(source, seed, cb) {
    return source.filter(cb);
}

/**
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @param {function(T, number, Array<T>): boolean} cb 
 * @param {number=} opts
 * @returns {Compute<Array<T>,Array<T>,null,(function(T, number, Array<T>): boolean)>}
 */
SignalProto.filter = ComputeProto.filter = function (cb, opts) {
    return computeArray(this, filter, cb, opts);
};

/**
 * @template T
 * @param {Array<T>} source
 * @param {T | undefined} seed
 * @param {function(T, number, Array<T>): boolean} cb
 * @returns {T|undefined}
 */
function find(source, seed, cb) { return source.find(cb); }

/**
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @param {function(T, number): boolean} cb 
 * @param {number=} opts
 * @returns {Compute<T|undefined,Array<T>,null,(function(T, number): boolean)>}
 */
SignalProto.find = ComputeProto.find = function (cb, opts) {
    return computeArray(this, find, cb, opts);
};

/**
 * @template T
 * @param {Array<T>} source
 * @param {number} seed
 * @param {function(T, number, Array<T>): boolean} cb
 * @returns {number}
 */
function findIndex(source, seed, cb) { return source.findIndex(cb); }

/**
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @param {function(T, number): boolean} cb 
 * @param {number=} opts
 * @returns {Compute<number,Array<T>,null,(function(T, number): boolean)>}
 */
SignalProto.findIndex = ComputeProto.findIndex = function (cb, opts) {
    return computeArray(this, findIndex, cb, opts);
};

/**
 * @template T
 * @param {Array<T>} source
 * @param {T | undefined} seed
 * @param {function(T, number, Array<T>): boolean} cb
 * @returns {T | undefined}
 */
function findLast(source, seed, cb) { return source.findLast(cb); }

/**
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @param {function(T, number, Array<T>): boolean} cb 
 * @param {number=} opts
 * @returns {Compute<T|undefined,Array<T>,null,(function(T, number, Array<T>): boolean)>}
 */
SignalProto.findLast = ComputeProto.findLast = function (cb, opts) {
    return computeArray(this, findLast, cb, opts);
};

/**
 * @template T
 * @param {Array<T>} source
 * @param {number} seed
 * @param {function(T, number, Array<T>): boolean} cb
 * @returns {number}
 */
function findLastIndex(source, seed, cb) { return source.findLastIndex(cb); }

/**
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @param {function(T, number, Array<T>): boolean} cb 
 * @param {number=} opts
 * @returns {Compute<number,Array<T>,null,(function(T, number, Array<T>): boolean)>}
 */
SignalProto.findLastIndex = ComputeProto.findLastIndex = function (cb, opts) {
    return computeArray(this, findLastIndex, cb, opts);
};

/**
 * @template T
 * @param {Array<T>} source
 * @param {Array<T>} seed
 * @param {number | ReadonlySignal<number> | (function(): number)=} depth
 * @returns {!Array<T>}
 */
function flat(source, seed, depth) { 
    return source.flat(getVal(depth)); 
}

/**
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @param {number | ReadonlySignal<number> | (function(): number)=} depth 
 * @returns {Compute<Array<T>,Array<T>,null,number|ReadonlySignal<number>|(function(): number)|undefined>}
 */
SignalProto.flat = ComputeProto.flat = function (depth) {
    return computeArray(this, flat, depth, isSignal(depth) ? OPT_SETUP : 0);
};

/**
 * @template T, U
 * @param {Array<T>} source
 * @param {Array<U>} seed
 * @param {function(T, number, IArrayLike<T>): !ReadonlyArray<U>} cb
 * @returns {Array<U>}
 */
function flatMap(source, seed, cb) {
    return source.flatMap(cb);
}

/**
 * @template U
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @param {function(T, number, IArrayLike<T>): !ReadonlyArray<U>} cb
 * @param {number=} opts
 * @returns {Compute<Array<U>,Array<T>,null,(function(T, number): !ReadonlyArray<U>)>}
 */
SignalProto.flatMap = ComputeProto.flatMap = function (cb, opts) {
    return computeArray(this, flatMap, cb, opts);
};

/**
 * @template T
 * @param {Array<T>} source
 * @param {(function(T, number): ((function(): void) | void))} cb
 * @returns {void}
 */
function forEach(source, cb) { 
    source.forEach(cb); 
}

/**
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @param {(function(T, number): ((function(): void) | void))} cb 
 * @param {number=} opts
 * @returns {Effect<Array<T>,null, ((function(T, number): ((function(): void) | void)))>}
 */
SignalProto.forEach = ComputeProto.forEach = function (cb, opts) {
    return this.watch(forEach, opts, cb);
};

// --- includes ---

/**
 * @template T
 * @param {Array<T>} source
 * @param {boolean} seed
 * @param {*} arg
 * @returns {boolean}
 */
function includes1(source, seed, arg) {
    return source.includes(/** @type {T} */(getVal(arg)));
}

/**
 * @template T
 * @param {Array<T>} source
 * @param {boolean} seed
 * @param {*} args
 * @returns {boolean}
 */
function includes2(source, seed, args) {
    let arr = /** @type {!Array<*>} */(args);
    return source.includes(/** @type {T} */(getVal(arr[0])), /** @type {number} */(getVal(arr[1])));
}

/**
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @param {*} searchElement 
 * @param {number | ReadonlySignal<number> | (function(): number)=} fromIndex
 * @returns {Compute<boolean,Array<T>,null,*>}
 */
SignalProto.includes = ComputeProto.includes = function (searchElement, fromIndex) {
    if (arguments.length === 1) {
        return computeArray(this, includes1, searchElement, isSignal(searchElement) ? OPT_SETUP : 0);
    }
    let unstable = isSignal(searchElement) || isSignal(fromIndex);
    return computeArray(this, includes2, /** @type {*} */([searchElement, fromIndex]), 0);
};


// --- indexOf ---

/**
 * @template T
 * @param {Array<T>} source
 * @param {number} seed
 * @param {*} arg
 * @returns {number}
 */
function indexOf1(source, seed, arg) {
    return source.indexOf(/** @type {T} */(getVal(arg)));
}

/**
 * @template T
 * @param {Array<T>} source
 * @param {number} seed
 * @param {*} args
 * @returns {number}
 */
function indexOf2(source, seed, args) {
    let arr = /** @type {!Array<*>} */(args);
    return source.indexOf(/** @type {T} */(getVal(arr[0])), /** @type {number} */(getVal(arr[1])));
}

/**
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @param {*} searchElement 
 * @param {number | ReadonlySignal<number> | (function(): number)=} fromIndex
 * @returns {Compute<number, Array<T>, null, *>}
 */
SignalProto.indexOf = ComputeProto.indexOf = function (searchElement, fromIndex) {
    if (arguments.length === 1) {
        return computeArray(this, indexOf1, searchElement, isSignal(searchElement) ? OPT_SETUP : 0);
    }
    let unstable = isSignal(searchElement) || isSignal(fromIndex);
    return computeArray(this, indexOf2, /** @type {*} */([searchElement, fromIndex]), 0);
};


// --- join ---

/**
 * @template T
 * @param {Array<T>} source
 * @param {string} seed
 * @param {string | ReadonlySignal<string> | (function(): string)=} separator
 * @returns {string}
 */
function join(source, seed, separator) {
    return source.join(separator !== undefined ? /** @type {string} */(getVal(separator)) : undefined);
}

/**
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @param {string | ReadonlySignal<string> | (function(): string)=} separator 
 * @returns {Compute<string, Array<T>, null, string | ReadonlySignal<string> | (function(): string) | undefined>}
 */
SignalProto.join = ComputeProto.join = function (separator) {
    return computeArray(this, join, separator, isSignal(separator) ? OPT_SETUP : 0);
};


// --- keys ---

/**
 * @template T
 * @param {Array<T>} source
 * @param {!IteratorIterable<number>} seed
 * @param {undefined=} args
 * @returns {!IteratorIterable<number>}
 */
function keys(source, seed, args) {
    return source.keys();
}

/**
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @returns {Compute<!IteratorIterable<number>, Array<T>, null, undefined>}
 */
SignalProto.keys = ComputeProto.keys = function () {
    return computeArray(this, keys, void 0, 0);
};


// --- map ---

/**
 * @template T, U
 * @param {Array<T>} source
 * @param {Array<U>} seed
 * @param {function(T, number, Array<T>): U} cb
 * @returns {Array<U>}
 */
function map(source, seed, cb) {
    return source.map(cb);
}

/**
 * @template U
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @param {function(T, number, Array<T>): U} cb 
 * @param {number=} opts
 * @returns {Compute<Array<U>,Array<T>,null, function(T, number, Array<T>): U>}
 */
SignalProto.map = ComputeProto.map = function (cb, opts) {
    return computeArray(this, map, cb, opts);
};

// --- reduce ---

// --- reduce ---

/**
 * @template T, U
 * @param {Array<T>} source
 * @param {U} seed
 * @param {*} arg
 * @returns {U}
 */
function reduce1(source, seed, arg) {
    let cb = /** @type {function(U, T, number, Array<T>): U} */(arg);
    return /** @type {U} */(source.reduce(cb));
}

/**
 * @template T, U
 * @param {Array<T>} source
 * @param {U} seed
 * @param {*} args
 * @returns {U}
 */
function reduce2(source, seed, args) {
    let arr = /** @type {!Array<*>} */(args);
    let cb = /** @type {function(U, T, number, Array<T>): U} */(arr[0]);
    let initialValue = /** @type {U} */(getVal(arr[1]));
    return source.reduce(cb, initialValue);
}

/**
 * @template T,U
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @param {function(U, T, number, Array<T>): U} cb 
 * @param {U | ReadonlySignal<U>=} initialValue
 * @param {number=} opts
 * @returns {Compute<U, Array<T>, null, *>}
 */
SignalProto.reduce = ComputeProto.reduce = function (cb, initialValue, opts) {
    let unstable = opts !== OPT_STABLE;
    if (arguments.length === 1) {
        return /** @type {Compute<U, Array<T>, null, *>} */(
            computeArray(this, reduce1, /** @type {*} */(cb), opts)
        );
    }
    unstable = unstable || isSignal(initialValue);
    return computeArray(this, reduce2, /** @type {*} */([cb, initialValue]), opts);
};


// --- reduceRight ---

/**
 * @template T, U
 * @param {Array<T>} source
 * @param {U} seed
 * @param {*} arg
 * @returns {U}
 */
function reduceRight1(source, seed, arg) {
    let cb = /** @type {function(U, T, number, Array<T>): U} */(arg);
    return /** @type {U} */(source.reduceRight(cb));
}

/**
 * @template T, U
 * @param {Array<T>} source
 * @param {U} seed
 * @param {*} args
 * @returns {U}
 */
function reduceRight2(source, seed, args) {
    let arr = /** @type {!Array<*>} */(args);
    let cb = /** @type {function(U, T, number, Array<T>): U} */(arr[0]);
    let initialValue = /** @type {U} */(getVal(arr[1]));
    return source.reduceRight(cb, initialValue);
}

/**
 * @template T,U
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @param {function(U, T, number, Array<T>): U} cb 
 * @param {U | ReadonlySignal<U>=} initialValue
 * @param {number=} opts
 * @returns {Compute<U, Array<T>, null, *>}
 */
SignalProto.reduceRight = ComputeProto.reduceRight = function (cb, initialValue, opts) {
    let unstable = opts !== OPT_STABLE;
    if (arguments.length === 1) {
        return /** @type {Compute<U, Array<T>, null, *>} */(
            computeArray(this, reduceRight1, /** @type {*} */(cb), opts)
        );
    }
    unstable = unstable || isSignal(initialValue);
    return computeArray(this, reduceRight2, /** @type {*} */([cb, initialValue]), opts);
};

// --- slice ---

/**
 * @template T
 * @param {Array<T>} source
 * @param {Array<T>} seed
 * @param {*} args
 * @returns {Array<T>}
 */
function slice0(source, seed, args) {
    return source.slice();
}

/**
 * @template T
 * @param {Array<T>} source
 * @param {Array<T>} seed
 * @param {*} arg
 * @returns {Array<T>}
 */
function slice1(source, seed, arg) {
    return source.slice(/** @type {number} */(getVal(arg)));
}

/**
 * @template T
 * @param {Array<T>} source
 * @param {Array<T>} seed
 * @param {*} args
 * @returns {Array<T>}
 */
function slice2(source, seed, args) {
    let arr = /** @type {!Array<*>} */(args);
    return source.slice(/** @type {number} */(getVal(arr[0])), /** @type {number} */(getVal(arr[1])));
}

/**
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @param {number | ReadonlySignal<number> | (function(): number)=} start 
 * @param {number | ReadonlySignal<number> | (function(): number)=} end 
 * @returns {Compute<Array<T>, Array<T>, null, *>}
 */
SignalProto.slice = ComputeProto.slice = function (start, end) {
    let len = arguments.length;
    if (len === 0) {
        return computeArray(this, slice0, void 0);
    } else if (len === 1) {
        return computeArray(this, slice1, start, 0);
    }
    let unstable = isSignal(start) || isSignal(end);
    return computeArray(this, slice2, /** @type {*} */([start, end]), 0);
};


// --- some ---

/**
 * @template T
 * @param {Array<T>} source
 * @param {boolean} seed
 * @param {function(T, number, Array<T>): boolean} cb
 * @returns {boolean}
 */
function some(source, seed, cb) {
    return source.some(cb);
}

/**
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @param {function(T, number, Array<T>): boolean} cb 
 * @param {number=} opts
 * @returns {Compute<boolean, Array<T>, null, function(T, number, Array<T>): boolean>}
 */
SignalProto.some = ComputeProto.some = function (cb, opts) {
    return computeArray(this, some, cb, opts);
};


// --- values ---

/**
 * @template T
 * @param {Array<T>} source
 * @param {!IteratorIterable<T>} seed
 * @param {undefined=} args
 * @returns {!IteratorIterable<T>}
 */
function values(source, seed, args) {
    return source.values();
}

/**
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @returns {Compute<!IteratorIterable<T>, Array<T>, null, undefined>}
 */
SignalProto.values = ComputeProto.values = function () {
    return computeArray(this, values, void 0);
};

/**
 * @this {Signal<Array<T>>}
 * @param {number} target
 * @param {number} start
 * @param {number=} end
 * @returns {void}
 */
SignalProto.copyWithin = function (target, start, end) {
    if (CLOCK._state & STATE_IDLE) {
        this._value.copyWithin(target, start, end)
        notify(this);
    } else {
        scheduleSignal(this, OP_COPY_WITHIN, [target, start, end]);
    }
};

/**
 * @template T
 * @this {Signal<Array<T>>}
 * @param {T} value
 * @param {number=} start
 * @param {number=} end
 * @returns {void}
 */
SignalProto.fill = function (value, start, end) {
    if (CLOCK._state & STATE_IDLE) {
        this._value.fill(value, start, end);
        notify(this);
    } else {
        if (arguments.length === 1) {
            scheduleSignal(this, OP_FILL, value);
        } else {
            scheduleSignal(this, OP_FILL_RANGE, [value, start, end]);
        }
    }
};

/**
 * @template T
 * @this {Signal<Array<T>>}
 * @returns {void}
 */
SignalProto.pop = function () {
    if (CLOCK._state & STATE_IDLE) {
        this._value.pop();
        notify(this);
    } else {
        scheduleSignal(this, OP_POP, null);
    }
};

/**
 * @template T
 * @this {Signal<Array<T>>}
 * @param  {...T} items
 * @returns {void} 
 */
SignalProto.push = function (...items) {
    let len = items.length;
    if (len > 0) {
        if (CLOCK._state & STATE_IDLE) {
            if (len === 1) {
                this._value.push(items[0]);
            } else {
                this._value.push(...items);
            }
            notify(this);
        } else {
            if (len === 1) {
                scheduleSignal(this, OP_PUSH, items[0]);
            } else {
                scheduleSignal(this, OP_PUSH_ARRAY, items);
            }
        }
    }
};

/**
 * @template T
 * @this {Signal<Array<T>>}
 * @returns {void}
 */
SignalProto.reverse = function () {
    if (CLOCK._state & STATE_IDLE) {
        this._value.reverse();
        notify(this);
    } else {
        scheduleSignal(this, OP_REVERSE, null);
    }
};

/**
 * @template T
 * @this {Signal<Array<T>>}
 * @returns {void}
 */
SignalProto.shift = function () {
    if (CLOCK._state & STATE_IDLE) {
        this._value.shift();
        notify(this);
    } else {
        scheduleSignal(this, OP_SHIFT, null);
    }
};

/**
 * @template T
 * @this {Signal<Array<T>>}
 * @param {function(T,T): number=} compareFn
 * @returns {void}
 */
SignalProto.sort = function (compareFn) {
    if (CLOCK._state & STATE_IDLE) {
        this._value.sort(compareFn);
        notify(this);
    } else {
        scheduleSignal(this, OP_SORT, compareFn);
    }
};

/**
 * @template T
 * @this {Signal<Array<T>>}
 * @param {number} start
 * @param {number=} deleteCount
 * @param {...T} items
 * @returns {void}
 */
SignalProto.splice = function (start, deleteCount, ...items) {
    if (CLOCK._state & STATE_IDLE) {
        let value = this._value;
        if (items.length === 0) {
            if (arguments.length === 1) {
                value.splice(start);
            } else {
                value.splice(start, deleteCount);
            }
        } else {
            value.splice(start, deleteCount, ...items);
        }
        notify(this);
    } else {
        scheduleSignal(this, OP_SPLICE, [start, deleteCount, items]);
    }
};

/**
 * @template T
 * @this {Signal<Array<T>>}
 * @param {...T} items
 * @returns {void}
 */
SignalProto.unshift = function (...items) {
    let len = items.length;
    if (len > 0) {
        if (CLOCK._state & STATE_IDLE) {
            if (len === 1) {
                this._value.unshift(items[0]);
            } else {
                this._value.unshift(...items);
            }
            notify(this);
        } else {
            if (len === 1) {
                scheduleSignal(this, OP_UNSHIFT, items[0]);
            } else {
                scheduleSignal(this, OP_UNSHIFT_ARRAY, items);
            }
        }
    }
};

/**
 * @template T
 * @param {!Array<T>} value
 * @returns {Signal<!Array<T>>}
 */
function list(value) {
    return new Signal(value, FLAG_LIST);
}

export { list }