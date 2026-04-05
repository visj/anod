import { Anod } from "./api.js";
import { Disposer, Owner, Sender, Receiver, Clock, ISignal, ICompute, IEffect } from "./types.js";

/** @const {number} */ const OP_VALUE = 1 << 30;
/** @const {number} */ const OP_CALLBACK = 1 << 29;

/** @const {Array<function(Signal, *): void>} */
var CALLBACKS = [];

/**
 * Registers a callback for deferred signal operations.
 * Returns an op value (callback index | OP_CALLBACK flag) that can be
 * passed to scheduleSignal. When the transaction loop processes the
 * entry, it calls CALLBACKS[op & ~OP_CALLBACK](signal, payload).
 * @param {function(Signal, *): void} fn
 * @returns {number}
 */
function register(fn) {
    let index = CALLBACKS.length;
    CALLBACKS[index] = fn;
    return index | OP_CALLBACK;
}

/**
 * Mutation tracking bit layout (32-bit unsigned via >>> 0):
 *
 *   Bits  0– 2 : op type   (MUT_ADD=1, MUT_DEL=2, MUT_SORT=4)
 *   Bits  3–14 : length    (12 bits, max 4095 — affected region extent)
 *   Bits 15–31 : position  (17 bits, max 131071 — mutation start index)
 */
/** @const {number} */ const MUT_ADD = 1;
/** @const {number} */ const MUT_DEL = 2;
/** @const {number} */ const MUT_SORT = 4;
/** @const {number} */ const MUT_OP_MASK = 7;
/** @const {number} */ const MUT_LEN_SHIFT = 3;
/** @const {number} */ const MUT_LEN_MASK = 0xFFF;
/** @const {number} */ const MUT_POS_SHIFT = 15;
/** @const {number} */ const MUT_POS_MASK = 0x1FFFF;

/**
 * Context state bits, stored on Subscriber._state.
 * Encodes per-execution state that the user can set
 * via the IReader API during a compute/effect fn.
 */
/** @const {number} */ const CTX_EQUAL = 1;
/** @const {number} */ const CTX_NOTEQUAL = 2;
/** @const {number} */ const CTX_PROMISE = 4;
/** @const {number} */ const CTX_ITERABLE = 8;
/** @const {number} */ const CTX_ASYNC = CTX_PROMISE | CTX_ITERABLE;

/** @const {number} */ const FLAG_DEFER = 1;
/** @const {number} */ const FLAG_STABLE = 2;
/** @const {number} */ const FLAG_SETUP = 4;
/** @const {number} */ const FLAG_STALE = 8;
/** @const {number} */ const FLAG_NOTIFY = 16;
/** @const {number} */ const FLAG_PENDING = 32;
/** @const {number} */ const FLAG_RUNNING = 64;
/** @const {number} */ const FLAG_DISPOSED = 128;
/** @const {number} */ const FLAG_LOADING = 256;
/** @const {number} */ const FLAG_ERROR = 512;
/** @const {number} */ const FLAG_RECOVER = 1024;
/** @const {number} */ const FLAG_BOUND = 2048;
/** @const {number} */ const FLAG_DERIVED = 4096;
/** @const {number} */ const FLAG_SCOPE = 8192;
/** @const {number} */ const FLAG_WEAK = 16384;
/**
 * Runtime bit set/cleared by the equal() method during a compute
 * execution.  Separate from FLAG_NOTIFY (the opt) so both features
 * can coexist on a single node.
 * Set  → "I am equal, suppress notification"
 * Clear → default; or if the user explicitly calls equal(false),
 *         the absence of FLAG_EQUAL combined with the absence of
 *         FLAG_NOTIFY triggers forced notification (see FLAG_NOTEQUAL).
 */
/** @const {number} */ const FLAG_EQUAL = 0x40000;
/**
 * Runtime bit set by equal(false) to indicate "I am NOT equal,
 * force notification regardless of value change".
 */
/** @const {number} */ const FLAG_NOTEQUAL = 0x80000;
/**
 * Set in Compute/Effect constructors, cleared after the first
 * runCompute/runEffect.  Lets optimization code distinguish a
 * never-executed node from one whose previous value is valid.
 */
/** @const {number} */ const FLAG_INIT = 0x100000;
/** @const {number} */ const FLAG_ASYNC = 0x200000;
/** @const {number} */ const FLAG_STREAM = 0x400000;

/** @const {number} */ const OPT_DEFER = FLAG_DEFER;
/** @const {number} */ const OPT_STABLE = FLAG_STABLE;
/** @const {number} */ const OPT_SETUP = FLAG_SETUP;
/** @const {number} */ const OPT_NOTIFY = FLAG_NOTIFY;
/** @const {number} */ const OPT_WEAK = FLAG_WEAK;
/**
 * Opt-in to dynamic dependency tracking. Only consumed at
 * construction time by task/spawn/scope to suppress the default
 * FLAG_STABLE. Not stored in node._flag — not in OPTIONS mask.
 */
/** @const {number} */ const OPT_DYNAMIC = 0x800000;

/** @const {number} */
const OPTIONS = OPT_DEFER | OPT_STABLE | OPT_SETUP | OPT_NOTIFY | OPT_WEAK | FLAG_ASYNC | FLAG_STREAM;

/** @const {number} */ const STATE_START = 0;
/** @const {number} */ const STATE_IDLE = 1;
/** @const {number} */ const STATE_OWNER = 8;
/** @const {number} */ const STATE_SCOPE = 16;

/** @const {number} */
const RESET = ~(STATE_IDLE | STATE_OWNER);

/** @const {number} */ const TYPEFLAG_MASK = 7;
/** @const {number} */ const TYPEFLAG_SEND = 8;
/** @const {number} */ const TYPEFLAG_RECEIVE = 16;
/** @const {number} */ const TYPEFLAG_OWNER = 32;

/** @const {number} */ const TYPE_ROOT = 1 | TYPEFLAG_OWNER;
/** @const {number} */ const TYPE_SIGNAL = 2 | TYPEFLAG_SEND;
/** @const {number} */ const TYPE_COMPUTE = 3 | TYPEFLAG_SEND | TYPEFLAG_RECEIVE;
/** @const {number} */ const TYPE_EFFECT = 4 | TYPEFLAG_OWNER | TYPEFLAG_RECEIVE;

/**
 * 
 * @returns {!Clock}
 */
