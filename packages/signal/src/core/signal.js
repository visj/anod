import { Anod } from "./api.js";
import { Disposer, Owner, Sender, Receiver, Clock, ISignal, ICompute, IEffect } from "./types.js";

/**
 * @const
 * @enum {number}
 */
var Op = {
    Value: 1,
    Callback: 2,
    CopyWithin: 3,
    Fill: 4,
    FillRange: 5,
    Pop: 6,
    Push: 7,
    PushArray: 8,
    Reverse: 9,
    Shift: 10,
    Sort: 11,
    Splice: 12,
    Unshift: 13,
    UnshiftArray: 14,
};

/**
 * @const
 * @enum {number}
 */
var Mut = {
    /* Not used */
    _COMPUTE: 1,
    _BITSUB: 2,
    _ADD: 4,
    _DEL: 8,
    _SORT: 16,
    _OP_MASK: 15,
    _LEN_SHIFT: 4,
    _LEN_MASK: 0x7FF,
    _POS_SHIFT: 14,
    _POS_MASK: 0x1FFF
};

/**
 * @const
 * @enum {number}
 */
var AsyncType = {
    NotAsync: 0,
    Promise: 1,
    Iterable: 2
};

/**
 * @const
 * @enum {number}
 */
var Flag = {
    _DEFER: 1,
    _STABLE: 2,
    _SETUP: 4,
    _STALE: 8,
    _PENDING: 16,
    _RUNNING: 32,
    _DISPOSED: 64,
    _LOADING: 128,
    _ERROR: 256,
    _RECOVER: 512,
    _BOUND: 1024,
    _TRACKED: 2048,
    _SCOPE: 4096,
    _EQUAL: 8192,
    _WEAK: 16384,
    _LIST: 32768,
    _RDEP1: 0x10000,
    _RDEP2: 0x20000
};

/**
 * @const
 * @public
 * @enum {number}
 */
var Opt = {
    DEFER: Flag._DEFER,
    STABLE: Flag._STABLE,
    SETUP: Flag._SETUP,
    WEAK: Flag._WEAK
};

/**
 * @const
 * @type {number}
 */
var OPTIONS = Opt.DEFER | Opt.STABLE | Opt.SETUP;

/**
 * @const
 * @enum {number}
 */
var State = {
    _START: 0,
    _IDLE: 1,
    _COMPUTE: 2,
    _OWNER: 8,
    _SCOPE: 16,
};

var RESET = ~(State._IDLE | State._OWNER);

/**
 * @const
 * @enum {number}
 */
var TypeFlag = {
    _MASK: 7,
    _SEND: 8,
    _RECEIVE: 16,
    _OWNER: 32
};

/**
 * @const
 * @enum {number}
 */
var Type = {
    _ROOT: 1 | TypeFlag._OWNER,
    _SIGNAL: 2 | TypeFlag._SEND,
    _COMPUTE: 3 | TypeFlag._SEND | TypeFlag._RECEIVE,
    _EFFECT: 4 | TypeFlag._OWNER | TypeFlag._RECEIVE,
};

/**
 * 
 * @returns {!Clock}
 */
function clock() {
    let c = {
        _state: State._IDLE,
        _time: 1,
        _version: 1,
        _minlevel: 0,
        _maxlevel: 0,
        _disposes: 0,
        _signals: 0,
        _computes: 0,
        _scopes: 0,
        _effects: 0,
        _scope: null
    };
    return /** @type {!Clock} */(c);
}

/**
 * @const
 * @nocollapse
 * @type {!Clock}
 */
var CLOCK = clock();

/** @const @type {Array<Disposer>} */
var DISPOSE_QUEUE = [];

/** @const @type {Array<number>} */
var SIGNAL_OPS = [];
/** @const @type {Array} */
var SIGNAL_QUEUE = [];

/** @const @type {Array<Compute>} */
var COMPUTE_QUEUE = [];

/** @const @type {Array<number>} */
var SCOPE_LEVELS = [0, 0, 0, 0];
/** @const @type {Array<Array<Effect>>} */
var SCOPE_QUEUE = [[], [], [], []];
/** @const @type {Array<Effect>} */
var EFFECT_QUEUE = [];

/**
 * @param {*} value 
 * @returns {number} 0: None, 1: Promise, 2: Async Iterator
 */
function isAsync(value) {
    return (value != null && (typeof value === 'object' || typeof value === 'function'))
        ? (typeof value[Symbol.asyncIterator] === 'function' ? AsyncType.Iterable
            : (typeof value.then === 'function' ? AsyncType.Promise : AsyncType.NotAsync))
        : AsyncType.NotAsync;
}

/**
 *
 * @param {*} value
 * @returns {boolean} 
 */
function isSignal(value) {
    return value !== null && typeof value === 'object' && (/** @type {Anod} */(value).t & TypeFlag._SEND) !== 0;
}

/**
 * @param {*} value 
 * @returns {boolean}
 */
function isNumber(value) {
    return typeof value === 'number';
}

/**
 * @param {*} value
 * @returns {boolean} 
 */
function isPrimitive(value) {
    if (value === null) {
        return true;
    }
    let type = typeof value;
    return type !== 'object' && type !== 'function';
}

/**
 * @param {*} value 
 * @returns {boolean}
 */
function isFunction(value) {
    return typeof value === 'function';
}

export { isPrimitive, isNumber, isFunction, isSignal, isAsync }

/**
 * @param {Signal} node 
 * @param {number} op 
 * @param {*} value
 * @returns {void} 
 */
function scheduleSignal(node, op, value) {
    let index = CLOCK._signals++;
    SIGNAL_OPS[index] = op;
    SIGNAL_QUEUE[index * 2] = node;
    SIGNAL_QUEUE[index * 2 + 1] = value;
}

/**
 * * @param {Compute} node 
 */
function scheduleCompute(node) {
    COMPUTE_QUEUE[CLOCK._computes++] = node;
}

/**
 * @this {Disposer}
 * @returns {void}
 */
function _proto_dispose() {
    if (!(this._flag & Flag._DISPOSED)) {
        if (CLOCK._state & State._IDLE) {
            this._dispose();
        } else {
            DISPOSE_QUEUE[CLOCK._disposes++] = this;
        }
    }
}

/**
 * @this {!Receiver}
 * @returns {boolean}
 */
function _proto_error() {
    return (this._flag & Flag._ERROR) !== 0;
}

/**
 * @this {!Receiver}
 * @returns {boolean}
 */
function _proto_loading() {
    return (this._flag & Flag._LOADING) !== 0;
}

/**
 * @template T
 * @this {!Receiver}
 * @param {!Sender<T>} sender
 * @returns {T}
 */
