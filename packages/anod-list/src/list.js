// 1. Destructure the RUNTIME variables from the fake globals
import {
    Signal, Compute, Effect, OPT_SETUP, OPT_STABLE
} from 'anod';

import {
    CLOCK, STATE_IDLE,
    FLAG_STALE, FLAG_INIT,
    register, notify, scheduleSignal,
    MUT_ADD, MUT_DEL, MUT_SORT,
    MUT_OP_MASK, MUT_LEN_SHIFT, MUT_LEN_MASK, MUT_POS_SHIFT, MUT_POS_MASK,
    isPrimitive, isFunction, isSignal
} from 'anod/internal';

/** @const */
var SignalProto = Signal.prototype;
/** @const */
var ComputeProto = Compute.prototype;

/**
 * @returns {number}
 */
ComputeProto.mod = function() {
    return this._dep1._mod;
};

/**
 * Registered mutation callbacks. Each receives the signal node and a payload,
 * applies the in-place array mutation, then lets the transaction loop handle
 * the stale notification.
 */
/**
 * Encodes a mutation descriptor into _mod (32-bit unsigned).
 * @param {number} op
 * @param {number} pos
 * @param {number} len
 * @returns {number}
 */
function encodeMod(op, pos, len) {
    return (op | (len << MUT_LEN_SHIFT) | (pos << MUT_POS_SHIFT)) >>> 0;
}

/**
 * Sets _mod on a signal node inside a batched OP callback.
 * If FLAG_STALE is set this is the first mutation this cycle
 * and we can encode the mod.  Otherwise a second mutation
 * already occurred and we fall back to 0 (full recompute).
 * @param {Signal} node
 * @param {number} mod
 * @returns {void}
 */
function setMod(node, mod) {
    if (node._flag & FLAG_STALE) {
        node._mod = mod;
    } else {
        node._mod = 0;
    }
}

