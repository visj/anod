import { Signal, Compute } from '@fyren/core';
import {
    FLAG_ASYNC, FLAG_BOUND, OPT_STABLE, OPT_SETUP, OPT_DEFER,
    connect, startCompute
} from '@fyren/core/internal';

var SignalProto = Signal.prototype;
var ComputeProto = Compute.prototype;

/**
 * Creates a bound+setup async compute that tracks source as dep1.
 * Like computeArray but sets FLAG_ASYNC directly — no c.async()
 * overhead needed inside the callback.
 * @template T,U,W
 * @param {!Sender} source
 * @param {function(Array<U>, Compute, T, W): T} fn
 * @param {W} args
 * @param {number=} opts
 * @returns {!Compute}
 */
function taskArray(source, fn, args, opts) {
    let flag = FLAG_ASYNC | FLAG_BOUND | OPT_STABLE | OPT_SETUP | (0 | opts);
    let node = new Compute(flag, fn, source, void 0, args);
    node._dep1slot = connect(source, node, -1);
    if (!(flag & OPT_DEFER)) {
        startCompute(node);
    }
    return node;
}

/**
 * Async map orchestrator. Chains callbacks sequentially, returning
 * a single promise that resolves to the mapped array.
 *
 * Each callback may return a value or a promise. Promises are
 * chained via .then() to ensure sequential execution. Sync
 * return values are stored directly without promise overhead.
 *
 * @template T, U
 * @param {Array<T>} source
 * @param {!Compute} _node
 * @param {Array<U>} prev
 * @param {function(T, number, Array<T>, Compute): (Promise<U> | U)} cb
 * @returns {!Promise<Array<U>>}
 */
function mapAsync(source, _node, prev, cb) {
    let len = source.length;
    let result = new Array(len);
    let i = 0;

    /** Recursive step: process element i, chain to next. */
    function step() {
        while (i < len) {
            let idx = i++;
            let val = cb(source[idx], idx, source, _node);
            if (val !== null && typeof val === 'object' && typeof val.then === 'function') {
                return val.then(function (resolved) {
                    result[idx] = resolved;
                    return step();
                });
            }
            result[idx] = val;
        }
        return result;
    }

    return step();
}

/**
 * @template U
 * @this {Compute<Array<T>> | Signal<Array<T>>}
 * @param {function(T, number, Array<T>, Compute): (Promise<U> | U)} cb
 * @param {number=} opts
 * @returns {!Compute<Array<U>>}
 */
SignalProto.mapAsync = ComputeProto.mapAsync = function (cb, opts) {
    return taskArray(this, mapAsync, cb, opts);
};