function _proto_read(sender) {
    let value;
    if (sender.t & TypeFlag._RECEIVE) {
        value = sender.peek();
    } else {
        value = sender._value;
    }
    let flag = this._flag;
    if (!(flag & Flag._RUNNING)) {
        return value;
    }
    if ((flag & Flag._BOUND) || ((flag & Flag._STABLE) && !(flag & Flag._SETUP))) {
        return value;
    }
    if (sender._version === this._version) {
        return value;
    }
    sender._version = this._version;
    if (!(flag & Flag._SETUP)) {
        if (!(flag & Flag._RDEP1) && sender === this._dep1) {
            this._flag |= Flag._RDEP1;
            return value;
        }
        if (!(flag & Flag._RDEP2) && sender === this._dep2) {
            this._flag |= Flag._RDEP2;
            return value;
        }
        if (this._deps !== null && this._dephead < this._deptail && sender === this._deps[this._dephead * 2]) {
            this._dephead++;
            return value;
        }
    }
    /** @type {number} */
    let depslot = 0;
    if (this._dep1 === null) {
        this._dep1 = sender;
    } else if (this._dep2 === null) {
        depslot = 1;
        this._dep2 = sender;
    } else if (this._deps === null) {
        depslot = 2;
    } else {
        depslot = (this._deps.length / 2) + 2;
    }
    let subslot = subscribe(sender, this, depslot);
    switch (depslot) {
        case 0: this._dep1slot = subslot; break;
        case 1: this._dep2slot = subslot; break;
        case 2: this._deps = [sender, subslot]; break;
        default: this._deps.push(sender, subslot);
    }
    return value;
}

/**
 * @template T,V,W
 * @this {!Sender<T>}
 * @param {function(T,V,W): V} fn
 * @param {V=} seed
 * @param {number=} opts
 * @param {W=} args
 * @returns {!Compute<V,T,null,W>}
 */
function _proto_derive(fn, seed, opts, args) {
    let _flag = Flag._BOUND | Flag._STABLE | ((0 | opts) & OPTIONS);
    let node = new Compute(_flag, fn, this, null, seed, args);
    node._dep1slot = subscribe(this, node, 0);
    if (!(_flag & Flag._DEFER)) {
        startCompute(node);
    }
    return node;
}

/**
 * @template T,W
 * @this {!Sender<T>}
 * @param {function(T,W): (function(): void | void)} fn 
 * @param {number=} opts
 * @param {W=} args
 * @returns {!Effect<T,null,W>}
 */
function _proto_watch(fn, opts, args) {
    let _flag = Flag._BOUND | Flag._STABLE | ((0 | opts) & OPTIONS);
    let node = new Effect(_flag, fn, this, null, args);
    node._dep1slot = subscribe(this, node, 0);
    if (!(_flag & Flag._DEFER)) {
        startEffect(node);
    }
    return node;
}

/**
 * @constructor
 * @implements {Owner}
 */
function Root() {
    /**
     * @protected
     * @type {number}
     */
    this._flag = Flag._SCOPE;
    /**
     * @protected
     * @type {(function(): void) | Array<(function(): void)> | null}
     */
    this._cleanup = null;
    /**
     * @type {number}
     */
    this._cslot = 0;
    /**
     * @protected
     * @type {Array<Receiver> | null}
     */
    this._owned = null;
    /**
     * @protected
     * @type {number}
     */
    this._oslot = 0;
    /**
     * @type {Owner | null}
     */
    this._owner = null;
    /**
     * @type {(function(*): boolean) | Array<(function(*): boolean)> | null}
     */
    this._recover = null;
    /**
     * @type {number}
     */
    this._rslot = 0;
}

/** @const */
var RootProto = Root.prototype;

/**
 * @const
 * @type {number}
 */
RootProto.t = Type._ROOT;

/**
 * @public
 * @this {!Root}
 * @returns {void}
 */
RootProto.dispose = _proto_dispose;

/**
 * @public
 * @this {!Root}
 * @param {function(): void} fn
 * @returns {void}
 */
RootProto.cleanup = function (fn) { addCleanup(this, fn); };

/**
 * @public
 * @this {!Root}
 * @param {function(*): boolean} fn
 * @returns {void}
 */
RootProto.recover = function (fn) { addRecover(this, fn); };

/**
 * @protected
 * @this {!Root}
 * @returns {void}
 */
RootProto._dispose = function () {
    if (!(this._flag & Flag._DISPOSED)) {
        this._flag |= Flag._DISPOSED;
        clearOwned(this);
        this._cleanup =
            this._owned =
            this._recover = null;
    }
};

/**
 * @param {Root} root
 * @param {function(): ((function(): void) | void)} fn
 * @returns {void}
 */
function startRoot(root, fn) {
    let state = CLOCK._state;
    let scope = CLOCK._scope;
    CLOCK._state &= (RESET | State._IDLE);
    CLOCK._scope = root;
    CLOCK._state |= State._OWNER;
    try {
        let cleanup = fn(root);
        if (typeof cleanup === 'function') {
            addCleanup(root, cleanup);
        }
    } finally {
        CLOCK._state = state;
        CLOCK._scope = scope;
    }
}

/**
 * @template T
 * @constructor
 * @implements {ISignal<T>} 
 * @param {T} value
 * @param {number=} opts
 */
function Signal(value, opts) {
    /**
     * @protected
     * @type {number}
     */
    this._flag = 0 | opts;
    /**
     * @protected
     * @type {T}
     */
    this._value = value;
    /**
     * @protected
     * @type {number}
     */
    this._version = 0;
    /**
     * @protected
     * @type {Receiver}
     */
    this._sub1 = null;
    /**
     * @protected
     * @type {number}
     */
    this._sub1slot = 0;
    /**
     * @protected
     * @type {Array<Receiver | number> | null}
     */
    this._subs = null;
    /**
     * @protected
     * @type {number}
     */
    this._mod = 0;
}

{
    /** @const */
    let SignalProto = Signal.prototype;

    /**
     * @const
     * @type {number}
     */
    SignalProto.t = Type._SIGNAL;

    /**
     * @public
     * @returns {void}
     */
    SignalProto.dispose = _proto_dispose;

    /**
     * @public
     * @this {!Signal<T>}
     * @returns {T}
     */
    SignalProto.val = function () {
        return this._value;
    };

    /**
     * @public
     * @this {!Signal<T>}
     * @returns {T}
     */
    SignalProto.peek = function () {
        return this._value;
    };

    /**
     * @public
     * @this {!Signal<T>}
     * @param {T} value
     * @returns {void}
     */
    SignalProto.set = function (value) {
        if (this._value !== value) {
            if (CLOCK._state & State._IDLE) {
                this._value = value;
                notify(this);
            } else {
                this._flag |= Flag._STALE;
                scheduleSignal(this, Op.Value, value);
            }
        }
    };

    /**
     * @template V,W
     * @this {!Signal<T>}
     * @param {function(T,V,W): V} fn 
     * @param {V=} seed 
     * @param {number=} opts 
     * @param {W=} args
     * @returns {!Compute<V,T,null,W>}
     */
    SignalProto.derive = _proto_derive;

    /**
     * @template T,W
     * @this {!Signal<T>}
     * @param {function(T,W): (function(): void | void)} fn 
     * @param {number=} opts
     * @param {W=} args
     * @returns {Effect<T,null,W>}
     */
    SignalProto.watch = _proto_watch;

    /**
     * @protected
     * @this {!Signal<T>}
     * @returns {void}
     */
    SignalProto._dispose = function () {
        if (!(this._flag & Flag._DISPOSED)) {
            clearSubs(this);
            this._value = null;
        }
    };
}