/** @const {number} */ var OP_COPY_WITHIN = register(function (node, args) {
    node._value.copyWithin(args[0], args[1], args[2]);
    node._mod = 0;
});
/** @const {number} */ var OP_FILL = register(function (node, value) {
    node._value.fill(value);
    node._mod = 0;
});
/** @const {number} */ var OP_FILL_RANGE = register(function (node, args) {
    node._value.fill(args[0], args[1], args[2]);
    node._mod = 0;
});
/** @const {number} */ var OP_POP = register(function (node) {
    node._value.pop();
    setMod(node, encodeMod(MUT_DEL, node._value.length, 1));
});
/** @const {number} */ var OP_PUSH = register(function (node, value) {
    let arr = node._value;
    let pos = arr.length;
    arr.push(value);
    setMod(node, encodeMod(MUT_ADD, pos, 1));
});
/** @const {number} */ var OP_PUSH_ARRAY = register(function (node, items) {
    let arr = node._value;
    let pos = arr.length;
    arr.push(...items);
    setMod(node, encodeMod(MUT_ADD, pos, items.length));
});
/** @const {number} */ var OP_REVERSE = register(function (node) {
    node._value.reverse();
    setMod(node, encodeMod(MUT_SORT, 0, 0));
});
/** @const {number} */ var OP_SHIFT = register(function (node) {
    node._value.shift();
    setMod(node, encodeMod(MUT_DEL, 0, 1));
});
/** @const {number} */ var OP_SORT = register(function (node, compareFn) {
    node._value.sort(compareFn);
    setMod(node, encodeMod(MUT_SORT, 0, 0));
});
/** @const {number} */ var OP_SPLICE = register(function (node, args) {
    let arr = node._value;
    let start = args[0];
    let delCount = args[1];
    let items = args[2];
    /** Normalize negative start */
    let pos = start < 0 ? Math.max(0, arr.length + start) : Math.min(start, arr.length);
    if (items.length === 0) {
        if (delCount === void 0) {
            delCount = arr.length - pos;
            arr.splice(start);
        } else {
            arr.splice(start, delCount);
        }
    } else {
        arr.splice(start, delCount, ...items);
    }
    let addLen = items.length;
    let op = (delCount > 0 ? MUT_DEL : 0) | (addLen > 0 ? MUT_ADD : 0);
    let len = Math.max(delCount, addLen);
    setMod(node, op > 0 ? encodeMod(op, pos, len) : 0);
});
/** @const {number} */ var OP_UNSHIFT = register(function (node, value) {
    node._value.unshift(value);
    setMod(node, encodeMod(MUT_ADD, 0, 1));
});
/** @const {number} */ var OP_UNSHIFT_ARRAY = register(function (node, items) {
    node._value.unshift(...items);
    setMod(node, encodeMod(MUT_ADD, 0, items.length));
});

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
function at(_node, source, seed, args) {
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
function concat(_node, source, seed, args) {
    return source.concat(args);
}

/**
 * @template T
 * @param {Array<T>} source
 * @param {Array<T>} seed
 * @param {*} args
 * @returns {Array<T>}
 */
function concatN(_node, source, seed, args) {
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
function entries(_node, source) {
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
function every(_node, source, prev, cb) {
    if (!(_node._flag & FLAG_INIT)) {
        let mod = _node.mod();
        if (mod > 0) {
            let op = mod & MUT_OP_MASK;
            if (prev === true) {
                if (!(op & (MUT_ADD | MUT_SORT))) {
                    /** Only DEL: removing from an all-true set stays all-true */
                    return true;
                }
                if (!(op & MUT_SORT) && cb.length <= 1) {
                    /**
                     * ADD (possibly with DEL), callback ignores index.
                     * Existing items still pass — only check modified region.
                     */
                    let pos = (mod >>> MUT_POS_SHIFT) & MUT_POS_MASK;
                    let len = (mod >>> MUT_LEN_SHIFT) & MUT_LEN_MASK;
                    let end = Math.min(pos + len, source.length);
                    for (let i = pos; i < end; i++) {
                        if (!cb(source[i])) {
                            return false;
                        }
                    }
                    return true;
                }
            }
            if (prev === false && !(op & (MUT_DEL | MUT_SORT)) && cb.length <= 1) {
                /** Only ADD + callback ignores index: failing item still present */
                return false;
            }
        }
    }
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
function filter(_node, source, seed, cb) {
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
function find(_node, source, seed, cb) { return source.find(cb); }

/**
 * @template T
 * @param {Array<T>} source
 * @param {T | undefined} seed
 * @param {{ _val: function(T, number, Array<T>): boolean, _idx: number }} args
 * @returns {T|undefined}
 */
function find_mut(_node, source, prev, args) {
    if (!(_node._flag & FLAG_INIT)) {
        let mod = _node.mod();
        if (mod > 0) {
            let op = mod & MUT_OP_MASK;
            let pos = (mod >>> MUT_POS_SHIFT) & MUT_POS_MASK;
            let len = (mod >>> MUT_LEN_SHIFT) & MUT_LEN_MASK;
            let idx = args._idx;
            if (op & MUT_SORT) {
                /* noop — fall through */
            } else if (idx >= 0) {
                if (pos > idx) {
                    return prev;
                }
                if (op === MUT_DEL && pos + len <= idx) {
                    args._idx = idx - len;
                    return source[idx - len];
                }
                if (op === MUT_ADD && args._val.length <= 1) {
                    /** Check new region for earlier match */
                    let end = Math.min(pos + len, source.length);
                    for (let i = pos; i < end; i++) {
                        if (args._val(source[i])) {
                            args._idx = i;
                            return source[i];
                        }
                    }
                    args._idx = idx + len;
                    return source[idx + len];
                }
            } else {
                /** Previously not found (idx === -1) */
                if (!(op & MUT_ADD)) {
                    return void 0;
                }
                if (args._val.length <= 1) {
                    let end = Math.min(pos + len, source.length);
                    for (let i = pos; i < end; i++) {
                        if (args._val(source[i])) {
                            args._idx = i;
                            return source[i];
                        }
                    }
                    return void 0;
                }
            }
        }
    }
    let idx = source.findIndex(args._val);
    args._idx = idx;
    return idx >= 0 ? source[idx] : void 0;
}

/**
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @param {function(T, number): boolean} cb
 * @param {number=} opts
 * @param {boolean=} mutation
 * @returns {Compute<T|undefined,Array<T>,null,(function(T, number): boolean)>}
 */
SignalProto.find = ComputeProto.find = function (cb, opts, mutation) {
    if (mutation) {
        return computeArray(this, find_mut, { _val: cb, _idx: -1 }, opts);
    }
    return computeArray(this, find, cb, opts);
};

/**
 * @template T
 * @param {Array<T>} source
 * @param {number} seed
 * @param {function(T, number, Array<T>): boolean} cb
 * @returns {number}
 */
function findIndex(_node, source, seed, cb) { return source.findIndex(cb); }

/**
 * @template T
 * @param {Array<T>} source
 * @param {number} seed
 * @param {function(T, number, Array<T>): boolean} cb
 * @returns {number}
 */
function findIndex_mut(_node, source, prev, cb) {
    if (!(_node._flag & FLAG_INIT)) {
        let mod = _node.mod();
        if (mod > 0) {
            let op = mod & MUT_OP_MASK;
            let pos = (mod >>> MUT_POS_SHIFT) & MUT_POS_MASK;
            let len = (mod >>> MUT_LEN_SHIFT) & MUT_LEN_MASK;
            if (op & MUT_SORT) {
                /* noop — fall through */
            } else if (prev >= 0) {
                if (pos > prev) {
                    return prev;
                }
                if (op === MUT_DEL) {
                    if (pos + len <= prev) {
                        return prev - len;
                    }
                } else if (op === MUT_ADD && cb.length <= 1) {
                    /** Check new region for earlier match */
                    let end = Math.min(pos + len, source.length);
                    for (let i = pos; i < end; i++) {
                        if (cb(source[i])) {
                            return i;
                        }
                    }
                    return prev + len;
                }
            } else if (prev === -1) {
                if (!(op & MUT_ADD)) {
                    return -1;
                }
                if (cb.length <= 1) {
                    /** Check only new region */
                    let end = Math.min(pos + len, source.length);
                    for (let i = pos; i < end; i++) {
                        if (cb(source[i])) {
                            return i;
                        }
                    }
                    return -1;
                }
            }
        }
    }
    return source.findIndex(cb);
}

/**
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @param {function(T, number): boolean} cb
 * @param {number=} opts
 * @param {boolean=} mutation
 * @returns {Compute<number,Array<T>,null,(function(T, number): boolean)>}
 */
SignalProto.findIndex = ComputeProto.findIndex = function (cb, opts, mutation) {
    return computeArray(this, mutation ? findIndex_mut : findIndex, cb, opts);
};

/**
 * @template T
 * @param {Array<T>} source
 * @param {T | undefined} seed
 * @param {function(T, number, Array<T>): boolean} cb
 * @returns {T | undefined}
 */
function findLast(_node, source, seed, cb) { return source.findLast(cb); }

/**
 * @template T
 * @param {Array<T>} source
 * @param {T | undefined} seed
 * @param {{ _val: function(T, number, Array<T>): boolean, _idx: number }} args
 * @returns {T | undefined}
 */
function findLast_mut(_node, source, prev, args) {
    if (!(_node._flag & FLAG_INIT)) {
        let mod = _node.mod();
        if (mod > 0) {
            let op = mod & MUT_OP_MASK;
            let pos = (mod >>> MUT_POS_SHIFT) & MUT_POS_MASK;
            let len = (mod >>> MUT_LEN_SHIFT) & MUT_LEN_MASK;
            let idx = args._idx;
            if (op & MUT_SORT) {
                /* noop — fall through */
            } else if (idx >= 0) {
                if (op === MUT_DEL && pos > idx) {
                    /** Deletion after last-found — unaffected */
                    return prev;
                }
                if (op === MUT_ADD && args._val.length <= 1) {
                    /**
                     * Check new region for a later match. For findLast
                     * we want the LAST match, so scan new region and
                     * compare with shifted previous.
                     */
                    let end = Math.min(pos + len, source.length);
                    let shiftedIdx = pos <= idx ? idx + len : idx;
                    let lastFound = shiftedIdx;
                    let lastVal = source[shiftedIdx];
                    for (let i = pos; i < end; i++) {
                        if (args._val(source[i]) && i > lastFound) {
                            lastFound = i;
                            lastVal = source[i];
                        }
                    }
                    args._idx = lastFound;
                    return lastVal;
                }
            } else {
                if (!(op & MUT_ADD)) {
                    return void 0;
                }
                if (args._val.length <= 1) {
                    let end = Math.min(pos + len, source.length);
                    let lastFound = -1;
                    let lastVal = void 0;
                    for (let i = pos; i < end; i++) {
                        if (args._val(source[i])) {
                            lastFound = i;
                            lastVal = source[i];
                        }
                    }
                    args._idx = lastFound;
                    return lastVal;
                }
            }
        }
    }
    let idx = source.findLastIndex(args._val);
    args._idx = idx;
    return idx >= 0 ? source[idx] : void 0;
}

/**
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @param {function(T, number, Array<T>): boolean} cb
 * @param {number=} opts
 * @param {boolean=} mutation
 * @returns {Compute<T|undefined,Array<T>,null,(function(T, number, Array<T>): boolean)>}
 */
SignalProto.findLast = ComputeProto.findLast = function (cb, opts, mutation) {
    if (mutation) {
        return computeArray(this, findLast_mut, { _val: cb, _idx: -1 }, opts);
    }
    return computeArray(this, findLast, cb, opts);
};

/**
 * @template T
 * @param {Array<T>} source
 * @param {number} seed
 * @param {function(T, number, Array<T>): boolean} cb
 * @returns {number}
 */
function findLastIndex(_node, source, seed, cb) { return source.findLastIndex(cb); }

/**
 * @template T
 * @param {Array<T>} source
 * @param {number} seed
 * @param {function(T, number, Array<T>): boolean} cb
 * @returns {number}
 */
function findLastIndex_mut(_node, source, prev, cb) {
    if (!(_node._flag & FLAG_INIT)) {
        let mod = _node.mod();
        if (mod > 0) {
            let op = mod & MUT_OP_MASK;
            let pos = (mod >>> MUT_POS_SHIFT) & MUT_POS_MASK;
            let len = (mod >>> MUT_LEN_SHIFT) & MUT_LEN_MASK;
            if (op & MUT_SORT) {
                /* noop — fall through */
            } else if (prev >= 0) {
                if (op === MUT_DEL && pos > prev) {
                    return prev;
                }
                if (op === MUT_DEL && pos + len <= prev) {
                    return prev - len;
                }
                if (op === MUT_ADD && cb.length <= 1) {
                    let end = Math.min(pos + len, source.length);
                    let shiftedPrev = pos <= prev ? prev + len : prev;
                    let lastFound = shiftedPrev;
                    for (let i = pos; i < end; i++) {
                        if (cb(source[i]) && i > lastFound) {
                            lastFound = i;
                        }
                    }
                    return lastFound;
                }
            } else if (prev === -1) {
                if (!(op & MUT_ADD)) {
                    return -1;
                }
                if (cb.length <= 1) {
                    let end = Math.min(pos + len, source.length);
                    let lastFound = -1;
                    for (let i = pos; i < end; i++) {
                        if (cb(source[i])) {
                            lastFound = i;
                        }
                    }
                    return lastFound;
                }
            }
        }
    }
    return source.findLastIndex(cb);
}

/**
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @param {function(T, number, Array<T>): boolean} cb
 * @param {number=} opts
 * @param {boolean=} mutation
 * @returns {Compute<number,Array<T>,null,(function(T, number, Array<T>): boolean)>}
 */
SignalProto.findLastIndex = ComputeProto.findLastIndex = function (cb, opts, mutation) {
    return computeArray(this, mutation ? findLastIndex_mut : findLastIndex, cb, opts);
};

/**
 * @template T
 * @param {Array<T>} source
 * @param {Array<T>} seed
 * @param {number | ReadonlySignal<number> | (function(): number)=} depth
 * @returns {!Array<T>}
 */
function flat(_node, source, seed, depth) {
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
function flatMap(_node, source, seed, cb) {
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
function forEach(_node, source, cb) {
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
function includes1(_node, source, seed, arg) {
    return source.includes(/** @type {T} */(getVal(arg)));
}

/**
 * Mutation-aware includes. Tracks the internal found-index in args._idx.
 * @template T
 * @param {Array<T>} source
 * @param {boolean} seed
 * @param {{ _val: *, _idx: number }} args
 * @returns {boolean}
 */
function includes1_mut(_node, source, prev, args) {
    if (!(_node._flag & FLAG_INIT)) {
        let mod = _node.mod();
        if (mod > 0) {
            let op = mod & MUT_OP_MASK;
            let pos = (mod >>> MUT_POS_SHIFT) & MUT_POS_MASK;
            let len = (mod >>> MUT_LEN_SHIFT) & MUT_LEN_MASK;
            let idx = args._idx;
            if (op & MUT_SORT) {
                /* noop — fall through */
            } else if (idx >= 0) {
                if (pos > idx) {
                    /** Mutation after found position — unaffected */
                    return true;
                }
                if (op === MUT_DEL) {
                    if (pos + len <= idx) {
                        /** Deletion before found — shift index, still included */
                        args._idx = idx - len;
                        return true;
                    }
                    /** Deletion overlaps — recompute */
                } else if (op === MUT_ADD) {
                    /** Check new region for target first */
                    let target = getVal(args._val);
                    let end = Math.min(pos + len, source.length);
                    for (let i = pos; i < end; i++) {
                        if (source[i] === target) {
                            args._idx = i;
                            return true;
                        }
                    }
                    /** Still at shifted position */
                    args._idx = idx + len;
                    return true;
                }
            } else {
                /** Previously not found (idx === -1) */
                if (!(op & MUT_ADD)) {
                    /** Only deletions — still not found */
                    return false;
                }
                /** Check only new region */
                let target = getVal(args._val);
                let end = Math.min(pos + len, source.length);
                for (let i = pos; i < end; i++) {
                    if (source[i] === target) {
                        args._idx = i;
                        return true;
                    }
                }
                return false;
            }
        }
    }
    let idx = source.indexOf(/** @type {T} */(getVal(args._val)));
    args._idx = idx;
    return idx >= 0;
}

/**
 * @template T
 * @param {Array<T>} source
 * @param {boolean} seed
 * @param {*} args
 * @returns {boolean}
 */
function includes2(_node, source, seed, args) {
    let arr = /** @type {!Array<*>} */(args);
    return source.includes(/** @type {T} */(getVal(arr[0])), /** @type {number} */(getVal(arr[1])));
}

/**
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @param {*} searchElement 
 * @param {number | ReadonlySignal<number> | (function(): number)=} fromIndex
 * @returns {Compute<boolean,Array<T>,null,*>}
 */
SignalProto.includes = ComputeProto.includes = function (searchElement, fromIndex, mutation) {
    if (typeof fromIndex === 'boolean') {
        mutation = fromIndex;
        fromIndex = void 0;
    }
    if (fromIndex === void 0) {
        if (mutation) {
            return computeArray(this, includes1_mut, { _val: searchElement, _idx: -1 }, 0);
        }
        return computeArray(this, includes1, searchElement, isSignal(searchElement) ? OPT_SETUP : 0);
    }
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
function indexOf1(_node, source, seed, arg) {
    return source.indexOf(/** @type {T} */(getVal(arg)));
}

/**
 * Mutation-aware indexOf. Skips full scan when the mutation
 * is after the previously found index.
 * @template T
 * @param {Array<T>} source
 * @param {number} seed
 * @param {*} arg
 * @returns {number}
 */
function indexOf1_mut(_node, source, prev, arg) {
    if (!(_node._flag & FLAG_INIT)) {
        let mod = _node.mod();
        if (mod > 0) {
            let op = mod & MUT_OP_MASK;
            let pos = (mod >>> MUT_POS_SHIFT) & MUT_POS_MASK;
            let len = (mod >>> MUT_LEN_SHIFT) & MUT_LEN_MASK;
            if (op & MUT_SORT) {
                /* noop — fall through to full recompute */
            } else if (prev >= 0) {
                if (pos > prev) {
                    /** Mutation entirely after found index — unaffected */
                    return prev;
                }
                if (op === MUT_DEL) {
                    if (pos + len <= prev) {
                        /** Deletion entirely before found — shift left */
                        return prev - len;
                    }
                    /** Deletion overlaps found position — recompute */
                } else if (op === MUT_ADD) {
                    /** Check new items; if target is there return earlier index */
                    let target = getVal(arg);
                    let end = Math.min(pos + len, source.length);
                    for (let i = pos; i < end; i++) {
                        if (source[i] === target) {
                            return i;
                        }
                    }
                    /** Not in new region — original shifted right */
                    return prev + len;
                }
            } else if (prev === -1) {
                if (!(op & MUT_ADD)) {
                    /** Only deletions — still not found */
                    return -1;
                }
                /** Items added — check only the new region */
                let target = getVal(arg);
                let end = Math.min(pos + len, source.length);
                for (let i = pos; i < end; i++) {
                    if (source[i] === target) {
                        return i;
                    }
                }
                return -1;
            }
        }
    }
    return source.indexOf(/** @type {T} */(getVal(arg)));
}

/**
 * @template T
 * @param {Array<T>} source
 * @param {number} seed
 * @param {*} args
 * @returns {number}
 */
function indexOf2(_node, source, seed, args) {
    let arr = /** @type {!Array<*>} */(args);
    return source.indexOf(/** @type {T} */(getVal(arr[0])), /** @type {number} */(getVal(arr[1])));
}

/**
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @param {*} searchElement 
 * @param {number | ReadonlySignal<number> | (function(): number)=} fromIndex
 * @returns {Compute<number, Array<T>, null, *>}
 */
SignalProto.indexOf = ComputeProto.indexOf = function (searchElement, fromIndex, mutation) {
    if (typeof fromIndex === 'boolean') {
        mutation = fromIndex;
        fromIndex = void 0;
    }
    if (fromIndex === void 0) {
        let fn = mutation ? indexOf1_mut : indexOf1;
        return computeArray(this, fn, searchElement, isSignal(searchElement) ? OPT_SETUP : 0);
    }
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
function join(_node, source, seed, separator) {
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
function keys(_node, source, seed, args) {
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
function map(_node, source, seed, cb) {
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
function reduce1(_node, source, seed, arg) {
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
function reduce2(_node, source, seed, args) {
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
function reduceRight1(_node, source, seed, arg) {
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
function reduceRight2(_node, source, seed, args) {
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
function slice0(_node, source, seed, args) {
    return source.slice();
}

/**
 * @template T
 * @param {Array<T>} source
 * @param {Array<T>} seed
 * @param {*} arg
 * @returns {Array<T>}
 */
function slice1(_node, source, seed, arg) {
    return source.slice(/** @type {number} */(getVal(arg)));
}

/**
 * @template T
 * @param {Array<T>} source
 * @param {Array<T>} seed
 * @param {*} args
 * @returns {Array<T>}
 */
function slice2(_node, source, seed, args) {
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
function some(_node, source, prev, cb) {
    if (!(_node._flag & FLAG_INIT)) {
        let mod = _node.mod();
        if (mod > 0) {
            let op = mod & MUT_OP_MASK;
            if (prev === false) {
                if (!(op & (MUT_ADD | MUT_SORT))) {
                    /** Only DEL: removing items can't make some() true */
                    return false;
                }
                if (!(op & MUT_SORT) && cb.length <= 1) {
                    /**
                     * ADD (possibly with DEL), callback ignores index.
                     * Existing items still don't match — check modified region.
                     */
                    let pos = (mod >>> MUT_POS_SHIFT) & MUT_POS_MASK;
                    let len = (mod >>> MUT_LEN_SHIFT) & MUT_LEN_MASK;
                    let end = Math.min(pos + len, source.length);
                    for (let i = pos; i < end; i++) {
                        if (cb(source[i])) {
                            return true;
                        }
                    }
                    return false;
                }
            }
            if (prev === true && !(op & (MUT_DEL | MUT_SORT)) && cb.length <= 1) {
                /** Only ADD + callback ignores index: matching item still present */
                return true;
            }
        }
    }
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
function values(_node, source, seed, args) {
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
        this._value.copyWithin(target, start, end);
        this._mod = 0;
        notify(this);
    } else {
        this._flag |= FLAG_STALE;
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
        this._mod = 0;
        notify(this);
    } else {
        this._flag |= FLAG_STALE;
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
        this._mod = encodeMod(MUT_DEL, this._value.length, 1);
        notify(this);
    } else {
        this._flag |= FLAG_STALE;
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
        let arr = this._value;
        let pos = arr.length;
        if (CLOCK._state & STATE_IDLE) {
            if (len === 1) {
                arr.push(items[0]);
            } else {
                arr.push(...items);
            }
            this._mod = encodeMod(MUT_ADD, pos, len);
            notify(this);
        } else {
            this._flag |= FLAG_STALE;
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
        this._mod = encodeMod(MUT_SORT, 0, 0);
        notify(this);
    } else {
        this._flag |= FLAG_STALE;
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
        this._mod = encodeMod(MUT_DEL, 0, 1);
        notify(this);
    } else {
        this._flag |= FLAG_STALE;
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
        this._mod = encodeMod(MUT_SORT, 0, 0);
        notify(this);
    } else {
        this._flag |= FLAG_STALE;
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
        let arr = this._value;
        let pos = start < 0 ? Math.max(0, arr.length + start) : Math.min(start, arr.length);
        if (items.length === 0) {
            if (arguments.length === 1) {
                deleteCount = arr.length - pos;
                arr.splice(start);
            } else {
                arr.splice(start, deleteCount);
            }
        } else {
            arr.splice(start, deleteCount, ...items);
        }
        let addLen = items.length;
        let op = (deleteCount > 0 ? MUT_DEL : 0) | (addLen > 0 ? MUT_ADD : 0);
        this._mod = op > 0 ? encodeMod(op, pos, Math.max(deleteCount, addLen)) : 0;
        notify(this);
    } else {
        this._flag |= FLAG_STALE;
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
            this._mod = encodeMod(MUT_ADD, 0, len);
            notify(this);
        } else {
            this._flag |= FLAG_STALE;
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
    return new Signal(value);
}

export { list }