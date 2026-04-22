import {
    OPT_SETUP, OPT_STABLE
} from '@fyren/core';

import {
    Signal, Compute, Effect,
    IDLE,
    FLAG_STALE, FLAG_INIT, FLAG_BOUND, FLAG_SCHEDULED, OPT_DEFER,
    connect, schedule, notify, flush,
    startEffect, startCompute, signal
} from '@fyren/core/internal';

/**
 * Mutation tracking — encoded in the Signal's _flag, bits 6-31.
 * Bits 0-5 are reserved for sender flags (core).
 *
 *   Bits  6– 8 : op type   (MUT_ADD=1, MUT_DEL=2, MUT_SORT=4)
 *   Bits  9–14 : length    (6 bits, max 63)
 *   Bits 15–31 : position  (17 bits, max 131071)
 *
 * The op/len/mask constants are relative to the encoded value
 * AFTER shifting right by 6 (stripping sender flags).
 */
const MOD_SHIFT = 6;
const MUT_ADD = 1;
const MUT_DEL = 2;
const MUT_SORT = 4;
const MUT_OP_MASK = 7;
const MUT_LEN_SHIFT = 3;
const MUT_LEN_MASK = 0x3F;
const MUT_POS_SHIFT = 9;
const MUT_POS_MASK = 0x1FFFF;

/** @const */
var SignalProto = Signal.prototype;
/** @const */
var ComputeProto = Compute.prototype;

/**
 * Reads the mutation descriptor from dep1's _flag (bits 6+).
 * Returns 0 if no mutation encoded (full recompute).
 * @this {!Compute}
 * @returns {number}
 */
ComputeProto._getMod = function () {
    return this._dep1._flag >>> MOD_SHIFT;
};

/**
 * Encodes a mutation descriptor into the upper bits of _flag.
 * @param {number} op
 * @param {number} pos
 * @param {number} len
 * @returns {number}
 */