/**
 * @constructor
 * @template T,U,V,W
 * @param {number} opts
 * @param {(function(T,W): T) | (function(U,T,W,number): T) | (function(U,V,T,W,number): T)} fn 
 * @param {Sender<U> | null} dep1 
 * @param {Sender<V> | null} dep2
 * @param {T=} seed
 * @param {W=} args
 * @implements {ICompute<T>}
 */
function Compute(opts, fn, dep1, dep2, seed, args) {
    /**
     * @protected
     * @type {number}
     */
    this._flag = Flag._STALE | opts;
    /**
     * @protected
     * @type {T}
     */
    this._value = seed;
    /**
     * @protected
     * @type {number}
     */
    this._version = 0;
    /**
     * @protected
     * @type {Receiver}
     */
    this._sub1 = null;
    /**
     * @type {number}
     */
    this._sub1slot = 0;
    /**
     * @protected
     * @type {Array<Receiver | number> | null}
     */
    this._subs = null;
    /**
     * @type {(function(T): T) | (function(T, U): T) | (function(T,U,V): T) | null}
     */
    this._fn = fn;
    /**
     * @type {Sender<U>}
     */
    this._dep1 = dep1;
    /**
     * @protected
     * @type {number}
     */
    this._dep1slot = 0;
    /**
     * @type {Sender<V>}
     */
    this._dep2 = dep2;
    /**
     * @protected
     * @type {number}
     */
    this._dep2slot = 0;
    /**
     * @type {Array<Sender | number> | null}
     */
    this._deps = null;
    /**
     * @type {number}
     */
    this._time = 0;
    /**
     * @type {number}
     */
    this._ptime = 0;
    /**
     * @protected
     * @type {W | undefined}
     */
    this._args = args;
    /**
     * @type {number}
     */
    this._dephead = 0;
    /**
     * @type {number}
     */
    this._deptail = 0;
    if (CLOCK._state & State._OWNER) {
        addOwned(CLOCK._scope, this);
    }
}

{
    /** @const */
    let ComputeProto = Compute.prototype;

    /**
     * @const
     * @type {number}
     */
    ComputeProto.t = Type._COMPUTE;

    /**
     * @const
     * @type {number}
     */
    ComputeProto._mod = 0;

    /**
     * @public
     * @this {!Compute<T,U,V,W>}
     * @returns {void}
     */
    ComputeProto.dispose = _proto_dispose;

    /**
     * @public
     * @this {!Compute<T,U,V,W>}
     * @returns {boolean}
     */
    ComputeProto.error = _proto_error;

    /**
     * @public
     * @this {!Compute<T,U,V,W>}
     * @returns {boolean}
     */
    ComputeProto.loading = _proto_loading;

    /**
     * @public
     * @throws
     * @this {!Compute<T,U,V,W>}
     * @returns {T}
     */
    ComputeProto.peek = function () {
        let clock = CLOCK;
        let time = clock._time;
        let state = clock._state;
        let opts = this._flag;
        if (opts & Flag._ERROR) {
            throw this._value;
        }
        if (opts & Flag._RUNNING) {
            throw new Error('Circular dependency');
        }
        if (opts & Flag._STALE) {
            if (state & State._IDLE) {
                try {
                    runCompute(this, time);
                    if (clock._signals > 0 || clock._disposes > 0) {
                        start(clock);
                    }
                } finally {
                    clock._state = State._IDLE;
                }
            } else {
                runCompute(this, time);
            }
        } else if (
            (opts & Flag._PENDING) &&
            (state & State._COMPUTE) &&
            this._ptime === time
        ) {
            refresh(this, time);
        }
        return this._value;
    };

    /**
     * @public
     * @throws
     * @this {!Compute<T,U,V,W>}
     * @returns {T}
     */
    ComputeProto.val = function () {
        return this.peek();
    };

    /**
     * @public
     * @template T
     * @this {!Compute}
     * @param {!Sender<T>} sender
     * @returns {T}
     */
    ComputeProto.read = _proto_read;

    /**
     * @public
     * @this {!Compute}
     * @returns {void}
     */
    ComputeProto.stable = function () { this._flag |= Flag._STABLE; };

    /**
     * @public
     * @this {!Compute}
     * @returns {void}
     */
    ComputeProto.equal = function () { this._flag |= Flag._EQUAL; };

    /**
     * @template V,W
     * @this {!Compute<T>}
     * @param {function(T,V,W): T} fn 
     * @param {V=} seed 
     * @param {number=} opts 
     * @param {W=} args
     * @returns {!Compute<V,T,null,W>}
     */
    ComputeProto.derive = _proto_derive;

    /**
     * @template T,W
     * @this {!Compute<T>}
     * @param {function(T,W): (function(): void | void)} fn 
     * @param {number=} opts
     * @param {W=} args
     * @returns {!Effect<T,null,W>}
     */
    ComputeProto.watch = _proto_watch;

    /**
     * @protected
     * @this {!Compute<T,U,V,W>}
     * @returns {void}
     */
    ComputeProto._dispose = function () {
        if (!(this._flag & Flag._DISPOSED)) {
            this._flag |= Flag._DISPOSED;
            clearSubs(this);
            clearDeps(this);
            this._fn =
                this._value =
                this._args = null;
        }
    };

    /**
     * @protected
     * @this {!Compute<T,U,V,W>}
     * @param {number} time
     * @returns {void} 
     */
    ComputeProto._setStale = function (time) {
        this._time = time;
        COMPUTE_QUEUE[CLOCK._computes++] = this;
        if (this._ptime < time) {
            this._ptime = time;
            // Have not been marked as PENDING this cycle
            this._flag |= Flag._STALE;
            if (this._flag & Flag._TRACKED) {
                notifyPending(this, time);
            }
        } else {
            this._flag = (this._flag | Flag._STALE) & ~Flag._PENDING;
        }
    };
}

/**
 * 
 * @param {Compute} node
 * @returns {void}
 */
function startCompute(node) {
    let clock = CLOCK;
    let state = clock._state;
    try {
        node._time = clock._time;
        runCompute(node, clock._time);
        if (clock._signals > 0 || clock._disposes > 0) {
            start(clock);
        }
    } finally {
        clock._state = state;
    }
}

/**
 * @template T,U,V,W
 * @param {Compute<T,U,V,W>} node
 * @param {number} time
 * @returns {void} 
 */