function clock() {
    let c = {
        _state: STATE_IDLE,
        _time: 1,
        _version: 1,
        _minlevel: 0,
        _maxlevel: 0,
        _disposes: 0,
        _signals: 0,
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

/**
 * Pre-allocated queues. Fixed initial capacity avoids
 * V8 backing store growth/shrink churn when arrays are
 * filled and then nulled out every transaction cycle.
 * @const {number}
 */
var QUEUE_SIZE = 64;

/** @const @type {Array<Disposer>} */
var DISPOSE_QUEUE = new Array(QUEUE_SIZE);

/** @const @type {Array<number>} */
var SIGNAL_OPS = new Array(QUEUE_SIZE);
/** @const @type {Array} */
var SIGNAL_QUEUE = new Array(QUEUE_SIZE * 2);

/** @const @type {Array<number>} */
var SCOPE_LEVELS = [0, 0, 0, 0];
/** @const @type {Array<Array<Effect>>} */
var SCOPE_QUEUE = [[], [], [], []];
/** @const @type {Array<Effect>} */
var EFFECT_QUEUE = new Array(QUEUE_SIZE);


/**
 *
 * @param {*} value
 * @returns {boolean} 
 */
function isSignal(value) {
    return value !== null && typeof value === 'object' && (/** @type {Anod} */(value).t & TYPEFLAG_SEND) !== 0;
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

export { isPrimitive, isNumber, isFunction, isSignal }

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
 * @this {Disposer}
 * @returns {void}
 */
function dispose() {
    if (!(this._flag & FLAG_DISPOSED)) {
        if (CLOCK._state & STATE_IDLE) {
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
function error() {
    return (this._flag & FLAG_ERROR) !== 0;
}

/**
 * @this {!Receiver}
 * @returns {boolean}
 */
function loading() {
    return (this._flag & FLAG_LOADING) !== 0;
}


/**
 * Binds a compute to a single sender. The fn receives
 * (ctx, senderValue, prevValue, args).
 * @template T,V,W
 * @this {!Sender<T>}
 * @param {function(T,V,W): V} fn
 * @param {V=} seed
 * @param {number=} opts
 * @param {W=} args
 * @returns {!Compute<V,T,null,W>}
 */
function deriveOne(fn, seed, opts, args) {
    let _flag = FLAG_BOUND | FLAG_STABLE | ((0 | opts) & OPTIONS);
    let node = new Compute(_flag, fn, this, seed, args);
    node._dep1slot = subscribe(this, node, 0);
    if (!(_flag & FLAG_DEFER)) {
        startCompute(node);
    }
    return node;
}

/**
 * Binds an effect to a single sender. The fn receives
 * (ctx, senderValue, args).
 * @template T,W
 * @this {!Sender<T>}
 * @param {function(T,W): (function(): void | void)} fn
 * @param {number=} opts
 * @param {W=} args
 * @returns {!Effect<T,null,W>}
 */
function watchOne(fn, opts, args) {
    let _flag = FLAG_BOUND | FLAG_STABLE | ((0 | opts) & OPTIONS);
    let node = new Effect(_flag, fn, this, args);
    node._dep1slot = subscribe(this, node, 0);
    if (!(_flag & FLAG_DEFER)) {
        startEffect(node);
    }
    return node;
}

/**
 * Stable compute. Tracks deps on first run, then never
 * re-tracks. Like compute() with implicit OPT_STABLE.
 * @template T,W
 * @param {function(T,W): T} fn
 * @param {T=} seed
 * @param {W=} args
 * @returns {!Compute<T,null,null,W>}
 */
function derive(fn, seed, args) {
    let node = new Compute(FLAG_STABLE | FLAG_SETUP, fn, null, seed, args);
    startCompute(node);
    return node;
}

/**
 * Stable effect. Tracks deps on first run, then never
 * re-tracks. Like effect() with implicit OPT_STABLE.
 * @template W
 * @param {function(W): (function(): void | void)} fn
 * @param {W=} args
 * @returns {!Effect<null,null,W>}
 */
function watch(fn, args) {
    let node = new Effect(FLAG_STABLE | FLAG_SETUP, fn, null, args);
    startEffect(node);
    return node;
}

/**
 * Stable compute with OPT_NOTIFY. Always propagates STALE
 * downstream regardless of value equality.
 * @template T,W
 * @param {function(T,W): T} fn
 * @param {T=} seed
 * @param {W=} args
 * @returns {!Compute<T,null,null,W>}
 */
function transmit(fn, seed, args) {
    let node = new Compute(FLAG_STABLE | FLAG_SETUP | FLAG_NOTIFY, fn, null, seed, args);
    startCompute(node);
    return node;
}

/**
 * Lightweight execution context for stable/bound nodes.
 * read() just returns sender.val() without tracking deps.
 * @constructor
 */
/**
 * Execution context used for stable, bound, and SETUP paths.
 * Singleton — safe to share because it only reads val() or
 * writes deps directly to the node (no per-execution state
 * beyond _node/_version which are saved/restored by callers).
 * @constructor
 */
function Reader() {
    /** @type {Receiver | null} */
    this._node = null;
    /** @type {number} */
    this._state = 0;
    /** @type {number} */
    this._version = 0;
}

/** @const */
var ReaderProto = Reader.prototype;

/**
 * In stable/bound mode: just returns sender.val().
 * In SETUP mode (FLAG_SETUP set on node): subscribes
 * the dep directly on the node.
 * @template T
 * @param {!Sender<T>} sender
 * @returns {T}
 */
ReaderProto.read = function (sender) {
    let node = this._node;
    let value = sender.val();
    if (!(node._flag & FLAG_SETUP)) {
        return value;
    }
    let version = this._version;
    /** Dedup: already subscribed this cycle */
    if (sender._version === version) {
        return value;
    }
    sender._version = version;
    /** @type {number} */
    let depslot = 0;
    if (node._dep1 === null) {
        node._dep1 = sender;
    } else if (node._deps === null) {
        depslot = 1;
    } else {
        depslot = (node._deps.length / 2) + 1;
    }
    let subslot = subscribe(sender, node, depslot);
    switch (depslot) {
        case 0: node._dep1slot = subslot; break;
        case 1: node._deps = [sender, subslot]; break;
        default: node._deps.push(sender, subslot);
    }
    return value;
};

/**
 * Execution context for re-execution with dynamic deps.
 * Holds per-execution reconciliation state (_reused, _dep1,
 * _deps, _count) that cannot be shared. Must be pooled.
 * @constructor
 */
function Subscriber() {
    /** @type {Receiver | null} */
    this._node = null;
    /** @type {number} */
    this._version = 0;
    /**
     * Per-execution state bits (CTX_EQUAL, CTX_NOTEQUAL,
     * CTX_PROMISE, CTX_ITERABLE). Reset each execution.
     * @type {number}
     */
    this._state = 0;
    /** @type {number} */
    this._reused = 0;
    /** @type {Sender | null} */
    this._dep1 = null;
    /** @type {Array<Sender> | null} */
    this._deps = null;
    /** @type {number} */
    this._count = 0;
}

/** @const */
var SubscriberProto = Subscriber.prototype;

/**
 * Re-execution path only. All existing deps were pre-stamped
 * with version - 1 before fn() was called. Confirms reused
 * deps or collects new ones.
 * @template T
 * @param {!Sender<T>} sender
 * @returns {T}
 */
SubscriberProto.read = function (sender) {
    let value = sender.val();
    let version = this._version;
    if (sender._version === version) {
        /** Already read this cycle (dedup) */
        return value;
    }
    if (sender._version === version - 1) {
        /** Existing dep, confirm it */
        sender._version = version;
        this._reused++;
        return value;
    }
    /** New dep — tag and collect in subscriber overflow */
    sender._version = version;
    let count = this._count;
    if (count === 0) {
        this._dep1 = sender;
    } else if (count === 1) {
        this._deps = [sender];
    } else {
        this._deps.push(sender);
    }
    this._count = count + 1;
    return value;
};

/**
 * Shared method: declares that this compute's output is
 * semantically equal to its previous value.
 * @param {boolean=} eq
 * @returns {void}
 */
function _equal(eq) {
    if (eq === false) {
        this._state = (this._state | CTX_NOTEQUAL) & ~CTX_EQUAL;
    } else {
        this._state = (this._state | CTX_EQUAL) & ~CTX_NOTEQUAL;
    }
}

/**
 * Shared method: marks the current node as stable (no more
 * dynamic dep tracking on subsequent runs).
 * @returns {void}
 */
function _stable() {
    this._node._flag |= FLAG_STABLE;
}

/**
 * Shared method: returns whether the current node is in error state.
 * @returns {boolean}
 */
function _error() {
    return (this._node._flag & FLAG_ERROR) !== 0;
}

/**
 * Shared method: returns whether the current node is loading (async pending).
 * @returns {boolean}
 */
function _loading() {
    return (this._node._flag & FLAG_LOADING) !== 0;
}

/**
 * Shared method: registers a cleanup function on the current node.
 * Only valid when the node is an Owner (Effect/Scope).
 * @param {function(): void} fn
 * @returns {void}
 */
function _cleanup(fn) {
    addCleanup(this._node, fn);
}

/**
 * Shared method: registers a recover handler on the current node.
 * Only valid when the node is an Owner (Effect/Scope).
 * @param {function(*): boolean} fn
 * @returns {void}
 */
function _recover(fn) {
    addRecover(this._node, fn);
}

/**
 * Returns the mutation descriptor from the first dependency.
 * Used by anod-list to optimize array operations.
 * @returns {number}
 */
function _getMod() {
    return this._node._dep1._mod;
}

ReaderProto.equal = SubscriberProto.equal = _equal;
ReaderProto.stable = SubscriberProto.stable = _stable;
ReaderProto.error = SubscriberProto.error = _error;
ReaderProto.loading = SubscriberProto.loading = _loading;
ReaderProto.cleanup = SubscriberProto.cleanup = _cleanup;
ReaderProto.recover = SubscriberProto.recover = _recover;
ReaderProto._getMod = SubscriberProto._getMod = _getMod;

/**
 * Reader is a singleton: it only writes deps to the node (not
 * to itself), so nested runCompute calls just save/restore
 * _node and _version on the stack. Safe for any nesting depth.
 * @type {Reader}
 */
var READER = new Reader();

/**
 * Subscriber pool for the re-execution path. Each Subscriber
 * holds per-execution reconciliation state (_reused, _dep1,
 * _count) that must not be shared. Claiming increments the
 * index; releasing decrements it.
 * @const {number}
 */
var POOL_SIZE = 10;
/** @type {Array<Subscriber>} */
var SUBSCRIBER_POOL = new Array(POOL_SIZE);
/** @type {number} */
var SUBSCRIBER_IDX = 0;
for (var _i = 0; _i < POOL_SIZE; _i++) {
    SUBSCRIBER_POOL[_i] = new Subscriber();
}

/**
 * @constructor
 * @implements {Owner}
 */
function Root() {
    /**
     * @type {number}
     */
    this._flag = FLAG_SCOPE;
    /**
     * @type {(function(): void) | Array<(function(): void)> | null}
     */
    this._cleanup = null;
    /**
     * @type {Array<Receiver> | null}
     */
    this._owned = null;
    /**
     * @type {(function(*): boolean) | Array<(function(*): boolean)> | null}
     */
    this._recover = null;
}

/** @const */
var RootProto = Root.prototype;

/**
 * @type {Owner | null}
 */
RootProto._owner = null;

/**
 * @const
 * @type {number}
 */
RootProto.t = TYPE_ROOT;

/**
 * @public
 * @this {!Root}
 * @returns {void}
 */
RootProto.dispose = dispose;

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
 * @this {!Root}
 * @returns {void}
 */
RootProto._dispose = function () {
    if (!(this._flag & FLAG_DISPOSED)) {
        this._flag |= FLAG_DISPOSED;
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
    CLOCK._state &= (RESET | STATE_IDLE);
    CLOCK._scope = root;
    CLOCK._state |= STATE_OWNER;
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
     * @type {number}
     */
    this._flag = 0 | opts;
    /**
     * @type {T}
     */
    this._value = value;
    /**
     * @type {number}
     */
    this._version = 0;
    /**
     * @type {Receiver}
     */
    this._sub1 = null;
    /**
     * @type {number}
     */
    this._sub1slot = 0;
    /**
     * @type {Array<Receiver | number> | null}
     */
    this._subs = null;
    /**
     * @type {number}
     */
    this._mod = 0;
    /**
     * Change time: stamped when this signal's value changes.
     * Used by pullCompute to detect if a dep actually changed.
     * @type {number}
     */
    this._ctime = 0;
}

{
    /** @const */
    let SignalProto = Signal.prototype;

    /**
     * @const
     * @type {number}
     */
    SignalProto.t = TYPE_SIGNAL;

    /**
     * @public
     * @returns {void}
     */
    SignalProto.dispose = dispose;

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
     * @param {T} value
     * @returns {void}
     */
    SignalProto.set = function (value) {
        if (this._value !== value) {
            if (CLOCK._state & STATE_IDLE) {
                this._value = value;
                notify(this);
            } else {
                this._flag |= FLAG_STALE;
                scheduleSignal(this, OP_VALUE, value);
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
    SignalProto.derive = deriveOne;

    /**
     * @template T,W
     * @this {!Signal<T>}
     * @param {function(T,W): (function(): void | void)} fn 
     * @param {number=} opts
     * @param {W=} args
     * @returns {Effect<T,null,W>}
     */
    SignalProto.watch = watchOne;

    /**
     * @this {!Signal<T>}
     * @returns {void}
     */
    SignalProto._dispose = function () {
        if (!(this._flag & FLAG_DISPOSED)) {
            clearSubs(this);
            this._value = null;
        }
    };
}

/**
 * @constructor
 * @template T,U,W
 * @param {number} opts
 * @param {(function(T,W): T) | (function(U,T,W,number): T)} fn
 * @param {Sender<U> | null} dep1
 * @param {T=} seed
 * @param {W=} args
 * @implements {ICompute<T>}
 */
function Compute(opts, fn, dep1, seed, args) {
    /**
     * @type {number}
     */
    this._flag = FLAG_STALE | FLAG_INIT | opts;
    /**
     * @type {T}
     */
    this._value = seed;
    /**
     * @type {number}
     */
    this._version = 0;
    /**
     * @type {Receiver}
     */
    this._sub1 = null;
    /**
     * @type {number}
     */
    this._sub1slot = 0;
    /**
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
     * @type {number}
     */
    this._dep1slot = 0;
    /**
     * @type {Array<Sender | number> | null}
     */
    this._deps = null;
    /**
     * @type {number}
     */
    this._time = 0;
    /**
     * Change time: stamped when this compute's value changes.
     * @type {number}
     */
    this._ctime = 0;
    /**
     * Pending notification time: stamped when this compute is
     * first notified (stale or pending) in a round. Acts as a
     * diamond guard — prevents exponential re-notification in
     * deep graphs where nodes share multiple upstream paths.
     * @type {number}
     */
    this._ptime = 0;
    /**
     * @type {W | undefined}
     */
    this._args = args;
    if (CLOCK._state & STATE_OWNER) {
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
    ComputeProto.t = TYPE_COMPUTE;

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
    ComputeProto.dispose = dispose;

    /**
     * @public
     * @this {!Compute<T,U,V,W>}
     * @returns {boolean}
     */
    ComputeProto.error = error;

    /**
     * @public
     * @this {!Compute<T,U,V,W>}
     * @returns {boolean}
     */
    ComputeProto.loading = loading;

    /**
     * @public
     * @throws
     * @this {!Compute<T,U,V,W>}
     * @returns {T}
     */
    ComputeProto.val = function () {
        let clock = CLOCK;
        let time = clock._time;
        let opts = this._flag;
        if (opts & FLAG_RUNNING) {
            throw new Error('Circular dependency');
        }
        if (opts & FLAG_STALE) {
            /**
             * Guaranteed change: at least one dep definitely changed
             * (Signal or OPT_NOTIFY compute). Skip pullCompute and
             * run directly — runCompute calls dep.val() which pulls
             * upstream deps current.
             */
            if (clock._state & STATE_IDLE) {
                try {
                    runCompute(this, time);
                    this._time = time;
                    if (clock._signals > 0 || clock._disposes > 0) {
                        start(clock);
                    }
                } finally {
                    clock._state = STATE_IDLE;
                }
            } else {
                runCompute(this, time);
                this._time = time;
            }
            if (this._flag & FLAG_ERROR) {
                throw this._value;
            }
        } else if (opts & FLAG_PENDING) {
            /**
             * Maybe changed: upstream compute hasn't confirmed change
             * yet. Pull to check if any dep's value actually changed.
             */
            if (clock._state & STATE_IDLE) {
                try {
                    pullCompute(this, time);
                    if (clock._signals > 0 || clock._disposes > 0) {
                        start(clock);
                    }
                } finally {
                    clock._state = STATE_IDLE;
                }
            } else {
                pullCompute(this, time);
            }
            if (this._flag & FLAG_ERROR) {
                throw this._value;
            }
        } else if (opts & FLAG_ERROR) {
            throw this._value;
        }
        return this._value;
    };

    /**
     * @template V,W
     * @this {!Compute<T>}
     * @param {function(T,V,W): T} fn 
     * @param {V=} seed 
     * @param {number=} opts 
     * @param {W=} args
     * @returns {!Compute<V,T,null,W>}
     */
    ComputeProto.derive = deriveOne;

    /**
     * @template T,W
     * @this {!Compute<T>}
     * @param {function(T,W): (function(): void | void)} fn 
     * @param {number=} opts
     * @param {W=} args
     * @returns {!Effect<T,null,W>}
     */
    ComputeProto.watch = watchOne;

    /**
     * @this {!Compute<T,U,V,W>}
     * @returns {void}
     */
    ComputeProto._dispose = function () {
        if (!(this._flag & FLAG_DISPOSED)) {
            this._flag |= FLAG_DISPOSED;
            clearSubs(this);
            clearDeps(this);
            this._fn =
                this._value =
                this._args = null;
        }
    };

    /**
     * @this {!Compute<T,U,V,W>}
     * @param {number} time
     * @returns {void} 
     */
    /**
     * Called when a guaranteed-change source (Signal or OPT_NOTIFY
     * compute) notifies this node. Uses _ptime as a diamond guard
     * to prevent exponential re-notification in deep graphs.
     *
     * If _ptime >= time, we've already been notified this round
     * (diamond case). Upgrade PENDING → STALE but don't re-propagate.
     * If _ptime < time, this is a new round — notify downstream.
     */
    ComputeProto._setStale = function (time) {
        if (this._ptime < time) {
            this._ptime = time;
            this._flag |= FLAG_STALE;
            if (this._flag & FLAG_NOTIFY) {
                notifyStale(this, time);
            } else {
                notifyPending(this, time);
            }
        } else if (!(this._flag & FLAG_STALE)) {
            /** Already notified this round but only PENDING — upgrade */
            this._flag |= FLAG_STALE;
        }
    };

    /**
     * Called when a maybe-change source (regular compute without
     * OPT_NOTIFY) notifies this node. Uses _ptime as a diamond
     * guard — if already notified this round, skip. If new round,
     * re-notify even if flags are leftover from a previous round.
     */
    ComputeProto._setPending = function (time) {
        if (this._ptime < time) {
            this._ptime = time;
            this._flag |= FLAG_PENDING;
            notifyPending(this, time);
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
 * Checks if any dep of a receiver actually changed since it
 * last ran. Pulls stale compute deps to ensure they're current.
 * @param {Receiver} node
 * @param {number} time
 * @returns {boolean}
 */
function needsUpdate(node, time) {
    let lastRun = node._time;
    let dep = node._dep1;
    if (dep !== null) {
        if ((dep.t === TYPE_COMPUTE) && (dep._flag & (FLAG_STALE | FLAG_PENDING))) {
            pullCompute(/** @type {Compute} */(dep), time);
        }
        if (dep._ctime > lastRun) {
            return true;
        }
    }
    let deps = node._deps;
    if (deps !== null) {
        let len = deps.length;
        for (let i = 0; i < len; i += 2) {
            dep = /** @type {Sender} */(deps[i]);
            if ((dep.t === TYPE_COMPUTE) && (dep._flag & (FLAG_STALE | FLAG_PENDING))) {
                pullCompute(/** @type {Compute} */(dep), time);
            }
            if (dep._ctime > lastRun) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Pull-based evaluation. Recursively pulls deps, then only
 * runs this compute if a dep's value actually changed (_ctime).
 * @param {Compute} node
 * @param {number} time
 * @returns {void}
 */
function pullCompute(node, time) {
    if (!(node._flag & (FLAG_STALE | FLAG_PENDING))) {
        return;
    }
    /**
     * FLAG_WEAK with null value: value was released by clearReceiver.
     * Must recompute regardless of dep changes.
     */
    if ((node._flag & FLAG_WEAK) && node._value === null) {
        runCompute(node, time);
        node._time = time;
        return;
    }
    /**
     * Recursively ensure all deps are current. If any dep's
     * value actually changed (_ctime), we must re-execute.
     */
    let lastRun = node._time;
    let dep = node._dep1;
    if (dep !== null) {
        if ((dep.t === TYPE_COMPUTE) && (dep._flag & (FLAG_STALE | FLAG_PENDING))) {
            pullCompute(/** @type {Compute} */(dep), time);
        }
        if (dep._ctime > lastRun) {
            runCompute(node, time);
            node._time = time;
            return;
        }
    }
    let deps = node._deps;
    if (deps !== null) {
        let len = deps.length;
        for (let i = 0; i < len; i += 2) {
            dep = /** @type {Sender} */(deps[i]);
            if ((dep.t === TYPE_COMPUTE) && (dep._flag & (FLAG_STALE | FLAG_PENDING))) {
                pullCompute(/** @type {Compute} */(dep), time);
            }
            if (dep._ctime > lastRun) {
                runCompute(node, time);
                node._time = time;
                return;
            }
        }
    }
    /** No dep changed — clear flags without re-executing */
    node._flag &= ~(FLAG_STALE | FLAG_PENDING);
    node._time = time;
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
    let value = node._value;
    let state = CLOCK._state;
    node._flag = (opts & ~(FLAG_STALE | FLAG_PENDING | FLAG_INIT)) | FLAG_RUNNING;
    CLOCK._state &= RESET;
    /** @type {number} */
    let ctxState = 0;
    /** @type {number} */
    let poolIdx = -1;
    try {
        if (opts & FLAG_BOUND) {
            let dep1 = node._dep1;
            /** @type {Reader} */
            let ctx = READER;
            let prevNode = ctx._node;
            if (opts & FLAG_SETUP) {
                node._flag &= ~FLAG_SETUP;
                let version = CLOCK._version += 2;
                ctx._state = 0;
                ctx._node = node;
                ctx._version = version;
                if (dep1 !== null) {
                    dep1._version = version;
                }
                let deps = node._deps;
                if (deps !== null) {
                    let len = deps.length;
                    for (let j = 0; j < len; j += 2) {
                        /** @type {Sender} */(deps[j])._version = version;
                    }
                }
            } else {
                ctx._state = 0;
                ctx._node = node;
            }
            if (dep1 !== null) {
                value = node._fn(ctx, dep1.val(), value, node._args);
            } else {
                value = node._fn(ctx, value, node._args);
            }
            ctxState = ctx._state;
            ctx._node = prevNode;
        } else if ((opts & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE) {
            /** @type {Reader} */
            let ctx = READER;
            let prevNode = ctx._node;
            ctx._state = 0;
            ctx._node = node;
            value = node._fn(ctx, value, node._args);
            ctxState = ctx._state;
            ctx._node = prevNode;
        } else if (opts & FLAG_SETUP) {
            /** @type {Reader} */
            let ctx = READER;
            let prevNode = ctx._node;
            let version = CLOCK._version += 2;
            ctx._state = 0;
            ctx._node = node;
            ctx._version = version;
            value = node._fn(ctx, value, node._args);
            ctxState = ctx._state;
            ctx._node = prevNode;
            node._flag &= ~FLAG_SETUP;
        } else {
            /**
             * Re-execution with dynamic deps — needs Subscriber from pool.
             */
            poolIdx = SUBSCRIBER_IDX;
            /** @type {Subscriber} */
            let ctx = poolIdx < POOL_SIZE ? SUBSCRIBER_POOL[SUBSCRIBER_IDX++] : new Subscriber();
            let version = CLOCK._version += 2;
            ctx._state = 0;
            ctx._node = node;
            ctx._version = version;
            /**
             * Pre-stamp all existing deps with version - 1
             * so read() can confirm them with a single check.
             */
            let existingCount = 0;
            let dep1 = node._dep1;
            if (dep1 !== null) {
                dep1._version = version - 1;
                existingCount = 1;
            }
            let deps = node._deps;
            if (deps !== null) {
                let len = deps.length;
                for (let j = 0; j < len; j += 2) {
                    /** @type {Sender} */(deps[j])._version = version - 1;
                }
                existingCount += len / 2;
            }
            ctx._reused = 0;
            ctx._dep1 = null;
            ctx._count = 0;
            value = node._fn(ctx, value, node._args);
            if (ctx._reused !== existingCount || ctx._count !== 0) {
                pruneDeps(node, ctx);
            }
            ctxState = ctx._state;
            ctx._node = null;
            SUBSCRIBER_IDX = poolIdx;
        }
        node._flag &= ~FLAG_ERROR;
    } catch (err) {
        value = err;
        node._flag |= FLAG_ERROR;
        if (poolIdx >= 0) {
            SUBSCRIBER_IDX = poolIdx;
        }
    } finally {
        CLOCK._state = state;
        opts = node._flag;
        node._flag &= ~(FLAG_RUNNING | FLAG_STALE | FLAG_PENDING | FLAG_INIT);
    }
    if (opts & FLAG_ERROR) {
        node._value = value;
        node._ctime = time;
    } else if (opts & (FLAG_ASYNC | FLAG_STREAM)) {
        /**
         * Async: the subscriber escapes — replace the pool slot
         * so the pool stays consistent for future use.
         */
        if (poolIdx >= 0 && poolIdx < POOL_SIZE) {
            SUBSCRIBER_POOL[poolIdx] = new Subscriber();
        }
        node._flag |= FLAG_LOADING;
        if (opts & FLAG_STREAM) {
            resolveIterator(new WeakRef(node), /** @type {AsyncIterator<T> | AsyncIterable<T>} */(value), time);
        } else {
            resolvePromise(new WeakRef(node), /** @type {IThenable<T>} */(value), time);
        }
    } else if (value !== node._value) {
        node._value = value;
        if (!(ctxState & CTX_EQUAL)) {
            node._ctime = time;
        }
    } else if (ctxState & CTX_NOTEQUAL) {
        node._ctime = time;
    } else if (opts & FLAG_NOTIFY) {
        /**
         * FLAG_NOTIFY: always signal change to downstream
         * even when value is identical. Overrides equal(true).
         */
        node._ctime = time;
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
        if (node !== void 0 && !(node._flag & FLAG_DISPOSED) && node._time === time) {
            node._flag &= ~FLAG_ERROR;
            settle(node, val);
        }
    }, (err) => {
        let node = ref.deref();
        if (node !== void 0 && !(node._flag & FLAG_DISPOSED) && node._time === time) {
            node._flag |= FLAG_ERROR;
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

        if (node === void 0 || (node._flag & FLAG_DISPOSED) || node._time !== time) {
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

        node._flag &= ~FLAG_ERROR;
        settle(node, result.value);
    };

    /** @param {*} err */
    let onError = (err) => {
        let node = ref.deref();
        if (node !== void 0 && !(node._flag & FLAG_DISPOSED) && node._time === time) {
            node._flag |= FLAG_ERROR;
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
    node._flag &= ~FLAG_LOADING;

    // 3. Settle value and trigger graph if changed (or if it's an error)
    if (value !== node._value || (node._flag & FLAG_ERROR)) {
        node._value = value;
        let time = CLOCK._time + 1;
        node._ctime = time;
        if (unbound(node)) {
            node._fn = node._args = null;
        }
        notifyStale(node, time);
        start(CLOCK);
    }
}

/**
 * @constructor
 * @template U,W
 * @param {number} opts
 * @param {(function(W): (function(): void | void)) | (function(U,W): (function(): void | void))} fn
 * @param {Sender<U> | null} dep1
 * @param {W=} args
 * @implements {IEffect}
 */
function Effect(opts, fn, dep1, args) {
    /**
     * @type {number}
     */
    this._flag = FLAG_INIT | (0 | opts);
    /**
     * @type {(function(W): (function(): void | void)) | (function(U,W): (function(): void | void)) | (function(U,V,W): (function(): void | void)) | null}
     */
    this._fn = fn;
    /**
     * @type {Sender<U> | null}
     */
    this._dep1 = dep1;
    /**
     * @type {number}
     */
    this._dep1slot = 0;
    /**
     * @type {Array<Sender | number> | null}
     */
    this._deps = null;
    /**
     * @type {number}
     */
    this._time = 0;
    /**
     * @type {(function(): void) | Array<(function(): void)> | null}
     */
    this._cleanup = null;
    /**
     * @type {Array<Receiver> | null}
     */
    this._owned = null;
    /**
     * @type {number}
     */
    this._level = 0;
    /**
     * @type {W | undefined}
     */
    this._args = args;
    /**
     * @type {Owner | null}
     */
    this._owner = null;
    /**
     * @type {(function(*): boolean) | Array<(function(*): boolean)> | null}
     */
    this._recover = null;
    if (CLOCK._state & STATE_OWNER) {
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
    EffectProto.t = TYPE_EFFECT;

    /**
     * @public
     * @this {!Effect<U,V,W>}
     * @returns {void}
     */
    EffectProto.dispose = dispose;

    /**
     * @public
     * @this {!Effect<U,V,W>}
     * @returns {boolean}
     */
    EffectProto.error = error;

    /**
     * @public
     * @this {!Effect<U,V,W>}
     * @returns {boolean}
     */
    EffectProto.loading = loading;

    /**
     * @this {!Effect<U,V,W>}
     * @returns {void}
     */
    EffectProto._dispose = function () {
        let opts = this._flag;
        if (!(opts & FLAG_DISPOSED)) {
            this._flag |= FLAG_DISPOSED;
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
     * @this {!Effect<U,V,W>}
     * @param {number} time
     * @returns {void} 
     */
    /**
     * Called when a guaranteed-change source notifies this effect.
     * If already PENDING (enqueued), upgrades to STALE without
     * re-enqueuing. If already STALE, no-op.
     */
    EffectProto._setStale = function (time) {
        if (this._flag & FLAG_STALE) {
            return;
        }
        let wasPending = this._flag & FLAG_PENDING;
        this._flag |= FLAG_STALE;
        if (!wasPending) {
            if (this._flag & FLAG_SCOPE) {
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
        }
    };

    /**
     * Called when a maybe-change source (regular compute) notifies
     * this effect. Marks PENDING and enqueues for later evaluation.
     * No-op if already STALE or PENDING.
     */
    EffectProto._setPending = function (time) {
        if (this._flag & (FLAG_STALE | FLAG_PENDING)) {
            return;
        }
        this._flag |= FLAG_PENDING;
        if (this._flag & FLAG_SCOPE) {
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
    let clock = CLOCK;
    let state = clock._state;
    /** @type {Reader} */
    let ctx = READER;
    let prevNode = ctx._node;
    let poolIdx = SUBSCRIBER_IDX;
    try {
        runEffect(node);
        node._time = clock._time;
        if (clock._signals > 0 || clock._disposes > 0) {
            start(clock);
        }
    } catch (err) {
        /**
         * If fn() threw, runEffect may have left the shared
         * ctx._node and SUBSCRIBER_IDX corrupted. Restore them
         * so the outer compute/effect that created this node
         * can continue safely.
         */
        ctx._node = prevNode;
        SUBSCRIBER_IDX = poolIdx;
        let recovered = tryRecover(node, err);
        node._dispose();
        if (!recovered) {
            throw err;
        }
    } finally {
        clock._state = state;
    }
}

/**
 * @template U,V,W
 * @param {!Effect<U,V,W>} node
 * @returns {void}
 */
function runEffect(node) {
    let opts = node._flag;
    if (!(opts & FLAG_SETUP) && ((opts & FLAG_SCOPE) || node._cleanup !== null)) {
        clearOwned(node);
    }
    /** @type {(function(): void) | null | undefined} */
    let value;
    let fn = node._fn;
    let args = node._args;
    let state = CLOCK._state;
    let scope = CLOCK._scope;
    node._flag |= FLAG_RUNNING;
    CLOCK._state &= RESET;
    if (opts & FLAG_SCOPE) {
        CLOCK._scope = node;
        CLOCK._state |= STATE_OWNER | STATE_SCOPE;
    }
    if (opts & FLAG_BOUND) {
        let dep1 = node._dep1;
        /** @type {Reader} */
        let ctx = READER;
        let prevNode = ctx._node;
        if (opts & FLAG_SETUP) {
            let version = CLOCK._version += 2;
            ctx._state = 0;
            ctx._node = node;
            ctx._version = version;
            if (dep1 !== null) {
                dep1._version = version;
            }
            let deps = node._deps;
            if (deps !== null) {
                let len = deps.length;
                for (let j = 0; j < len; j += 2) {
                    /** @type {Sender} */(deps[j])._version = version;
                }
            }
        } else {
            ctx._state = 0;
            ctx._node = node;
        }
        if (dep1 !== null) {
            value = fn(ctx, dep1.val(), args);
        } else {
            value = fn(ctx, args);
        }
        ctx._node = prevNode;
    } else if ((opts & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE) {
        /** @type {Reader} */
        let ctx = READER;
        let prevNode = ctx._node;
        ctx._state = 0;
        ctx._node = node;
        value = fn(ctx, args);
        ctx._node = prevNode;
    } else if (opts & FLAG_SETUP) {
        /** @type {Reader} */
        let ctx = READER;
        let prevNode = ctx._node;
        let version = CLOCK._version += 2;
        ctx._state = 0;
        ctx._node = node;
        ctx._version = version;
        value = fn(ctx, args);
        ctx._node = prevNode;
        node._flag &= ~FLAG_SETUP;
    } else {
        let poolIdx = SUBSCRIBER_IDX;
        /** @type {Subscriber} */
        let ctx = poolIdx < POOL_SIZE ? SUBSCRIBER_POOL[SUBSCRIBER_IDX++] : new Subscriber();
        let version = CLOCK._version += 2;
        ctx._state = 0;
        ctx._node = node;
        ctx._version = version;
        let existingCount = 0;
        let dep1 = node._dep1;
        if (dep1 !== null) {
            dep1._version = version - 1;
            existingCount = 1;
        }
        let deps = node._deps;
        if (deps !== null) {
            let len = deps.length;
            for (let j = 0; j < len; j += 2) {
                /** @type {Sender} */(deps[j])._version = version - 1;
            }
            existingCount += len / 2;
        }
        ctx._reused = 0;
        ctx._dep1 = null;
        ctx._count = 0;
        value = fn(ctx, args);
        if (ctx._reused !== existingCount || ctx._count !== 0) {
            pruneDeps(node, ctx);
        }
        ctx._node = null;
        SUBSCRIBER_IDX = poolIdx;
    }
    CLOCK._state = state;
    CLOCK._scope = scope;
    node._flag &= ~(FLAG_RUNNING | FLAG_STALE | FLAG_PENDING | FLAG_INIT);
    if (opts & (FLAG_ASYNC | FLAG_STREAM)) {
        node._flag |= FLAG_LOADING;
        if (opts & FLAG_STREAM) {
            resolveEffectIterator(new WeakRef(node), value);
        } else {
            resolveEffectPromise(new WeakRef(node), value);
        }
    } else if (typeof value === 'function') {
        addCleanup(node, value);
    }
}

/**
 * Resolves a promise returned by an async effect. If the
 * resolved value is a function, registers it as cleanup.
 * @param {WeakRef<!Effect>} ref
 * @param {!Promise} promise
 * @returns {void}
 */
function resolveEffectPromise(ref, promise) {
    promise.then((val) => {
        let node = ref.deref();
        if (node !== void 0 && !(node._flag & FLAG_DISPOSED)) {
            node._flag &= ~FLAG_LOADING;
            if (typeof val === 'function') {
                addCleanup(node, val);
            }
        }
    }, (err) => {
        let node = ref.deref();
        if (node !== void 0 && !(node._flag & FLAG_DISPOSED)) {
            node._flag &= ~FLAG_LOADING;
            let recovered = tryRecover(node, err);
            if (!recovered) {
                node._dispose();
            }
        }
    });
}

/**
 * Resolves an async iterable returned by a streaming effect.
 * Each yielded function is registered as cleanup.
 * @param {WeakRef<!Effect>} ref
 * @param {AsyncIterable | AsyncIterator} iterable
 * @returns {void}
 */
function resolveEffectIterator(ref, iterable) {
    let iterator = typeof iterable[Symbol.asyncIterator] === 'function'
        ? iterable[Symbol.asyncIterator]()
        : iterable;
    let onNext = (result) => {
        let node = ref.deref();
        if (node === void 0 || (node._flag & FLAG_DISPOSED)) {
            if (typeof iterator.return === 'function') {
                iterator.return();
            }
            return;
        }
        if (result.done) {
            node._flag &= ~FLAG_LOADING;
            return;
        }
        iterator.next().then(onNext, onError);
        node._flag &= ~FLAG_LOADING;
        if (typeof result.value === 'function') {
            addCleanup(node, result.value);
        }
    };
    let onError = (err) => {
        let node = ref.deref();
        if (node !== void 0 && !(node._flag & FLAG_DISPOSED)) {
            node._flag &= ~FLAG_LOADING;
            let recovered = tryRecover(node, err);
            if (!recovered) {
                node._dispose();
            }
        }
    };
    iterator.next().then(onNext, onError);
}

/**
 * @param {Owner} node
 * @param {function(): void} fn
 * @returns {void}
 */
function addCleanup(node, fn) {
    let cur = node._cleanup;
    if (cur === null) {
        node._cleanup = fn;
    } else if (typeof cur === 'function') {
        node._cleanup = [cur, fn];
    } else {
        cur.push(fn);
    }
}

/**
 * @param {Owner} node
 * @param {function(*): boolean} fn
 * @returns {void}
 */
function addRecover(node, fn) {
    let cur = node._recover;
    if (cur === null) {
        node._recover = fn;
    } else if (typeof cur === 'function') {
        node._recover = [cur, fn];
    } else {
        cur.push(fn);
    }
    node._flag |= FLAG_RECOVER;
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
    let time = CLOCK._time + 1;
    node._ctime = time;
    notifyStale(node, time);
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
    clock._state = STATE_START;
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
                    let op = ops[i];
                    if (op & OP_VALUE) {
                        signal._value = payload;
                    } else if (op & OP_CALLBACK) {
                        CALLBACKS[op & ~OP_CALLBACK](signal, payload);
                    }
                    if (signal._flag & FLAG_STALE) {
                        signal._flag &= ~FLAG_STALE;
                        signal._ctime = time;
                        notifyStale(signal, time);
                    }
                    signals[i * 2] =
                        signals[i * 2 + 1] = null;
                }
                clock._signals = 0;
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
                        if ((node._flag & FLAG_STALE) || ((node._flag & FLAG_PENDING) && needsUpdate(node, time))) {
                            try {
                                runEffect(node);
                            } catch (err) {
                                clock._state = STATE_START;
                                let recovered = tryRecover(node, err);
                                node._dispose();
                                if (!recovered && !thrown) {
                                    error = err;
                                    thrown = true;
                                }
                            }
                        } else {
                            node._flag &= ~(FLAG_STALE | FLAG_PENDING);
                        }
                        node._time = time;
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
                    if ((node._flag & FLAG_STALE) || ((node._flag & FLAG_PENDING) && needsUpdate(node, time))) {
                        try {
                            runEffect(node);
                        } catch (err) {
                            clock._state = STATE_START;
                            let recovered = tryRecover(node, err);
                            node._dispose();
                            if (!recovered && !thrown) {
                                error = err;
                                thrown = true;
                            }
                        }
                    } else {
                        node._flag &= ~(FLAG_STALE | FLAG_PENDING);
                    }
                    node._time = time;
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
            (clock._signals > 0 ||
            clock._disposes > 0)
        );
    } finally {
        clock._state = STATE_IDLE;
        if (clock._scopes > 0) {
            let min = clock._minlevel;
            let max = clock._maxlevel;
            while (min < max) {
                SCOPE_LEVELS[min++] = 0;
            }
        }
        clock._disposes =
            clock._signals =
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
    if (!(send._flag & FLAG_DERIVED) && (receive.t === TYPE_COMPUTE)) {
        send._flag |= FLAG_DERIVED;
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
            } else {
                lastNode._deps[(lastSlot - 1) * 2 + 1] = slot;
            }
        }
    }
    /**
     * FLAG_WEAK computes release their cached value when the last
     * subscriber is removed.  The node stays alive (deps intact)
     * but marks itself STALE so the next .val() recomputes fresh.
     * This keeps idle weak computes from retaining large objects.
     */
    if (
        (send._flag & FLAG_WEAK) &&
        send._sub1 === null &&
        (send._subs === null || send._subs.length === 0)
    ) {
        send._flag |= FLAG_STALE;
        /** @type {Compute} */(send)._value = null;
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
    } else {
        let deps = receive._deps;
        let lastSlot = /** @type {number} */(deps.pop());
        let lastNode = /** @type {Sender} */(deps.pop());
        let realIndex = (slot - 1) * 2;
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
    if (receive._dep1 === null && (receive._deps === null || receive._deps.length === 0)) {
        if (receive.t === TYPE_EFFECT) {
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
    if (owner._flag & FLAG_SCOPE) {
        let owned = owner._owned;
        if (owned !== null) {
            let len = owned.length;
            for (let i = 0; i < len; i++) {
                owned[i]._dispose();
            }
            owner._owned = null;
        }
    }
    let cleanup = owner._cleanup;
    if (cleanup !== null) {
        owner._cleanup = null;
        if (typeof cleanup === 'function') {
            cleanup();
        } else {
            let len = cleanup.length;
            for (let i = 0; i < len; i++) {
                cleanup[i]();
            }
        }
    }
    if (owner._recover !== null) {
        owner._recover = null;
        owner._flag &= ~FLAG_RECOVER;
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
        if (owner._flag & FLAG_RECOVER) {
            let recover = owner._recover;
            if (typeof recover === 'function') {
                if (recover(error) === true) {
                    return true;
                }
            } else if (recover !== null) {
                let len = recover.length;
                for (let i = 0; i < len; i++) {
                    if (recover[i](error) === true) {
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
 * Uses version tagging set during the sweep in Subscriber.read():
 *   version     = dep was re-read this cycle (confirmed reuse)
 *   version - 1 = dep belongs to us but was NOT re-read (stale)
 *
 * New deps (not found in existing set) are collected in the
 * subscriber's overflow (_dep1, _deps, _count) without subscribing.
 * This function subscribes them into the final positions.
 *
 * @param {Receiver} node
 * @param {Subscriber} sub
 * @returns {void}
 */
function pruneDeps(node, sub) {
    let version = sub._version;
    let newCount = sub._count;
    let newIdx = 0;
    let newDep1 = sub._dep1;
    let newDeps = sub._deps;

    /** --- dep1 --- */
    let dep1 = node._dep1;
    if (dep1 !== null) {
        if (dep1._version === version) {
            dep1._version = 0;
        } else {
            /** Stale: unsubscribe */
            clearReceiver(dep1, node._dep1slot);
            if (newIdx < newCount) {
                let newDep = newIdx === 0 ? newDep1 : /** @type {Sender} */(newDeps[newIdx - 1]);
                newIdx++;
                let subslot = subscribe(newDep, node, 0);
                node._dep1 = newDep;
                node._dep1slot = subslot;
                newDep._version = 0;
            } else {
                node._dep1 = null;
            }
        }
    }

    /** --- _deps array --- */
    let deps = node._deps;
    if (deps !== null) {
        let len = deps.length / 2;
        let write = 0;
        for (let i = 0; i < len; i++) {
            let idx = i * 2;
            let dep = /** @type {Sender} */(deps[idx]);
            if (dep._version === version) {
                /** Reused: clear tag, compact to write position */
                dep._version = 0;
                if (write !== i) {
                    let subslot = /** @type {number} */(deps[idx + 1]);
                    let depslot = write + 1;
                    let writeIdx = write * 2;
                    deps[writeIdx] = dep;
                    deps[writeIdx + 1] = subslot;
                    if (subslot === 0) {
                        dep._sub1slot = depslot;
                    } else {
                        dep._subs[(subslot - 1) * 2 + 1] = depslot;
                    }
                }
                write++;
            } else {
                /** Stale: unsubscribe */
                clearReceiver(dep, /** @type {number} */(deps[idx + 1]));
                if (newIdx < newCount) {
                    let newDep = newIdx === 0 ? newDep1 : /** @type {Sender} */(newDeps[newIdx - 1]);
                    newIdx++;
                    let depslot = write + 1;
                    let subslot = subscribe(newDep, node, depslot);
                    let writeIdx = write * 2;
                    deps[writeIdx] = newDep;
                    deps[writeIdx + 1] = subslot;
                    newDep._version = 0;
                    write++;
                }
            }
        }

        /** Append any remaining new deps beyond existing array */
        while (newIdx < newCount) {
            let newDep = newIdx === 0 ? newDep1 : /** @type {Sender} */(newDeps[newIdx - 1]);
            newIdx++;
            let depslot = write + 1;
            let subslot = subscribe(newDep, node, depslot);
            let writeIdx = write * 2;
            if (writeIdx < deps.length) {
                deps[writeIdx] = newDep;
                deps[writeIdx + 1] = subslot;
            } else {
                deps.push(newDep, subslot);
            }
            newDep._version = 0;
            write++;
        }

        /** Trim or null out */
        if (write === 0) {
            node._deps = null;
        } else {
            deps.length = write * 2;
        }
    } else if (newIdx < newCount) {
        /**
         * No existing _deps array but we have new deps to add.
         * dep1 might have been filled above; remaining go to _deps.
         */
        if (node._dep1 === null && newIdx < newCount) {
            let newDep = newIdx === 0 ? newDep1 : /** @type {Sender} */(newDeps[newIdx - 1]);
            newIdx++;
            let subslot = subscribe(newDep, node, 0);
            node._dep1 = newDep;
            node._dep1slot = subslot;
            newDep._version = 0;
        }
        if (newIdx < newCount) {
            let arr = [];
            while (newIdx < newCount) {
                let newDep = newIdx === 0 ? newDep1 : /** @type {Sender} */(newDeps[newIdx - 1]);
                newIdx++;
                let depslot = (arr.length / 2) + 1;
                let subslot = subscribe(newDep, node, depslot);
                arr.push(newDep, subslot);
                newDep._version = 0;
            }
            node._deps = arr;
        }
    }
}



/**
 * @param {Sender} send
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
 * Propagates PENDING to all subscribers of a sender.
 * Called when a compute without OPT_NOTIFY is marked stale —
 * its subscribers may or may not need to update depending on
 * whether this compute's value actually changes after re-eval.
 * @param {Sender} send
 * @param {number} time
 * @returns {void}
 */
function notifyPending(send, time) {
    /** @type {Receiver} */
    let sub = send._sub1;
    if (sub !== null && sub._time < time) {
        sub._setPending(time);
    }
    /** @type {Array<Receiver | number> | null} */
    let subs = send._subs;
    if (subs !== null) {
        let len = subs.length;
        for (let i = 0; i < len; i += 2) {
            sub = /** @type {Receiver} */(subs[i]);
            if (sub._time < time) {
                sub._setPending(time);
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
    let flag = FLAG_SETUP | ((0 | opts) & OPTIONS);
    let node = new Compute(flag, fn, null, seed, args);
    if (!(flag & FLAG_DEFER)) {
        startCompute(node);
    }
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
    let flag = FLAG_SETUP | ((0 | opts) & OPTIONS);
    let node = new Effect(flag, fn, null, args);
    startEffect(node);
    return node;
}

/**
 * @param {function(): (function(): void | void)} fn
 * @param {number=} opts
 * @returns {Effect}
 */
function scope(fn, opts) {
    opts = 0 | opts;
    let flag = FLAG_SETUP | FLAG_SCOPE | (opts & OPTIONS);
    if (!(opts & OPT_DYNAMIC)) {
        flag |= FLAG_STABLE;
    }
    let node = new Effect(flag, fn, null);
    let state = CLOCK._state;
    if (state & STATE_SCOPE) {
        setScope(node, CLOCK._scope);
    }
    startEffect(node);
    return node;
}

/**
 * Async compute. Returns a promise whose resolved value becomes
 * the node's settled value. Stable by default; pass OPT_DYNAMIC
 * for dynamic dependency tracking.
 * @template T,W
 * @param {function(T,W): Promise<T>} fn
 * @param {T=} seed
 * @param {number=} opts
 * @param {W=} args
 * @returns {!Compute<T,null,null,W>}
 */
function task(fn, seed, opts, args) {
    opts = 0 | opts;
    let flag = FLAG_ASYNC | FLAG_SETUP | (opts & OPTIONS);
    if (!(opts & OPT_DYNAMIC)) {
        flag |= FLAG_STABLE;
    }
    let node = new Compute(flag, fn, null, seed, args);
    if (!(flag & FLAG_DEFER)) {
        startCompute(node);
    }
    return node;
}

/**
 * Async effect. Returns a promise whose resolved value, if a
 * function, is registered as cleanup. Stable by default; pass
 * OPT_DYNAMIC for dynamic dependency tracking.
 * @template W
 * @param {function(W): Promise<(function(): void) | void>} fn
 * @param {number=} opts
 * @param {W=} args
 * @returns {!Effect<null,null,W>}
 */
function spawn(fn, opts, args) {
    opts = 0 | opts;
    let flag = FLAG_ASYNC | FLAG_SETUP | (opts & OPTIONS);
    if (!(opts & OPT_DYNAMIC)) {
        flag |= FLAG_STABLE;
    }
    let node = new Effect(flag, fn, null, args);
    startEffect(node);
    return node;
}

/**
 * @param {function(): void} fn
 * @returns {void}
 */
function batch(fn) {
    let clock = CLOCK;
    if (clock._state & STATE_IDLE) {
        clock._state = STATE_START;
        try {
            fn();
            start(clock);
        } finally {
            clock._state = STATE_IDLE;
        }
    } else {
        fn();
    }
}

export {
    CLOCK,
    STATE_START, STATE_IDLE, STATE_OWNER, STATE_SCOPE,
    FLAG_DEFER, FLAG_STABLE, FLAG_SETUP, FLAG_STALE, FLAG_PENDING,
    FLAG_RUNNING, FLAG_DISPOSED, FLAG_LOADING, FLAG_ERROR, FLAG_RECOVER,
    FLAG_BOUND, FLAG_DERIVED, FLAG_SCOPE, FLAG_NOTIFY, FLAG_EQUAL, FLAG_WEAK,
    FLAG_INIT,
    OP_VALUE, OP_CALLBACK,
    register,
    MUT_ADD, MUT_DEL, MUT_SORT,
    MUT_OP_MASK, MUT_LEN_SHIFT, MUT_LEN_MASK, MUT_POS_SHIFT, MUT_POS_MASK,
    CTX_EQUAL, CTX_NOTEQUAL, CTX_PROMISE, CTX_ITERABLE, CTX_ASYNC,
    FLAG_ASYNC, FLAG_STREAM,
    OPT_DEFER, OPT_STABLE, OPT_SETUP, OPT_NOTIFY, OPT_WEAK, OPT_DYNAMIC,
    TYPE_ROOT, TYPE_SIGNAL, TYPE_COMPUTE, TYPE_EFFECT,
    TYPEFLAG_MASK, TYPEFLAG_SEND, TYPEFLAG_RECEIVE, TYPEFLAG_OWNER,
    RESET, OPTIONS,
    notify,
    scheduleSignal,
    subscribe,
}

export {
    Root,
    Signal,
    Compute,
    Effect,
    Reader,
    Subscriber,
    root,
    signal,
    compute,
    derive,
    transmit,
    task,
    effect,
    watch,
    spawn,
    scope,
    batch
}