function encode(op, pos, len) {
    return ((op | (len << MUT_LEN_SHIFT) | (pos << MUT_POS_SHIFT)) << MOD_SHIFT) >>> 0;
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
/** Sender flag mask — preserve bits 0-5, clear mod bits 6+. */
const FLAG_SENDER_MASK = 0x3F;

/**
 * Sets mod on the signal, notifies, and flushes. The mod bits
 * persist until the next mutation overwrites them.
 * @param {!Signal} node
 * @param {number} mod - pre-encoded mod (already shifted)
 */
function modify(node, mod) {
    node._flag = (node._flag & FLAG_SENDER_MASK) | mod;
    notify(node, FLAG_STALE);
    flush();
}

/**
 * Sets mod bits on the signal and notifies if FLAG_SCHEDULED.
 * @param {!Signal} node
 * @param {number} mod - pre-encoded mod (already shifted by MOD_SHIFT)
 */
function setMod(node, mod) {
    if (node._flag & FLAG_SCHEDULED) {
        node._flag = (node._flag & FLAG_SENDER_MASK & ~FLAG_SCHEDULED) | mod;
        notify(node, FLAG_STALE);
    }
}

/**
 * Batched array mutation handlers. Each mutates the array in-place,
 * encodes the mod into _flag bits 6+, and notifies subscribers.
 */
function push(node, value) {
    let pos = node._value.length;
    node._value.push(value);
    setMod(node, encode(MUT_ADD, pos, 1));
}
function pushArray(node, items) {
    let pos = node._value.length;
    node._value.push(...items);
    setMod(node, encode(MUT_ADD, pos, items.length));
}
function pop(node) {
    node._value.pop();
    setMod(node, encode(MUT_DEL, node._value.length, 1));
}
function shift(node) {
    node._value.shift();
    setMod(node, encode(MUT_DEL, 0, 1));
}
function unshift(node, value) {
    node._value.unshift(value);
    setMod(node, encode(MUT_ADD, 0, 1));
}
function unshiftArray(node, items) {
    node._value.unshift(...items);
    setMod(node, encode(MUT_ADD, 0, items.length));
}
function reverse(node) {
    node._value.reverse();
    setMod(node, encode(MUT_SORT, 0, 0));
}
function sort(node, compareFn) {
    node._value.sort(compareFn);
    setMod(node, encode(MUT_SORT, 0, 0));
}
function fill(node, value) {
    node._value.fill(value);
    setMod(node, 0);
}
function fillRange(node, args) {
    node._value.fill(args[0], args[1], args[2]);
    setMod(node, 0);
}
function copyWithin(node, args) {
    node._value.copyWithin(args[0], args[1], args[2]);
    setMod(node, 0);
}
function splice(node, args) {
    let arr = node._value;
    let start = args[0];
    let delCount = args[1];
    let items = args[2];
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
    setMod(node, op > 0 ? encode(op, pos, Math.max(delCount, addLen)) : 0);
}

/**
 * @template T
 * @param {*} arg
 * @returns {T}
 */
/** @param {*} v @returns {boolean} */
function isSignal(v) {
    return v !== null && typeof v === "object" && v._flag !== undefined;
}

function getVal(arg) {
    if (arg !== null && typeof arg === "object" && arg._flag !== undefined) {
        return arg._value;
    }
    return arg;
}

/**
 * @template T
 * @param {*} source
 * @returns {T}
 */
function read(source) {
    if (source !== null && typeof source === "object" && source._flag !== undefined) {
        return source._value;
    }
    return source;
}

/**
 * Creates a bound+setup compute that tracks source as dep1.
 * The fn receives (sourceValue, cx, prev, args) — the bound
 * signature with dynamic dep tracking for reactive parameters.
 * @template T,U,W
 * @param {!Sender} source
 * @param {function(Array<U>, Compute, T, W): T} fn
 * @param {W} args
 * @param {number=} opts
 * @returns {!Compute}
 */
function computeArray(source, fn, args, opts) {
    let flag = FLAG_BOUND | OPT_STABLE | OPT_SETUP | (0 | opts);
    let node = new Compute(flag, fn, source, void 0, args);
    node._dep1slot = connect(source, node, -1);
    if (!(flag & OPT_DEFER)) {
        startCompute(node);
    }
    return node;
}

/**
 * @template T
 * @param {Array<T>} source
 * @param {number} seed
 * @param {number | ReadonlySignal<number>} args
 * @returns {T | undefined}
 */
function at(source, _node, seed, args) {
    return source.at(typeof args === 'number' ? args : read(args));
}

/**
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @param {number | ReadonlySignal<number>} index
 * @returns {Compute<T|undefined,Array<T>,null,number | ReadonlySignal<number>>}
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
function concat(source, _node, seed, args) {
    return source.concat(args);
}

/**
 * @template T
 * @param {Array<T>} source
 * @param {Array<T>} seed
 * @param {*} args
 * @returns {Array<T>}
 */
function concatN(source, _node, seed, args) {
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
function entries(source, _node) {
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
function every(source, _node, prev, cb) {
    if (!(_node._flag & FLAG_INIT)) {
        let mod = _node._getMod();
        if (mod > 0) {
            let op = mod & MUT_OP_MASK;
            if (prev === true) {
                if (!(op & (MUT_ADD | MUT_SORT))) {
                    /** Only DEL: removing from an all-true set stays all-true */
                    return true;
                }
                if (!(op & MUT_SORT) && cb.length <= 2) {
                    /**
                     * ADD (possibly with DEL), callback ignores index.
                     * Existing items still pass — only check modified region.
                     */
                    let pos = (mod >>> MUT_POS_SHIFT) & MUT_POS_MASK;
                    let len = (mod >>> MUT_LEN_SHIFT) & MUT_LEN_MASK;
                    let end = Math.min(pos + len, source.length);
                    for (let i = pos; i < end; i++) {
                        if (!cb(source[i], i, source, _node)) {
                            return false;
                        }
                    }
                    return true;
                }
            }
            if (prev === false && !(op & (MUT_DEL | MUT_SORT)) && cb.length <= 2) {
                /** Only ADD + callback ignores index: failing item still present */
                return false;
            }
        }
    }
    for (let i = 0; i < source.length; i++) {
        if (!cb(source[i], i, source, _node)) {
            return false;
        }
    }
    return true;
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
function filter(source, _node, seed, cb) {
    let result = [];
    for (let i = 0; i < source.length; i++) {
        if (cb(source[i], i, source, _node)) {
            result.push(source[i]);
        }
    }
    return result;
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
function find(source, _node, seed, cb) {
    for (let i = 0; i < source.length; i++) {
        if (cb(source[i], i, source, _node)) {
            return source[i];
        }
    }
    return void 0;
}

/**
 * @template T
 * @param {Array<T>} source
 * @param {T | undefined} seed
 * @param {{ _val: function(T, number, Array<T>): boolean, _idx: number }} args
 * @returns {T|undefined}
 */
function find_mut(source, _node, prev, args) {
    let cb = args._val;
    if (!(_node._flag & FLAG_INIT)) {
        let mod = _node._getMod();
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
                if (op === MUT_ADD && cb.length <= 2) {
                    /** Check new region for earlier match */
                    let end = Math.min(pos + len, source.length);
                    for (let i = pos; i < end; i++) {
                        if (cb(source[i], i, source, _node)) {
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
                if (cb.length <= 2) {
                    let end = Math.min(pos + len, source.length);
                    for (let i = pos; i < end; i++) {
                        if (cb(source[i], i, source, _node)) {
                            args._idx = i;
                            return source[i];
                        }
                    }
                    return void 0;
                }
            }
        }
    }
    let idx = -1;
    for (let i = 0; i < source.length; i++) {
        if (cb(source[i], i, source, _node)) {
            idx = i;
            break;
        }
    }
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
function findIndex(source, _node, seed, cb) {
    for (let i = 0; i < source.length; i++) {
        if (cb(source[i], i, source, _node)) {
            return i;
        }
    }
    return -1;
}

/**
 * @template T
 * @param {Array<T>} source
 * @param {number} seed
 * @param {function(T, number, Array<T>): boolean} cb
 * @returns {number}
 */
function findIndex_mut(source, _node, prev, cb) {
    if (!(_node._flag & FLAG_INIT)) {
        let mod = _node._getMod();
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
                } else if (op === MUT_ADD && cb.length <= 2) {
                    /** Check new region for earlier match */
                    let end = Math.min(pos + len, source.length);
                    for (let i = pos; i < end; i++) {
                        if (cb(source[i], i, source, _node)) {
                            return i;
                        }
                    }
                    return prev + len;
                }
            } else if (prev === -1) {
                if (!(op & MUT_ADD)) {
                    return -1;
                }
                if (cb.length <= 2) {
                    /** Check only new region */
                    let end = Math.min(pos + len, source.length);
                    for (let i = pos; i < end; i++) {
                        if (cb(source[i], i, source, _node)) {
                            return i;
                        }
                    }
                    return -1;
                }
            }
        }
    }
    for (let i = 0; i < source.length; i++) {
        if (cb(source[i], i, source, _node)) {
            return i;
        }
    }
    return -1;
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
function findLast(source, _node, seed, cb) {
    for (let i = source.length - 1; i >= 0; i--) {
        if (cb(source[i], i, source, _node)) {
            return source[i];
        }
    }
    return void 0;
}

/**
 * @template T
 * @param {Array<T>} source
 * @param {T | undefined} seed
 * @param {{ _val: function(T, number, Array<T>): boolean, _idx: number }} args
 * @returns {T | undefined}
 */
function findLast_mut(source, _node, prev, args) {
    if (!(_node._flag & FLAG_INIT)) {
        let mod = _node._getMod();
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
                if (op === MUT_ADD && args._val.length <= 2) {
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
                        if (args._val(source[i], i, source, _node) && i > lastFound) {
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
                if (args._val.length <= 2) {
                    let end = Math.min(pos + len, source.length);
                    let lastFound = -1;
                    let lastVal = void 0;
                    for (let i = pos; i < end; i++) {
                        if (args._val(source[i], i, source, _node)) {
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
    let idx = -1;
    for (let i = source.length - 1; i >= 0; i--) {
        if (args._val(source[i], i, source, _node)) {
            idx = i;
            break;
        }
    }
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
function findLastIndex(source, _node, seed, cb) {
    for (let i = source.length - 1; i >= 0; i--) {
        if (cb(source[i], i, source, _node)) {
            return i;
        }
    }
    return -1;
}

/**
 * @template T
 * @param {Array<T>} source
 * @param {number} seed
 * @param {function(T, number, Array<T>): boolean} cb
 * @returns {number}
 */
function findLastIndex_mut(source, _node, prev, cb) {
    if (!(_node._flag & FLAG_INIT)) {
        let mod = _node._getMod();
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
                if (op === MUT_ADD && cb.length <= 2) {
                    let end = Math.min(pos + len, source.length);
                    let shiftedPrev = pos <= prev ? prev + len : prev;
                    let lastFound = shiftedPrev;
                    for (let i = pos; i < end; i++) {
                        if (cb(source[i], i, source, _node) && i > lastFound) {
                            lastFound = i;
                        }
                    }
                    return lastFound;
                }
            } else if (prev === -1) {
                if (!(op & MUT_ADD)) {
                    return -1;
                }
                if (cb.length <= 2) {
                    let end = Math.min(pos + len, source.length);
                    let lastFound = -1;
                    for (let i = pos; i < end; i++) {
                        if (cb(source[i], i, source, _node)) {
                            lastFound = i;
                        }
                    }
                    return lastFound;
                }
            }
        }
    }
    for (let i = source.length - 1; i >= 0; i--) {
        if (cb(source[i], i, source, _node)) {
            return i;
        }
    }
    return -1;
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
 * @param {number | ReadonlySignal<number>=} depth
 * @returns {!Array<T>}
 */
function flat(source, _node, seed, depth) {
    return source.flat(getVal(depth));
}

/**
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @param {number | ReadonlySignal<number>=} depth
 * @returns {Compute<Array<T>,Array<T>,null,number|ReadonlySignal<number>|undefined>}
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
function flatMap(source, _node, seed, cb) {
    let result = [];
    for (let i = 0; i < source.length; i++) {
        let items = cb(source[i], i, source, _node);
        if (Array.isArray(items)) {
            for (let j = 0; j < items.length; j++) {
                result.push(items[j]);
            }
        } else {
            result.push(items);
        }
    }
    return result;
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
function forEach(source, _node, cb) {
    for (let i = 0; i < source.length; i++) {
        cb(source[i], i, source, _node);
    }
}

/**
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @param {(function(T, number): ((function(): void) | void))} cb
 * @param {number=} opts
 * @returns {Effect<Array<T>,null, ((function(T, number): ((function(): void) | void)))>}
 */
SignalProto.forEach = ComputeProto.forEach = function (cb, opts) {
    let flag = FLAG_BOUND | OPT_STABLE | (0 | opts);
    let node = new Effect(flag, forEach, this, null, cb);
    node._dep1slot = connect(this, node, -1);
    startEffect(node);
    return node;
};

// --- includes ---

/**
 * @template T
 * @param {Array<T>} source
 * @param {boolean} seed
 * @param {*} arg
 * @returns {boolean}
 */
function includes1(source, _node, seed, arg) {
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
function includes1_mut(source, _node, prev, args) {
    if (!(_node._flag & FLAG_INIT)) {
        let mod = _node._getMod();
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
function includes2(source, _node, seed, args) {
    let arr = /** @type {!Array<*>} */(args);
    return source.includes(/** @type {T} */(getVal(arr[0])), /** @type {number} */(getVal(arr[1])));
}

/**
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @param {*} searchElement
 * @param {number | ReadonlySignal<number>=} fromIndex
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
function indexOf1(source, _node, seed, arg) {
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
function indexOf1_mut(source, _node, prev, arg) {
    if (!(_node._flag & FLAG_INIT)) {
        let mod = _node._getMod();
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
function indexOf2(source, _node, seed, args) {
    let arr = /** @type {!Array<*>} */(args);
    return source.indexOf(/** @type {T} */(getVal(arr[0])), /** @type {number} */(getVal(arr[1])));
}

/**
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @param {*} searchElement
 * @param {number | ReadonlySignal<number>=} fromIndex
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
 * @param {string | ReadonlySignal<string>=} separator
 * @returns {string}
 */
function join(source, _node, seed, separator) {
    return source.join(separator !== undefined ? /** @type {string} */(getVal(separator)) : undefined);
}

/**
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @param {string | ReadonlySignal<string>=} separator
 * @returns {Compute<string, Array<T>, null, string | ReadonlySignal<string> | undefined>}
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
function keys(source, _node, seed, args) {
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
function map(source, _node, seed, cb) {
    let result = new Array(source.length);
    for (let i = 0; i < source.length; i++) {
        result[i] = cb(source[i], i, source, _node);
    }
    return result;
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
function reduce1(source, _node, seed, arg) {
    let cb = /** @type {function(U, T, number, Array<T>): U} */(arg);
    if (source.length === 0) {
        throw new TypeError('Reduce of empty array with no initial value');
    }
    let acc = /** @type {U} */(source[0]);
    for (let i = 1; i < source.length; i++) {
        acc = cb(acc, source[i], i, source, _node);
    }
    return acc;
}

/**
 * @template T, U
 * @param {Array<T>} source
 * @param {U} seed
 * @param {*} args
 * @returns {U}
 */
function reduce2(source, _node, seed, args) {
    let arr = /** @type {!Array<*>} */(args);
    let cb = /** @type {function(U, T, number, Array<T>): U} */(arr[0]);
    let initialValue = /** @type {U} */(getVal(arr[1]));
    let acc = initialValue;
    for (let i = 0; i < source.length; i++) {
        acc = cb(acc, source[i], i, source, _node);
    }
    return acc;
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
function reduceRight1(source, _node, seed, arg) {
    let cb = /** @type {function(U, T, number, Array<T>): U} */(arg);
    if (source.length === 0) {
        throw new TypeError('Reduce of empty array with no initial value');
    }
    let acc = /** @type {U} */(source[source.length - 1]);
    for (let i = source.length - 2; i >= 0; i--) {
        acc = cb(acc, source[i], i, source, _node);
    }
    return acc;
}

/**
 * @template T, U
 * @param {Array<T>} source
 * @param {U} seed
 * @param {*} args
 * @returns {U}
 */
function reduceRight2(source, _node, seed, args) {
    let arr = /** @type {!Array<*>} */(args);
    let cb = /** @type {function(U, T, number, Array<T>): U} */(arr[0]);
    let initialValue = /** @type {U} */(getVal(arr[1]));
    let acc = initialValue;
    for (let i = source.length - 1; i >= 0; i--) {
        acc = cb(acc, source[i], i, source, _node);
    }
    return acc;
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
function slice0(source, _node, seed, args) {
    return source.slice();
}

/**
 * @template T
 * @param {Array<T>} source
 * @param {Array<T>} seed
 * @param {*} arg
 * @returns {Array<T>}
 */
function slice1(source, _node, seed, arg) {
    return source.slice(/** @type {number} */(getVal(arg)));
}

/**
 * @template T
 * @param {Array<T>} source
 * @param {Array<T>} seed
 * @param {*} args
 * @returns {Array<T>}
 */
function slice2(source, _node, seed, args) {
    let arr = /** @type {!Array<*>} */(args);
    return source.slice(/** @type {number} */(getVal(arr[0])), /** @type {number} */(getVal(arr[1])));
}

/**
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @param {number | ReadonlySignal<number>=} start
 * @param {number | ReadonlySignal<number>=} end
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
function some(source, _node, prev, cb) {
    if (!(_node._flag & FLAG_INIT)) {
        let mod = _node._getMod();
        if (mod > 0) {
            let op = mod & MUT_OP_MASK;
            if (prev === false) {
                if (!(op & (MUT_ADD | MUT_SORT))) {
                    /** Only DEL: removing items can't make some() true */
                    return false;
                }
                if (!(op & MUT_SORT) && cb.length <= 2) {
                    /**
                     * ADD (possibly with DEL), callback ignores index.
                     * Existing items still don't match — check modified region.
                     */
                    let pos = (mod >>> MUT_POS_SHIFT) & MUT_POS_MASK;
                    let len = (mod >>> MUT_LEN_SHIFT) & MUT_LEN_MASK;
                    let end = Math.min(pos + len, source.length);
                    for (let i = pos; i < end; i++) {
                        if (cb(source[i], i, source, _node)) {
                            return true;
                        }
                    }
                    return false;
                }
            }
            if (prev === true && !(op & (MUT_DEL | MUT_SORT)) && cb.length <= 2) {
                /** Only ADD + callback ignores index: matching item still present */
                return true;
            }
        }
    }
    for (let i = 0; i < source.length; i++) {
        if (cb(source[i], i, source, _node)) {
            return true;
        }
    }
    return false;
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
function values(source, _node, seed, args) {
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
    if (IDLE) {
        this._value.copyWithin(target, start, end);
        modify(this, 0);
    } else {
        schedule(this, [target, start, end], copyWithin);
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
    if (IDLE) {
        this._value.fill(value, start, end);
        modify(this, 0);
    } else {
        if (arguments.length === 1) {
            schedule(this, value, fill);
        } else {
            schedule(this, [value, start, end], fillRange);
        }
    }
};

/**
 * @template T
 * @this {Signal<Array<T>>}
 * @returns {void}
 */
SignalProto.pop = function () {
    if (IDLE) {
        this._value.pop();
        modify(this, encode(MUT_DEL, this._value.length, 1));
    } else {
        schedule(this, null, pop);
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
        if (IDLE) {
            if (len === 1) {
                arr.push(items[0]);
            } else {
                arr.push(...items);
            }
            modify(this, encode(MUT_ADD, pos, len));
        } else {
            if (len === 1) {
                schedule(this, items[0], push);
            } else {
                schedule(this, items, pushArray);
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
    if (IDLE) {
        this._value.reverse();
        modify(this, encode(MUT_SORT, 0, 0));
    } else {
        schedule(this, null, reverse);
    }
};

/**
 * @template T
 * @this {Signal<Array<T>>}
 * @returns {void}
 */
SignalProto.shift = function () {
    if (IDLE) {
        this._value.shift();
        modify(this, encode(MUT_DEL, 0, 1));
    } else {
        schedule(this, null, shift);
    }
};

/**
 * @template T
 * @this {Signal<Array<T>>}
 * @param {function(T,T): number=} compareFn
 * @returns {void}
 */
SignalProto.sort = function (compareFn) {
    if (IDLE) {
        this._value.sort(compareFn);
        modify(this, encode(MUT_SORT, 0, 0));
    } else {
        schedule(this, compareFn, sort);
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
    if (IDLE) {
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
        modify(this, op > 0 ? encode(op, pos, Math.max(deleteCount, addLen)) : 0);
    } else {
        schedule(this, [start, deleteCount, items], splice);
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
        if (IDLE) {
            if (len === 1) {
                this._value.unshift(items[0]);
            } else {
                this._value.unshift(...items);
            }
            modify(this, encode(MUT_ADD, 0, len));
        } else {
            if (len === 1) {
                schedule(this, items[0], unshift);
            } else {
                schedule(this, items, unshiftArray);
            }
        }
    }
};

export { computeArray, signal as list };