function runCompute(node, time) {
    let opts = node._flag;
    /** @type {T} */
    let value;
    let state = CLOCK._state;
    node._flag = (opts | Flag._RUNNING) & ~(Flag._EQUAL | Flag._RDEP1 | Flag._RDEP2);
    CLOCK._state &= RESET;
    try {
        let fn = node._fn;
        let args = node._args;
        if (opts & Flag._BOUND) {
            let dep1 = node._dep1;
            let dep2 = node._dep2;
            if (opts & Flag._SETUP) {
                node._flag &= ~Flag._SETUP;
                let version = ++CLOCK._version;
                node._version = version;
                dep1._version = version;
                if (dep2 !== null) {
                    dep2._version = version;
                }
            }
            if (opts & Flag._LIST) {
                value = fn(node, dep1.peek(), value, args, opts, dep1._mod);
            } else if (dep2 === null) {
                value = fn(node, dep1.peek(), value, args);
            } else {
                value = fn(node, dep1.peek(), dep2.peek(), value, args);
            }
        } else {
            if ((opts & (Flag._STABLE | Flag._SETUP)) === Flag._STABLE) {
                value = fn(node, value);
            } else {
                node._version = ++CLOCK._version;
                if (opts & Flag._SETUP) {
                    node._flag &= ~Flag._SETUP;
                    value = fn(node, value, args);
                } else {
                    node._dephead = 0;
                    node._deptail = node._deps !== null ? node._deps.length / 2 : 0;
                    let innerState = (
                        (node._dep1 !== null ? Flag._RDEP1 : 0) |
                        (node._dep2 !== null ? Flag._RDEP2 : 0)
                    );
                    value = fn(node, value, args);
                    let newlen = node._deps !== null ? node._deps.length / 2 : 0;
                    pruneDeps(node, node._dephead, node._deptail, newlen, innerState, (node._flag & (Flag._RDEP1 | Flag._RDEP2)));
                }
            }
        }
        node._flag &= ~Flag._ERROR;
    } catch (err) {
        value = err;
        node._flag |= Flag._ERROR;
    } finally {
        CLOCK._state = state;
        opts = node._flag &= ~(Flag._RUNNING | Flag._STALE);
    }
    if (opts & Flag._ERROR) {
        node._value = value;
        notifyStale(node, time);
    } else {
        let asyncType = isAsync(value);
        if (asyncType === AsyncType.NotAsync) {
            if (value !== node._value) {
                node._value = value;
                if (!(opts & Flag._EQUAL)) {
                    notifyStale(node, time);
                }
            }
        } else {
            node._flag |= Flag._LOADING;
            if (asyncType === AsyncType.Promise) {
                resolvePromise(new WeakRef(node), /** @type {IThenable<T>} */(value), time);
            } else {
                resolveIterator(new WeakRef(node), /** @type {AsyncIterator<T> | AsyncIterable<T>} */(value), time);
            }
        }
    }
}

/**
 * @template T
 * @param {WeakRef<!Compute<T>>} ref 
 * @param {IThenable<T>} promise 
 * @param {number} time
 * @returns {void}
 */
function resolvePromise(ref, promise, time) {
    promise.then((val) => {
        let node = ref.deref();
        if (node !== void 0 && !(node._flag & Flag._DISPOSED) && node._time === time) {
            node._flag &= ~Flag._ERROR;
            settle(node, val);
        }
    }, (err) => {
        let node = ref.deref();
        if (node !== void 0 && !(node._flag & Flag._DISPOSED) && node._time === time) {
            node._flag |= Flag._ERROR;
            settle(node, err);
        }
    });
}

/**
 * @template T
 * @param {WeakRef<!Compute<T>>} ref 
 * @param {AsyncIterator<T> | AsyncIterable<T>} iterable 
 * @param {number} time
 * @returns {void}
 */
function resolveIterator(ref, iterable, time) {
    /** @type {AsyncIterator<T>} */
    let iterator = typeof iterable[Symbol.asyncIterator] === 'function'
        ? iterable[Symbol.asyncIterator]()
        : iterable;

    /** @param {IteratorResult<T>} result */
    let onNext = (result) => {
        let node = ref.deref();

        if (node === void 0 || (node._flag & Flag._DISPOSED) || node._time !== time) {
            // If the iterator has a return method, call it to allow cleanup
            if (typeof iterator.return === 'function') {
                iterator.return();
            }
            return;
        }

        if (result.done) {
            return;
        }

        iterator.next().then(onNext, onError);

        node._flag &= ~Flag._ERROR;
        settle(node, result.value);
    };

    /** @param {*} err */
    let onError = (err) => {
        let node = ref.deref();
        if (node !== void 0 && !(node._flag & Flag._DISPOSED) && node._time === time) {
            node._flag |= Flag._ERROR;
            settle(node, err);
        }
    };

    // Kick off the first iteration
    iterator.next().then(onNext, onError);
}

/**
 * @template T
 * @param {Compute<T>} node 
 * @param {T | *} value
 * @returns {void}
 */
function settle(node, value) {
    // 2. Clear the loading flag (and any previous error flags)
    node._flag &= ~Flag._LOADING;

    // 3. Settle value and trigger graph if changed (or if it's an error)
    if (value !== node._value || (node._flag & Flag._ERROR)) {
        node._value = value;
        if (unbound(node)) {
            node._fn = node._args = null;
        }
        notifyStale(node, CLOCK._time + 1);
        start(CLOCK);
    }
}

/**
 * @param {Compute} node
 * @param {number} time
 * @returns {void}
 */
function refresh(node, time) {
    node._flag |= Flag._RUNNING;
    try {
        let dep = /** @type {Compute} */(node._dep1);
        if (dep !== null && (dep.t === Type._COMPUTE) && (dep._flag & (Flag._STALE | Flag._PENDING))) {
            if (dep._flag & Flag._STALE) {
                runCompute(dep, time);
            } else if (dep._ptime === time) {
                refresh(dep, time);
            }
            if (node._flag & Flag._STALE) {
                runCompute(node, time);
                return;
            }
        }
        dep = /** @type {Compute} */(node._dep2);
        if (dep !== null && (dep.t === Type._COMPUTE) && (dep._flag & (Flag._STALE | Flag._PENDING))) {
            if (dep._flag & Flag._STALE) {
                runCompute(dep, time);
            } else if (dep._ptime === time) {
                refresh(dep, time);
            }
            if (node._flag & Flag._STALE) {
                runCompute(node, time);
                return;
            }
        }
        let deps = node._deps;
        if (deps !== null) {
            let len = deps.length;
            for (let i = 0; i < len; i += 2) {
                dep = /** @type {Compute} */(deps[i]);
                if ((dep.t === Type._COMPUTE) && (dep._flag & (Flag._STALE | Flag._PENDING))) {
                    if (dep._flag & Flag._STALE) {
                        runCompute(dep, time);
                    } else if (dep._ptime === time) {
                        refresh(dep, time);
                    }
                    if (node._flag & Flag._STALE) {
                        runCompute(node, time);
                        return;
                    }
                }
            }
        }
    } finally {
        node._flag &= ~(Flag._PENDING | Flag._RUNNING);
    }
}

/**
 * @constructor
 * @template U,V,W
 * @param {number} opts
 * @param {(function(W): (function(): void | void)) | (function(U,W): (function(): void | void)) | (function(U,V,W): (function(): void | void))} fn 
 * @param {Sender<U> | null} dep1 
 * @param {Sender<V> | null} dep2
 * @param {W=} args
 * @implements {IEffect}
 */
function Effect(opts, fn, dep1, dep2, args) {
    /**
     * @protected
     * @type {number}
     */
    this._flag = 0 | opts;
    /**
     * @protected
     * @type {(function(W): (function(): void | void)) | (function(U,W): (function(): void | void)) | (function(U,V,W): (function(): void | void)) | null}
     */
    this._fn = fn;
    /**
     * @type {number}
     */
    this._version = 0;
    /**
     * @protected
     * @type {Sender<U> | null}
     */
    this._dep1 = dep1;
    /**
     * @protected
     * @type {number}
     */
    this._dep1slot = 0;
    /**
     * @type {Sender<V> | null}
     */
    this._dep2 = dep2;
    /**
     * @protected
     * @type {number}
     */
    this._dep2slot = 0;
    /**
     * @type {Array<Sender | number> | null}
     */
    this._deps = null;
    /**
     * @protected
     * @type {number}
     */
    this._time = 0;
    /**
     * @type {(function(): void) | Array<(function(): void)> | null}
     */
    this._cleanup = null;
    /**
     * @type {number}
     */
    this._cslot = 0;
    /**
     * @type {Array<Receiver> | null}
     */
    this._owned = null;
    /**
     * @type {number}
     */
    this._oslot = 0;
    /**
     * @type {number}
     */
    this._level = 0;
    /**
     * @type {W | undefined}
     */
    this._args = args;
    /**
     * @type {number}
     */
    this._dephead = 0;
    /**
     * @type {number}
     */
    this._deptail = 0;
    /**
     * @type {Owner | null}
     */
    this._owner = null;
    /**
     * @type {(function(*): boolean) | Array<(function(*): boolean)> | null}
     */
    this._recover = null;
    /**
     * @type {number}
     */
    this._rslot = 0;
    if (CLOCK._state & State._OWNER) {
        this._owner = CLOCK._scope;
        addOwned(CLOCK._scope, this);
    }
}

{
    /** @const */
    let EffectProto = Effect.prototype;

    /**
     * @const
     * @type {number}
     */
    EffectProto.t = Type._EFFECT;

    /**
     * @public
     * @this {!Effect<U,V,W>}
     * @returns {void}
     */
    EffectProto.dispose = _proto_dispose;

    /**
     * @public
     * @this {!Effect<U,V,W>}
     * @returns {boolean}
     */
    EffectProto.error = _proto_error;

    /**
     * @public
     * @this {!Effect<U,V,W>}
     * @returns {boolean}
     */
    EffectProto.loading = _proto_loading;

    /**
     * @public
     * @template T
     * @this {!Effect}
     * @param {!Sender<T>} sender
     * @returns {T}
     */
    EffectProto.read = _proto_read;

    /**
     * @public
     * @this {!Effect}
     * @param {function(): void} fn
     * @returns {void}
     */
    EffectProto.cleanup = function (fn) { addCleanup(this, fn); };

    /**
     * @public
     * @this {!Effect}
     * @param {function(*): boolean} fn
     * @returns {void}
     */
    EffectProto.recover = function (fn) { addRecover(this, fn); };

    /**
     * @protected
     * @this {!Effect<U,V,W>}
     * @returns {void}
     */
    EffectProto._dispose = function () {
        let opts = this._flag;
        if (!(opts & Flag._DISPOSED)) {
            this._flag |= Flag._DISPOSED;
            clearOwned(this);
            clearDeps(this);
            this._fn =
                this._owned =
                this._args =
                this._cleanup =
                this._recover =
                this._owner = null;
        }
    };

    /**
     * @protected
     * @this {!Effect<U,V,W>}
     * @param {number} time
     * @returns {void} 
     */
    EffectProto._setStale = function (time) {
        this._time = time;
        this._flag |= Flag._STALE;
        if (this._flag & Flag._SCOPE) {
            let level = this._level;
            let count = SCOPE_LEVELS[level];
            SCOPE_QUEUE[level][count] = this;
            SCOPE_LEVELS[level] = count + 1;
            if (CLOCK._scopes++ === 0) {
                CLOCK._minlevel =
                    CLOCK._maxlevel = level;
            } else {
                if (level < CLOCK._minlevel) {
                    CLOCK._minlevel = level;
                }
                if (level > CLOCK._maxlevel) {
                    CLOCK._maxlevel = level;
                }
            }
        } else {
            EFFECT_QUEUE[CLOCK._effects++] = this;
        }
    };
}



/**
 * @param {!Effect} node
 * @returns {void}
 */
function startEffect(node) {
    let state = CLOCK._state;
    try {
        runEffect(node);
        if (CLOCK._signals > 0 || CLOCK._disposes > 0) {
            start(CLOCK);
        }
    } catch (err) {
        let recovered = tryRecover(node, err);
        node._dispose();
        if (!recovered) {
            throw err;
        }
    } finally {
        CLOCK._state = state;
    }
}

/**
 * @template U,V,W
 * @param {!Effect<U,V,W>} node
 * @returns {void}
 */
function runEffect(node) {
    let opts = node._flag;
    if (opts & Flag._SETUP) {
        node._flag &= ~Flag._SETUP;
    } else if ((opts & Flag._SCOPE) || node._cslot > 0) {
        clearOwned(node);
    }
    /** @type {(function(): void) | null | undefined} */
    let value;
    let fn = node._fn;
    let args = node._args;
    let state = CLOCK._state;
    let scope = CLOCK._scope;
    node._flag = (node._flag | Flag._RUNNING) & ~(Flag._RDEP1 | Flag._RDEP2);
    CLOCK._state &= RESET;
    if (opts & Flag._SCOPE) {
        CLOCK._scope = node;
        CLOCK._state |= State._OWNER | State._SCOPE;
    }
    if (opts & Flag._BOUND) {
        let dep1 = node._dep1;
        let dep2 = node._dep2;
        if (dep2 === null) {
            value = fn(node, dep1.peek(), args);
        } else {
            value = fn(node, dep1.peek(), dep2.peek(), args);
        }
    } else {
        if ((opts & (Flag._STABLE | Flag._SETUP)) === Flag._STABLE) {
            value = fn(node, args);
        } else {
            node._version = ++CLOCK._version;
            if (opts & Flag._SETUP) {
                value = fn(node, args);
            } else {
                node._dephead = 0;
                node._deptail = node._deps !== null ? node._deps.length / 2 : 0;
                let innerState = (
                    (node._dep1 !== null ? Flag._RDEP1 : 0) |
                    (node._dep2 !== null ? Flag._RDEP2 : 0)
                );
                value = fn(node, args);
                let newtail = node._deps !== null ? node._deps.length / 2 : 0;
                pruneDeps(node, node._dephead, node._deptail, newtail, innerState, (node._flag & (Flag._RDEP1 | Flag._RDEP2)));
            }
        }
    }
    CLOCK._state = state;
    CLOCK._scope = scope;
    node._flag &= ~(Flag._RUNNING | Flag._STALE);
    if (typeof value === 'function') {
        addCleanup(node, value);
    }
}

/**
 * @param {Owner} node 
 * @param {function(): void} fn
 * @returns {void} 
 */
function addCleanup(node, fn) {
    let count = node._cslot;
    switch (count) {
        case 0:
            node._cleanup = fn;
            node._cslot = 1;
            break;
        case 1:
            node._cleanup = [/** @type {function(): void} */(node._cleanup), fn];
            node._cslot = 4;
            break;
        case 2:
            node._cleanup[0] = fn;
            node._cslot = 3;
            break;
        default:
            node._cleanup[count - 2] = fn;
            node._cslot = count + 1;
    }
}

/**
 * @param {Owner} node
 * @param {function(*): boolean} fn
 * @returns {void}
 */
function addRecover(node, fn) {
    let count = node._rslot;
    switch (count) {
        case 0:
            node._recover = fn;
            node._rslot = 1;
            break;
        case 1:
            node._recover = [/** @type {function(*): boolean} */(node._recover), fn];
            node._rslot = 4;
            break;
        case 2:
            /** @type {Array<function(*): boolean>} */(node._recover)[0] = fn;
            node._rslot = 3;
            break;
        default:
            /** @type {Array<function(*): boolean>} */(node._recover)[count - 2] = fn;
            node._rslot = count + 1;
    }
    node._flag |= Flag._RECOVER;
}

/**
 * @param {Owner} node
 * @param {Receiver} child
 * @returns {void}
 */
function addOwned(node, child) {
    if (node._owned === null) {
        node._owned = [child];
    } else {
        node._owned.push(child);
    }
    node._oslot++;
}

/**
 * @param {Owner} node 
 * @param {Owner} owner
 * @returns {void}
 */
function setScope(node, owner) {
    let level = owner._level + 1;
    node._level = level;
    if (level > 3) {
        // By default we allocate 4 slots, level starts at 0, so this means we overflow
        let depth = SCOPE_LEVELS.length;
        if (level >= depth) {
            SCOPE_LEVELS[depth] = 0;
            SCOPE_QUEUE[depth] = [];
        }
    }
}

/**
 * @param {Signal} node
 */
function notify(node) {
    notifyStale(node, CLOCK._time + 1);
    start(CLOCK);
}

/**
 * @param {!Clock} clock
 * @returns {void}
 */
function start(clock) {
    /** @type {number} */
    let time = 0;
    /** @type {number} */
    let cycle = 0;
    /** @type {*} */
    let error = null;
    /** @type {boolean} */
    let thrown = false;
    clock._state = State._START;
    try {
        do {
            time = ++clock._time;
            if (clock._disposes > 0) {
                let count = CLOCK._disposes;
                let disposes = DISPOSE_QUEUE;
                for (let i = 0; i < count; i++) {
                    disposes[i]._dispose();
                    disposes[i] = null;
                }
                clock._disposes = 0;
            }
            if (clock._signals > 0) {
                let ops = SIGNAL_OPS;
                let signals = SIGNAL_QUEUE;
                let count = clock._signals;
                for (let i = 0; i < count; i++) {
                    /** @type {Signal} */
                    let signal = signals[i * 2];
                    /** @type {*} */
                    let payload = signals[i * 2 + 1];
                    switch (ops[i]) {
                        case Op.Value:
                            signal._value = payload;
                            break;
                        case Op.Callback:
                            break;
                    }
                    if (signal._flag & Flag._STALE) {
                        signal._flag &= ~Flag._STALE;
                        notifyStale(signal, time);
                    }
                    signals[i * 2] =
                        signals[i * 2 + 1] = null;
                }
                clock._signals = 0;
            }
            if (clock._computes > 0) {
                let i = 0;
                let computes = COMPUTE_QUEUE;
                clock._state |= State._COMPUTE;
                while (i < clock._computes) {
                    let count = clock._computes;
                    for (; i < count; i++) {
                        let node = computes[i];
                        if (node._flag & Flag._STALE) {
                            runCompute(node, time);
                        }
                        computes[i] = null;
                    }
                }
                clock._state &= ~State._COMPUTE;
                clock._computes = 0;
            }
            if (clock._signals > 0 || clock._disposes > 0) {
                if (cycle++ === 1e5) {
                    error = new Error('Runaway cycle');
                    thrown = true;
                    break;
                }
                continue;
            }
            if (clock._scopes > 0) {
                let minlevel = clock._minlevel;
                let maxlevel = clock._maxlevel;
                let levels = SCOPE_LEVELS;
                let scopes = SCOPE_QUEUE;
                for (let i = minlevel; i <= maxlevel; i++) {
                    let effects = scopes[i];
                    let count = levels[i];
                    for (let j = 0; j < count; j++) {
                        let node = effects[j];
                        if (node._flag & Flag._STALE) {
                            try {
                                runEffect(node);
                            } catch (err) {
                                clock._state = State._START;
                                let recovered = tryRecover(node, err);
                                node._dispose();
                                if (!recovered && !thrown) {
                                    error = err;
                                    thrown = true;
                                }
                            }
                        }
                        effects[j] = null;
                    }
                    levels[i] = 0;
                }
                clock._scopes =
                    clock._minlevel =
                    clock._maxlevel = 0;
            }
            if (clock._effects > 0) {
                let count = clock._effects;
                let effects = EFFECT_QUEUE;
                for (let i = 0; i < count; i++) {
                    let node = effects[i];
                    if (node._flag & Flag._STALE) {
                        try {
                            runEffect(node);
                        } catch (err) {
                            clock._state = State._START;
                            let recovered = tryRecover(node, err);
                            node._dispose();
                            if (!recovered && !thrown) {
                                error = err;
                                thrown = true;
                            }
                        }
                    }
                    effects[i] = null;
                }
                clock._effects = 0;
            }
            if (cycle++ === 1e5) {
                error = new Error('Runaway cycle');
                thrown = true;
                break;
            }
        } while (
            !thrown &&
            clock._signals > 0 ||
            clock._computes > 0 ||
            clock._disposes > 0
        );
    } finally {
        clock._state = State._IDLE;
        if (clock._scopes > 0) {
            let min = clock._minlevel;
            let max = clock._maxlevel;
            while (min < max) {
                SCOPE_LEVELS[min++] = 0;
            }
        }
        clock._disposes =
            clock._signals =
            clock._computes =
            clock._effects =
            clock._scopes =
            clock._minlevel =
            clock._maxlevel = 0;
        if (thrown) {
            throw error;
        }
    }
}

/**
 * @param {Sender} send 
 * @param {Receiver} receive 
 * @param {number} depslot
 * @returns {number}
 */
function subscribe(send, receive, depslot) {
    /** @type {number} */
    let subslot = 0;
    if (send._sub1 === null) {
        send._sub1 = receive;
        send._sub1slot = depslot;
        /* subslot = 0 */
    } else if (send._subs === null) {
        subslot = 1;
        send._subs = [receive, depslot];
    } else {
        subslot = (send._subs.length / 2) + 1;
        send._subs.push(receive, depslot);
    }
    if (!(send._flag & Flag._TRACKED) && (receive.t === Type._COMPUTE)) {
        send._flag |= Flag._TRACKED;
    }
    return subslot;
}

/**
 * @param {Sender} send 
 * @param {number} slot 
 * @returns {void}
 */
function clearReceiver(send, slot) {
    if (slot === 0) {
        send._sub1 = null;
    } else {
        let subs = send._subs;
        let lastSlot = /** @type {number} */(subs.pop());
        let lastNode = /** @type {Receiver} */(subs.pop());
        let realIndex = (slot - 1) * 2;
        if (realIndex !== subs.length) {
            subs[realIndex] = lastNode;
            subs[realIndex + 1] = lastSlot;
            if (lastSlot === 0) {
                lastNode._dep1slot = slot;
            } else if (lastSlot === 1) {
                lastNode._dep2slot = slot;
            } else {
                lastNode._deps[(lastSlot - 2) * 2 + 1] = slot;
            }
        }
    }
}

/**
 * Removes dep at depslot from receive's list. Swap-with-last O(1).
 * Arrays are always kept packed — no null gaps ever exist inside them.
 * @param {Receiver} receive
 * @param {number} slot
 * @returns {void}
 */
function clearSender(receive, slot) {
    if (slot === 0) {
        receive._dep1 = null;
    } else if (slot === 1) {
        receive._dep2 = null;
    } else {
        let deps = receive._deps;
        let lastSlot = /** @type {number} */(deps.pop());
        let lastNode = /** @type {Sender} */(deps.pop());
        let realIndex = (slot - 2) * 2;
        if (realIndex !== deps.length) {
            deps[realIndex] = lastNode;
            deps[realIndex + 1] = lastSlot;
            if (lastSlot === 0) {
                lastNode._sub1slot = slot;
            } else {
                lastNode._subs[(lastSlot - 1) * 2 + 1] = slot;
            }
        }
    }
    if (receive._dep1 === null && receive._dep2 === null && (receive._deps === null || receive._deps.length === 0)) {
        if (receive.t === Type._EFFECT) {
            // todo
        } else {
            /** @type {Compute} */(receive)._fn = null;
        }
    }
}

/**
 * Removes receive from all its deps' subscriber lists.
 * @param {Receiver} receive
 * @returns {void}
 */
function clearDeps(receive) {
    let dep = receive._dep1;
    if (dep !== null) {
        clearReceiver(dep, receive._dep1slot);
        receive._dep1 = null;
    }
    dep = receive._dep2;
    if (dep !== null) {
        clearReceiver(dep, receive._dep2slot);
        receive._dep2 = null;
    }
    let deps = receive._deps;
    if (deps !== null) {
        let len = deps.length;
        for (let i = 0; i < len; i += 2) {
            clearReceiver(/** @type {Sender} */(deps[i]), /** @type {number} */(deps[i + 1]));
        }
        receive._deps = null;
    }
}

/**
 * @param {Sender} send
 * @returns {void}
 */
function clearSubs(send) {
    let sub = send._sub1;
    if (sub !== null) {
        clearSender(sub, send._sub1slot);
        send._sub1 = null;
    }
    let subs = send._subs;
    if (subs !== null) {
        let len = subs.length;
        for (let i = 0; i < len; i += 2) {
            clearSender(/** @type {Receiver} */(subs[i]), /** @type {number} */(subs[i + 1]));
        }
        send._subs = null;
    }
}

/**
 * @param {Owner} owner
 * @returns {void} 
 */
function clearOwned(owner) {
    if (owner._flag & Flag._SCOPE) {
        let owned = owner._owned;
        if (owned !== null) {
            let len = owner._oslot;
            for (let i = 0; i < len; i++) {
                owned[i]._dispose();
                owned[i] = null;
            }
            owner._oslot = 0;
        }
    }
    let clpcount = owner._cslot;
    if (clpcount > 0) {
        let cleanup = owner._cleanup;
        if (clpcount === 1) {
            owner._cleanup = null;
            owner._cslot = 0;
                /** @type {function(): void} */(cleanup)();
        } else {
            let len = clpcount - 2;
            for (let i = 0; i < len; i++) {
                    /** @type {Array<function(): void>} */(cleanup)[i]();
                cleanup[i] = null;
            }
            owner._cslot = 2;
        }
    }
    let rcvcount = owner._rslot;
    if (rcvcount > 0) {
        if (rcvcount === 1) {
            owner._recover = null;
            owner._rslot = 0;
        } else {
            let len = rcvcount - 2;
            let recover = /** @type {Array<function(*): boolean>} */(owner._recover);
            for (let i = 0; i < len; i++) {
                recover[i] = null;
            }
            owner._rslot = 2;
        }
        owner._flag &= ~Flag._RECOVER;
    }
}

/**
 * Walks the ownership chain looking for recover handlers.
 * @param {Effect} node
 * @param {*} error
 * @returns {boolean} true if error was handled
 */
function tryRecover(node, error) {
    let owner = node._owner;
    while (owner !== null) {
        if (owner._flag & Flag._RECOVER) {
            let count = owner._rslot;
            if (count === 1) {
                if (/** @type {function(*): boolean} */(owner._recover)(error) === true) {
                    return true;
                }
            } else if (count > 2) {
                let fns = /** @type {Array<function(*): boolean>} */(owner._recover);
                let len = count - 2;
                for (let i = 0; i < len; i++) {
                    if (fns[i](error) === true) {
                        return true;
                    }
                }
            }
        }
        owner = owner._owner;
    }
    return false;
}

/**
 * @param {Receiver} node
 * @returns {boolean}
 */
function unbound(node) {
    return (
        node._dep1 === null &&
        node._dep2 === null &&
        (
            node._deps === null ||
            node._deps.length === 0
        )
    )
}

// ─── Dynamic dep sweep ───────────────────────────────────────────────────────

/**
 * After a dynamic fn re-execution, reconciles dep subscriptions.
 *
 * dep1/dep2 are resolved via the oldstate/newstate DEP1/DEP2 bits:
 * oldstate & DEP1  → dep1 existed before the run
 * newstate & DEP1  → dep1 was reused (recycled in-order)
 *
 * Array deps (_deps[]) have three regions by index:
 * [0 .. recycled)    — reused in-order (already subscribed, no action)
 * [recycled .. oldlen) — stale (unsubscribe, unless also in new range)
 * [oldlen .. newlen)   — newly added (subscribeSlot, then compact down)
 *
 * To detect a dep that appears in both stale and new ranges (missed during
 * in-order recycling but re-accessed this run), we tag new deps with VERSION
 * before the stale pass. Stale deps carrying the tag are moved to the write
 * position instead of being unsubscribed. In the new-range pass, those deps
 * are ejected (their duplicate new subscription is removed) via fast remove.
 *
 * @param {Receiver} node
 * @param {number} head
 * @param {number} tail
 * @param {number} newtail
 * @param {number} state
 * @param {number} newstate
 * @returns {void}
 */
function pruneDeps(node, head, tail, newtail, state, newstate) {
    if (head === tail && tail === newtail && state === newstate) {
        return;
    }

    // dep1
    if (state & Flag._RDEP1) {
        if (!(newstate & Flag._RDEP1)) {
            clearReceiver(node._dep1, node._dep1slot);
            node._dep1 = null;
        }
        // else: reused, nothing to do
    }

    // dep2
    if (state & Flag._RDEP2) {
        if (!(newstate & Flag._RDEP2)) {
            clearReceiver(node._dep2, node._dep2slot);
            node._dep2 = null;
        }
        // else: reused, nothing to do
    }

    if (newtail > 0) {
        let deps = node._deps;
        let version = node._version;

        // Phase 2: stale range [recycled..oldlen)
        // Deps also tagged (VERSION) were re-accessed this run: reuse at write position.
        // Truly stale deps (no tag): unsubscribe.
        let write = head;
        for (let i = head; i < tail; i++) {
            let idx = i * 2;
            let dep = /** @type {Sender} */(deps[idx]);
            if (dep._version === version) {
                if (write !== i) {
                    let subslot = /** @type {number} */(deps[idx + 1]);
                    let depslot = write + 2;
                    let writeIdx = write * 2;
                    deps[writeIdx] = dep;
                    deps[writeIdx + 1] = subslot;
                    if (subslot === 0) {
                        dep._sub1slot = depslot;
                    } else {
                        dep._subs[(subslot - 1) * 2 + 1] = depslot;
                    }
                }
                dep._version = 0;
                write++;
            } else {
                clearReceiver(dep, /** @type {number} */(deps[idx + 1]));
            }
        }

        // Phase 3: new range [oldlen..newlen)
        // Deps cleared to 0 (handled in phase 2): eject with fast remove, removing
        // the duplicate new subscription. Genuinely new deps: compact and subscribe.
        let end = newtail;

        // Step 1: Fill any structural holes left by Phase 2 [write .. oldlen)
        // We pop from `end` downwards, placing valid new deps into the holes.
        while (write < tail && end > tail) {
            end--;
            let endIdx = end * 2;
            let dep = /** @type {Sender} */(deps[endIdx]);
            let subslot = /** @type {number} */(deps[endIdx + 1]);
            if (dep._version === 0) {
                // It's a duplicate at the end. Unsubscribe it and throw it away.
                clearReceiver(dep, subslot);
            } else {
                // It's a valid new dep. Move it to the first available hole.
                let writeIdx = write * 2;
                deps[writeIdx] = dep;
                deps[writeIdx + 1] = subslot;
                let depslot = write + 2;
                if (subslot === 0) {
                    dep._sub1slot = depslot;
                } else {
                    dep._subs[(subslot - 1) * 2 + 1] = depslot;
                }
                dep._version = 0; // Clear the tag
                write++;
            }
        }

        // Step 2: Handle any remaining new deps
        if (write < tail) {
            // We ran out of new deps to fill the Phase 2 holes. 
            // The array ends exactly at `write`.
            end = write;
        } else if (tail < end) {
            // All Phase 2 holes are filled. Now we scan the remaining new deps in-place.
            let read = tail;
            while (read < end) {
                let readIdx = read * 2;
                let dep = /** @type {Sender} */(deps[readIdx]);

                if (dep._version === 0) {
                    // It's a duplicate. Unsubscribe it.
                    clearReceiver(dep, /** @type {number} */(deps[readIdx + 1]));
                    end--;
                    while (read < end) {
                        let endIdx = end * 2;
                        dep = /** @type {Sender} */(deps[endIdx]);
                        let subslot = /** @type {number} */(deps[endIdx + 1]);
                        if (dep._version === 0) {
                            clearReceiver(dep, subslot);
                            end--;
                        } else {
                            // Swap the last item into the current read position
                            deps[readIdx] = dep;
                            deps[readIdx + 1] = subslot;
                            let depslot = write + 2;
                            if (subslot === 0) {
                                dep._sub1slot = depslot;
                            } else {
                                dep._subs[(subslot - 1) * 2 + 1] = depslot;
                            }
                            break;
                        }
                    }
                } else {
                    // Valid new dep, already in its final position.
                    dep._version = 0; // Clear the tag
                    read++;
                }
            }
        }
        // Finalize write pointer
        write = end;
        if (write === 0) {
            node._deps = null;
        } else {
            deps.length = write * 2;
        }
    }
}

/**
 * * @param {Compute} send 
 * @param {number} time
 * @returns {void}
 */
function notifyPending(send, time) {
    let sub = /** @type {Compute} */(send._sub1);
    if (sub !== null && (sub.t === Type._COMPUTE) && sub._ptime < time) {
        sub._ptime = time;
        sub._flag |= Flag._PENDING;
        if (sub._flag & Flag._TRACKED) {
            notifyPending(sub, time);
        }
    }
    let subs = send._subs;
    if (subs !== null) {
        let len = subs.length;
        for (let i = 0; i < len; i += 2) {
            sub = /** @type {Compute} */(subs[i]);
            if ((sub.t === Type._COMPUTE) && sub._ptime < time) {
                sub._ptime = time;
                sub._flag |= Flag._PENDING;
                if (sub._flag & Flag._TRACKED) {
                    notifyPending(sub, time);
                }
            }
        }
    }
}

/**
 * * @param {Sender} send 
 * @param {number} time
 * @returns {void} 
 */
function notifyStale(send, time) {
    /** @type {Receiver} */
    let sub = send._sub1;
    if (sub !== null && sub._time < time) {
        sub._setStale(time);
    }
    /** @type {Array<Receiver | number> | null} */
    let subs = send._subs;
    if (subs !== null) {
        let len = subs.length;
        for (let i = 0; i < len; i += 2) {
            sub = /** @type {Receiver} */(subs[i]);
            if (sub._time < time) {
                sub._setStale(time);
            }
        }
    }
}

/**
 * @param {function(): ((function(): void) | void)} fn
 * @returns {Root}
 */
function root(fn) {
    let node = new Root();
    startRoot(node, fn);
    return node;
}

/**
 * @template T
 * @param {T} value 
 * @returns {Signal<T>}
 */
function signal(value) {
    return new Signal(value);
}

/**
 * @template T,W
 * @param {function(T,W): T} fn
 * @param {T=} seed
 * @param {number=} opts
 * @param {W=} args 
 * @returns {Compute<T,W>}
 */
function compute(fn, seed, opts, args) {
    let _flag = Flag._SETUP | ((0 | opts) & OPTIONS);
    let node = new Compute(_flag, fn, null, null, seed, args);
    startCompute(node);
    return node;
}

/**
 * @template W
 * @param {function(): (function(): void | void)} fn 
 * @param {number=} opts
 * @param {W=} args
 * @returns {Effect<null,null,W>}
 */
function effect(fn, opts, args) {
    let _flag = Flag._SETUP | ((0 | opts) & OPTIONS);
    let node = new Effect(_flag, fn, null, null, args);
    startEffect(node);
    return node;
}

/**
 * @param {function(): (function(): void | void)} fn
 * @param {number=} opts
 * @returns {Effect}
 */
function scope(fn, opts) {
    let _flag = Flag._SETUP | Flag._SCOPE | ((0 | opts) & OPTIONS);
    let node = new Effect(_flag, fn, null, null);
    let state = CLOCK._state;
    if (state & State._SCOPE) {
        setScope(node, CLOCK._scope);
    }
    startEffect(node);
    return node;
}

/**
 * @param {function(): void} fn
 * @returns {void}
 */
function batch(fn) {
    let clock = CLOCK;
    if (clock._state & State._IDLE) {
        clock._state = State._START;
        try {
            fn();
            start(clock);
        } finally {
            clock._state = State._IDLE;
        }
    } else {
        fn();
    }
}

export {
    CLOCK,
    State,
    Flag,
    Op,
    Mut,
    AsyncType,
    RESET,
    OPTIONS,
    notify,
    scheduleSignal,
    subscribe,
}

export {
    Opt,
    Type,
    Root,
    Signal,
    Compute,
    Effect,
    root,
    signal,
    compute,
    effect,
    scope,
    batch
}
