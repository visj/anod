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

const CTX_EQUAL = 1;
const CTX_NOTEQUAL = 2;
const CTX_PROMISE = 4;
const CTX_ITERABLE = 8;
const CTX_ASYNC = CTX_PROMISE | CTX_ITERABLE;
const CTX_OWNER = 16;
const FLAG_DEFER = 1;
const FLAG_STABLE = 2;
const FLAG_SETUP = 4;
const FLAG_STALE = 8;
const FLAG_TRANSMIT = 16;
const FLAG_PENDING = 32;
const FLAG_RUNNING = 64;
const FLAG_DISPOSED = 128;
const FLAG_LOADING = 256;
const FLAG_ERROR = 512;
const FLAG_RECOVER = 1024;
const FLAG_BOUND = 2048;
const FLAG_DERIVED = 4096;
const FLAG_SCOPE = 8192;
const FLAG_WEAK = 16384;

const FLAG_SCHEDULED = 1 << 30;

const FLAG_EQUAL = 0x40000;
const FLAG_NOTEQUAL = 0x80000;
const FLAG_INIT = 0x100000;
const FLAG_ASYNC = 0x200000;
const FLAG_STREAM = 0x400000;
const OPT_DEFER = FLAG_DEFER;
const OPT_STABLE = FLAG_STABLE;
const OPT_SETUP = FLAG_SETUP;
const OPT_NOTIFY = FLAG_TRANSMIT;
const OPT_WEAK = FLAG_WEAK;

const OPT_DYNAMIC = 0x800000;

const OPTIONS = OPT_DEFER | OPT_STABLE | OPT_SETUP | OPT_NOTIFY | OPT_WEAK | FLAG_ASYNC | FLAG_STREAM;

const STATE_START = 0;
const STATE_IDLE = 1;
const STATE_OWNER = 8;
const STATE_SCOPE = 16;

/** @const {number} */
const RESET = ~(STATE_IDLE | STATE_OWNER);

const TYPEFLAG_MASK = 7;
const TYPEFLAG_SEND = 8;
const TYPEFLAG_RECEIVE = 16;
const TYPEFLAG_OWNER = 32;
const TYPE_ROOT = 1 | TYPEFLAG_OWNER;
const TYPE_SIGNAL = 2 | TYPEFLAG_SEND;
const TYPE_COMPUTE = 3 | TYPEFLAG_SEND | TYPEFLAG_RECEIVE;
const TYPE_EFFECT = 4 | TYPEFLAG_OWNER | TYPEFLAG_RECEIVE;

/**
 * @type {number}
 */
var TRANSACTION = 0;

/**
 * @type {Array<Sender | number>}
 */
var VSTACK = new Array(64);
/** @type {number} Tail pointer into VSTACK */
var VCOUNT = 0;
/** @type {number} Count of existing deps confirmed during dynamic re-execution */
var REUSED = 0;

/**
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

/**
 * Pre-allocated queues. Fixed initial capacity avoids
 * V8 backing store growth/shrink churn when arrays are
 * filled and then nulled out every transaction cycle.
 * @const {number}
 */
var QUEUE_SIZE = 64;

/** @const @type {Array<Disposer>} */
var DISPOSES = new Array(QUEUE_SIZE);

/** @const @type {Array<number>} */
var SIGNAL_OPS = new Array(QUEUE_SIZE);

/**
 * @const
 * @type {Array<Signal>}
 */
var SIGNALS = new Array(32);
/**
 * @const
 * @type {Array}
 */
var PAYLOADS = new Array(32);

/**
 * Compute queue for FLAG_TRANSMIT nodes. These are eagerly
 * re-evaluated during the transaction loop before effects.
 * @const @type {Array<Compute>}
 */
var COMPUTES = new Array(QUEUE_SIZE);

/** @const @type {Array<number>} */
var LEVELS = [0, 0, 0, 0];
/** @const @type {Array<Array<Effect>>} */
var SCOPES = [[], [], [], []];
/** @const @type {Array<Effect>} */
var EFFECTS = new Array(QUEUE_SIZE);


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
    SIGNALS[index * 2] = node;
    SIGNALS[index * 2 + 1] = value;
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
            DISPOSES[CLOCK._disposes++] = this;
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
 * Counts the total number of dependencies on a node.
 * @param {Receiver} node
 * @returns {number}
 */
function countDeps(node) {
    let count = node._dep1 !== null ? 1 : 0;
    if (node._deps !== null) {
        count += node._deps.length / 2;
    }
    return count;
}

/**
 * Saves a conflicting version tag to the global VSTACK.
 * Called when a dep's version > VER_HEAD during prescan or _read,
 * meaning another running node in this execution tree tagged it.
 * @param {Sender} dep
 * @param {number} v - the conflicting version to save
 * @returns {void}
 */
function vstackSave(dep, v) {
    VSTACK[VCOUNT++] = dep;
    VSTACK[VCOUNT++] = v;
}


// ─── Reader / Subscriber ───────────────────────────────────────────────────
// Reader and Subscriber still exist as exported constructors for backward
// compatibility with anod-list, which extends their prototypes with
// _source() and _getMod(). In the new architecture the node itself is
// passed as the first argument to fn(), so Reader/Subscriber are only
// used as the context bridge for list.js.
//
// Reader is used for stable/bound/SETUP paths. Subscriber is aliased
// to the same constructor for API compatibility.

/**
 * Lightweight execution context. In the new architecture, the node
 * itself is the primary execution context. Reader wraps the node
 * reference for backward compat with anod-list.
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
 * Reader.read delegates to the node's _read method.
 * @template T
 * @param {!Sender<T>} sender
 * @returns {T}
 */
ReaderProto.read = function (sender) {
    return read.call(this._node, sender);
};

/**
 * Subscriber is aliased to Reader for backward compatibility.
 * @constructor
 */
function Subscriber() {
    /** @type {Receiver | null} */
    this._node = null;
    /** @type {number} */
    this._state = 0;
    /** @type {number} */
    this._version = 0;
}

/** @const */
var SubscriberProto = Subscriber.prototype;

/**
 * Subscriber.read delegates to the node's _read method.
 * @template T
 * @param {!Sender<T>} sender
 * @returns {T}
 */
SubscriberProto.read = function (sender) {
    return read.call(this._node, sender);
};

/**
 * Shared method: declares that this compute's output is
 * semantically equal to its previous value. Sets FLAG_EQUAL
 * or FLAG_NOTEQUAL directly on the node's _flag.
 * @param {boolean=} eq
 * @returns {void}
 */
function _equal(eq) {
    if (eq === false) {
        this._flag = (this._flag | FLAG_NOTEQUAL) & ~FLAG_EQUAL;
    } else {
        this._flag = (this._flag | FLAG_EQUAL) & ~FLAG_NOTEQUAL;
    }
}

/**
 * Shared method: marks the current node as stable (no more
 * dynamic dep tracking on subsequent runs).
 * @returns {void}
 */
function _stable() {
    this._flag |= FLAG_STABLE;
}

/**
 * Shared method: registers a cleanup function on the current node.
 * Only valid when the node is an Owner (Effect/Scope).
 * @param {function(): void} fn
 * @returns {void}
 */
function _cleanup(fn) {
    addCleanup(this, fn);
}

/**
 * Shared method: registers a recover handler on the current node.
 * Only valid when the node is an Owner (Effect/Scope).
 * @param {function(*): boolean} fn
 * @returns {void}
 */
function _recover(fn) {
    addRecover(this, fn);
}

/**
 * Reader/Subscriber equal/stable delegate to _node for compat with
 * anod-list which creates Reader/Subscriber instances.
 */
function _ctxEqual(eq) {
    if (eq === false) {
        this._node._flag = (this._node._flag | FLAG_NOTEQUAL) & ~FLAG_EQUAL;
    } else {
        this._node._flag = (this._node._flag | FLAG_EQUAL) & ~FLAG_NOTEQUAL;
    }
}
function _ctxStable() {
    this._node._flag |= FLAG_STABLE;
}
function _ctxError() {
    return (this._node._flag & FLAG_ERROR) !== 0;
}
function _ctxLoading() {
    return (this._node._flag & FLAG_LOADING) !== 0;
}
function _ctxCleanup(fn) {
    addCleanup(this._node, fn);
}
function _ctxRecover(fn) {
    addRecover(this._node, fn);
}

ReaderProto.equal = SubscriberProto.equal = _ctxEqual;
ReaderProto.stable = SubscriberProto.stable = _ctxStable;
ReaderProto.error = SubscriberProto.error = _ctxError;
ReaderProto.loading = SubscriberProto.loading = _ctxLoading;
ReaderProto.cleanup = SubscriberProto.cleanup = _ctxCleanup;
ReaderProto.recover = SubscriberProto.recover = _ctxRecover;

/**
 * Creates an owned Compute node. Only valid inside a Root or Scope.
 * @template T,W
 * @param {function(T,W): T} fn
 * @param {T=} seed
 * @param {number=} opts
 * @param {W=} args
 * @returns {!Compute<T,null,null,W>}
 */
function _ctxCompute(fn, seed, opts, args) {
    let owner = CLOCK._scope;
    if (owner === null) {
        throw new Error('Ownership required');
    }
    let flag = FLAG_SETUP | ((0 | opts) & OPTIONS);
    let node = new Compute(flag, fn, null, seed, args);
    addOwned(owner, node);
    if (!(flag & FLAG_DEFER)) {
        startCompute(node);
    }
    return node;
}

/**
 * Creates an owned stable Compute node. Only valid inside a Root or Scope.
 * @template T,W
 * @param {function(T,W): T} fn
 * @param {T=} seed
 * @param {W=} args
 * @returns {!Compute<T,null,null,W>}
 */
function _ctxDerive(fn, seed, args) {
    let owner = CLOCK._scope;
    if (owner === null) {
        throw new Error('Ownership required');
    }
    let node = new Compute(FLAG_STABLE | FLAG_SETUP, fn, null, seed, args);
    addOwned(owner, node);
    startCompute(node);
    return node;
}

/**
 * Creates an owned stable Compute with OPT_NOTIFY. Only valid inside a Root or Scope.
 * @template T,W
 * @param {function(T,W): T} fn
 * @param {T=} seed
 * @param {W=} args
 * @returns {!Compute<T,null,null,W>}
 */
function _ctxTransmit(fn, seed, args) {
    let owner = CLOCK._scope;
    if (owner === null) {
        throw new Error('Ownership required');
    }
    let node = new Compute(FLAG_STABLE | FLAG_SETUP | FLAG_TRANSMIT | FLAG_TRANSMIT, fn, null, seed, args);
    addOwned(owner, node);
    startCompute(node);
    return node;
}

/**
 * Creates an owned Effect node. Only valid inside a Root or Scope.
 * @template W
 * @param {function(W): (function(): void | void)} fn
 * @param {number=} opts
 * @param {W=} args
 * @returns {!Effect<null,null,W>}
 */
function _ctxEffect(fn, opts, args) {
    let owner = CLOCK._scope;
    if (owner === null) {
        throw new Error('Ownership required');
    }
    let flag = FLAG_SETUP | ((0 | opts) & OPTIONS);
    let node = new Effect(flag, fn, null, args);
    node._owner = owner;
    addOwned(owner, node);
    startEffect(node);
    return node;
}

/**
 * Creates an owned stable Effect node. Only valid inside a Root or Scope.
 * @template W
 * @param {function(W): (function(): void | void)} fn
 * @param {W=} args
 * @returns {!Effect<null,null,W>}
 */
function _ctxWatch(fn, args) {
    let owner = CLOCK._scope;
    if (owner === null) {
        throw new Error('Ownership required');
    }
    let node = new Effect(FLAG_STABLE | FLAG_SETUP, fn, null, args);
    node._owner = owner;
    addOwned(owner, node);
    startEffect(node);
    return node;
}

/**
 * Creates an owned Scope (Effect with FLAG_SCOPE). Only valid inside a Root or Scope.
 * @param {function(): (function(): void | void)} fn
 * @param {number=} opts
 * @returns {!Effect}
 */
function _ctxScope(fn, opts) {
    let owner = CLOCK._scope;
    if (owner === null) {
        throw new Error('Ownership required');
    }
    opts = 0 | opts;
    let flag = FLAG_SETUP | FLAG_SCOPE | (opts & OPTIONS);
    if (!(opts & OPT_DYNAMIC)) {
        flag |= FLAG_STABLE;
    }
    let node = new Effect(flag, fn, null);
    node._owner = owner;
    addOwned(owner, node);
    /** Only call setScope for scope Effects, not Root (Root has FLAG_SCOPE but no _level) */
    if ((owner._flag & FLAG_SCOPE) && (owner.t & TYPEFLAG_RECEIVE)) {
        setScope(node, owner);
    }
    startEffect(node);
    return node;
}

/**
 * Creates an owned async Compute. Only valid inside a Root or Scope.
 * @template T,W
 * @param {function(T,W): Promise<T>} fn
 * @param {T=} seed
 * @param {number=} opts
 * @param {W=} args
 * @returns {!Compute<T,null,null,W>}
 */
function _ctxTask(fn, seed, opts, args) {
    let owner = CLOCK._scope;
    if (owner === null) {
        throw new Error('Ownership required');
    }
    opts = 0 | opts;
    let flag = FLAG_ASYNC | FLAG_SETUP | (opts & OPTIONS);
    if (!(opts & OPT_DYNAMIC)) {
        flag |= FLAG_STABLE;
    }
    let node = new Compute(flag, fn, null, seed, args);
    addOwned(owner, node);
    if (!(flag & FLAG_DEFER)) {
        startCompute(node);
    }
    return node;
}

/**
 * Creates an owned async Effect. Only valid inside a Root or Scope.
 * @template W
 * @param {function(W): Promise<(function(): void) | void>} fn
 * @param {number=} opts
 * @param {W=} args
 * @returns {!Effect<null,null,W>}
 */
function _ctxSpawn(fn, opts, args) {
    let owner = CLOCK._scope;
    if (owner === null) {
        throw new Error('Ownership required');
    }
    opts = 0 | opts;
    let flag = FLAG_ASYNC | FLAG_SETUP | (opts & OPTIONS);
    if (!(opts & OPT_DYNAMIC)) {
        flag |= FLAG_STABLE;
    }
    let node = new Effect(flag, fn, null, args);
    node._owner = owner;
    addOwned(owner, node);
    startEffect(node);
    return node;
}

/**
 * Creates an owned Root. Only valid inside a Root or Scope.
 * @param {function(): ((function(): void) | void)} fn
 * @returns {!Root}
 */
function _ctxRoot(fn) {
    let owner = CLOCK._scope;
    if (owner === null) {
        throw new Error('Ownership required');
    }
    let node = new Root();
    addOwned(owner, node);
    startRoot(node, fn);
    return node;
}

/**
 * Creates an owned Signal. Only valid inside a Root or Scope.
 * @template T
 * @param {T} value
 * @returns {!Signal<T>}
 */
function _ctxSignal(value) {
    let owner = CLOCK._scope;
    if (owner === null) {
        throw new Error('Ownership required');
    }
    return new Signal(value);
}

/**
 * Ctx methods on Reader/Subscriber delegate to CLOCK._scope
 * through the _node for ownership checks. For backward compat
 * with anod-list, these use `this._node` as the context check.
 */
function _rdrCtxCompute(fn, seed, opts, args) {
    if (!(this._state & CTX_OWNER)) {
        throw new Error('Ownership required');
    }
    return _ctxCompute.call(null, fn, seed, opts, args);
}
function _rdrCtxDerive(fn, seed, args) {
    if (!(this._state & CTX_OWNER)) {
        throw new Error('Ownership required');
    }
    return _ctxDerive.call(null, fn, seed, args);
}
function _rdrCtxTransmit(fn, seed, args) {
    if (!(this._state & CTX_OWNER)) {
        throw new Error('Ownership required');
    }
    return _ctxTransmit.call(null, fn, seed, args);
}
function _rdrCtxEffect(fn, opts, args) {
    if (!(this._state & CTX_OWNER)) {
        throw new Error('Ownership required');
    }
    return _ctxEffect.call(null, fn, opts, args);
}
function _rdrCtxWatch(fn, args) {
    if (!(this._state & CTX_OWNER)) {
        throw new Error('Ownership required');
    }
    return _ctxWatch.call(null, fn, args);
}
function _rdrCtxScope(fn, opts) {
    if (!(this._state & CTX_OWNER)) {
        throw new Error('Ownership required');
    }
    return _ctxScope.call(null, fn, opts);
}
function _rdrCtxTask(fn, seed, opts, args) {
    if (!(this._state & CTX_OWNER)) {
        throw new Error('Ownership required');
    }
    return _ctxTask.call(null, fn, seed, opts, args);
}
function _rdrCtxSpawn(fn, opts, args) {
    if (!(this._state & CTX_OWNER)) {
        throw new Error('Ownership required');
    }
    return _ctxSpawn.call(null, fn, opts, args);
}
function _rdrCtxRoot(fn) {
    if (!(this._state & CTX_OWNER)) {
        throw new Error('Ownership required');
    }
    return _ctxRoot.call(null, fn);
}
function _rdrCtxSignal(value) {
    if (!(this._state & CTX_OWNER)) {
        throw new Error('Ownership required');
    }
    return _ctxSignal.call(null, value);
}

ReaderProto.compute = SubscriberProto.compute = _rdrCtxCompute;
ReaderProto.derive = SubscriberProto.derive = _rdrCtxDerive;
ReaderProto.transmit = SubscriberProto.transmit = _rdrCtxTransmit;
ReaderProto.effect = SubscriberProto.effect = _rdrCtxEffect;
ReaderProto.watch = SubscriberProto.watch = _rdrCtxWatch;
ReaderProto.scope = SubscriberProto.scope = _rdrCtxScope;
ReaderProto.task = SubscriberProto.task = _rdrCtxTask;
ReaderProto.spawn = SubscriberProto.spawn = _rdrCtxSpawn;
ReaderProto.root = SubscriberProto.root = _rdrCtxRoot;
ReaderProto.signal = SubscriberProto.signal = _rdrCtxSignal;

/**
 * Reader singleton used by startRoot for the ownership context.
 * @type {Reader}
 */
var READER = new Reader();

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
    /** @type {Reader} */
    let ctx = READER;
    let prevNode = ctx._node;
    let prevCtxState = ctx._state;
    CLOCK._state &= (RESET | STATE_IDLE);
    CLOCK._scope = root;
    CLOCK._state |= STATE_OWNER;
    ctx._node = root;
    ctx._state = CTX_OWNER;
    try {
        let cleanup = fn(ctx);
        if (typeof cleanup === 'function') {
            addCleanup(root, cleanup);
        }
    } finally {
        ctx._node = prevNode;
        ctx._state = prevCtxState;
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
     * Change time: stamped when this signal's value changes.
     * Moved to prototype because Signal always sends FLAG_STALE,
     * so downstream nodes receiving from a Signal are always STALE,
     * never PENDING. The dep._ctime > node._time check is only
     * reached for FLAG_PENDING nodes, which cannot have been
     * notified by a Signal.
     * @type {number}
     */
    SignalProto._ctime = 0;

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
                notify(this, FLAG_STALE, CLOCK._time + 1);
                start(CLOCK);
            } else {
                this._flag |= FLAG_SCHEDULED;
                let index = CLOCK._signals++;
                SIGNALS[index] = this;
                PAYLOADS[index] = value;
            }
        }
    };

    /**
     * 
     * @param {T} value 
     * @param {number} time
     */
    SignalProto._update = function (value, time) {
        this._value = value;
        if (this._flag & FLAG_SCHEDULED) {
            this._flag &= ~FLAG_SCHEDULED;
            notify(this, FLAG_STALE, time);
        }
    };

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
     * @type {W | undefined}
     */
    this._args = args;
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
        let opts = this._flag;
        if (opts & FLAG_RUNNING) {
            throw new Error('Circular dependency');
        }
        if (opts & (FLAG_STALE | FLAG_PENDING)) {
            if (CLOCK._state & STATE_IDLE) {
                CLOCK._state &= RESET;
                try {
                    if (opts & FLAG_STALE) {
                        this._update(CLOCK._time);
                    } else {
                        checkRun(this, CLOCK._time);
                    }
                    if (CLOCK._signals > 0 || CLOCK._disposes > 0) {
                        start(CLOCK);
                    }
                } finally {
                    CLOCK._state = STATE_IDLE;
                }
            } else {
                if (opts & FLAG_STALE) {
                    this._update(CLOCK._time);
                } else {
                    checkRun(this, CLOCK._time);
                }
            }
        }
        if (this._flag & FLAG_ERROR) {
            throw this._value;
        }
        return this._value;
    };

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
     * Unified update method. Two top-level branches:
     * 1. Stable/bound — simple try/catch, no version tracking
     * 2. Setup/dynamic — version bump, optional prescan, VSTACK restore
     * Async nodes delegate to _updateAsync before branching.
     * @param {number} time
     */
    ComputeProto._update = function (time) {
        let flag = this._flag;
        this._flag = (flag & ~(FLAG_STALE | FLAG_INIT | FLAG_EQUAL | FLAG_NOTEQUAL)) | FLAG_RUNNING;

        if (flag & (FLAG_ASYNC | FLAG_STREAM)) {
            return this._updateAsync(time);
        }

        let value;
        if ((flag & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE) {
            /** Stable or bound: no version tracking, no dep management */
            try {
                value = (flag & FLAG_BOUND)
                    ? this._fn(this._dep1.val(), this._value, this._args)
                    : this._fn(this, this._value, this._args);
                this._flag &= ~FLAG_ERROR;
            } catch (err) {
                value = err;
                this._flag |= FLAG_ERROR;
            }
        } else {
            /** Setup or dynamic: bump version for dep tracking */
            let prevVersion = this._version;
            let version = CLOCK._version += 2;
            this._version = version;
            let saveStart = VCOUNT;
            let depCount = 0;
            let dep1 = this._dep1;
            let depsLen = 0;
            let prevReused = REUSED;

            if (!(flag & FLAG_SETUP)) {
                /** Dynamic: prescan existing deps with version - 1 */
                REUSED = 0;
                let stamp = version - 1;
                if (dep1 !== null) {
                    let v = dep1._version;
                    if (v > TRANSACTION) {
                        vstackSave(dep1, v);
                    }
                    dep1._version = stamp;
                    depCount = 1;
                }
                let deps = this._deps;
                if (deps !== null) {
                    depsLen = deps.length;
                    for (let i = 0; i < depsLen; i += 2) {
                        let dep = /** @type {Sender} */(deps[i]);
                        let v = dep._version;
                        if (v > TRANSACTION) {
                            vstackSave(dep, v);
                        }
                        dep._version = stamp;
                    }
                    depCount += depsLen / 2;
                }
            }

            try {
                value = this._fn(this, this._value, this._args);
                this._flag &= ~FLAG_ERROR;
            } catch (err) {
                value = err;
                this._flag |= FLAG_ERROR;
            }

            /** Reconcile deps (dynamic only) */
            if (!(flag & FLAG_SETUP) && (REUSED !== depCount || this._dep1 !== dep1 || (this._deps !== null ? this._deps.length : 0) !== depsLen)) {
                pruneDeps(this, version, depCount);
            }
            REUSED = prevReused;
            /** Restore saved version tags from VSTACK (both setup and dynamic) */
            if (VCOUNT > saveStart) {
                for (let i = VCOUNT - 2; i >= saveStart; i -= 2) {
                    VSTACK[i]._version = VSTACK[i + 1];
                }
                VCOUNT = saveStart;
            }
            this._version = prevVersion;
        }

        flag = this._flag;
        this._flag &= ~(FLAG_RUNNING | FLAG_STALE | FLAG_PENDING | FLAG_INIT | FLAG_SETUP);
        this._time = time;
        if (flag & FLAG_ERROR) {
            this._value = value;
            this._ctime = time;
        } else if (value !== this._value) {
            this._value = value;
            if (!(flag & FLAG_EQUAL)) {
                this._ctime = time;
            }
        } else if (flag & (FLAG_NOTEQUAL | FLAG_TRANSMIT)) {
            this._ctime = time;
        }
    };

    /**
     * Async update path. Same two-branch structure as _update but with
     * async post-processing (resolvePromise/resolveIterator).
     * @param {number} time
     */
    ComputeProto._updateAsync = function (time) {
        let flag = this._flag;
        let value;
        if ((flag & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE) {
            try {
                value = (flag & FLAG_BOUND)
                    ? this._fn(this._dep1.val(), this._value, this._args)
                    : this._fn(this, this._value, this._args);
                this._flag &= ~FLAG_ERROR;
            } catch (err) {
                value = err;
                this._flag |= FLAG_ERROR;
            }
        } else {
            let prevVersion = this._version;
            let version = CLOCK._version += 2;
            this._version = version;
            let saveStart = VCOUNT;
            let depCount = 0;
            let dep1 = this._dep1;
            let depsLen = 0;
            let prevReused = REUSED;

            if (!(flag & FLAG_SETUP)) {
                REUSED = 0;
                let stamp = version - 1;
                if (dep1 !== null) {
                    let v = dep1._version;
                    if (v > TRANSACTION) {
                        vstackSave(dep1, v);
                    }
                    dep1._version = stamp;
                    depCount = 1;
                }
                let deps = this._deps;
                if (deps !== null) {
                    depsLen = deps.length;
                    for (let i = 0; i < depsLen; i += 2) {
                        let dep = /** @type {Sender} */(deps[i]);
                        let v = dep._version;
                        if (v > TRANSACTION) {
                            vstackSave(dep, v);
                        }
                        dep._version = stamp;
                    }
                    depCount += depsLen / 2;
                }
            }

            try {
                value = this._fn(this, this._value, this._args);
                this._flag &= ~FLAG_ERROR;
            } catch (err) {
                value = err;
                this._flag |= FLAG_ERROR;
            }

            if (!(flag & FLAG_SETUP) && (REUSED !== depCount || this._dep1 !== dep1 || (this._deps !== null ? this._deps.length : 0) !== depsLen)) {
                pruneDeps(this, version, depCount);
            }
            REUSED = prevReused;
            if (VCOUNT > saveStart) {
                for (let i = VCOUNT - 2; i >= saveStart; i -= 2) {
                    VSTACK[i]._version = VSTACK[i + 1];
                }
                VCOUNT = saveStart;
            }
            this._version = prevVersion;
        }

        flag = this._flag;
        this._flag &= ~(FLAG_RUNNING | FLAG_STALE | FLAG_PENDING | FLAG_INIT | FLAG_SETUP);
        this._time = time;
        if (flag & FLAG_ERROR) {
            this._value = value;
            this._ctime = time;
        } else {
            this._flag |= FLAG_LOADING;
            if (flag & FLAG_STREAM) {
                resolveIterator(new WeakRef(this), /** @type {AsyncIterator | AsyncIterable} */(value), time);
            } else {
                resolvePromise(new WeakRef(this), /** @type {IThenable} */(value), time);
            }
        }
    };

    /**
     * @param {number} time
     * @returns {void}
     */
    ComputeProto._receive = function (time) {
        if (this._flag & FLAG_TRANSMIT) {
            COMPUTES[CLOCK._computes++] = this;
            notify(this, FLAG_STALE, time);
        } else {
            notify(this, FLAG_PENDING, time);
        }
    };

    /**
     * The _read method is the core of dependency tracking. Called as
     * node.read(sender) during a compute/effect fn execution.
     * @template T
     * @param {!Sender<T>} sender
     * @returns {T}
     */
    ComputeProto.read = read;

    /**
     * Declares that this compute's output is semantically equal
     * to its previous value.
     * @param {boolean=} eq
     * @returns {void}
     */
    ComputeProto.equal = _equal;

    /**
     * Marks the current node as stable (no more dynamic dep
     * tracking on subsequent runs).
     * @returns {void}
     */
    ComputeProto.stable = _stable;

    /**
     * Registers a cleanup function. Only valid on Owner nodes.
     * @param {function(): void} fn
     * @returns {void}
     */
    ComputeProto.cleanup = _cleanup;

    /**
     * Registers a recover handler. Only valid on Owner nodes.
     * @param {function(*): boolean} fn
     * @returns {void}
     */
    ComputeProto.recover = _recover;
}

/**
 * @param {Compute} node
 * @returns {void}
 */
function startCompute(node) {
    let clock = CLOCK;
    let state = clock._state;
    try {
        TRANSACTION = clock._version;
        node._update(clock._time);
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
        if (dep._flag & (FLAG_STALE | FLAG_PENDING)) {
            checkRun(/** @type {Compute} */(dep), time);
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
            if (dep._flag & (FLAG_STALE | FLAG_PENDING)) {
                checkRun(/** @type {Compute} */(dep), time);
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
 * @param {Compute | Effect} node
 * @param {number} time
 * @returns {void}
 */
function checkRun(node, time) {
    if (node._flag & FLAG_STALE) {
        node._update(time);
        return;
    }

    let lastRun = node._time;
    let dep = node._dep1;
    if (dep !== null) {
        if (dep._flag & FLAG_STALE) {
            dep._update(time);
        } else if (dep._flag & FLAG_PENDING) {
            checkRun(dep, time);
        }
        if (dep._ctime > lastRun) {
            node._update(time);
            return;
        }
    }
    let deps = node._deps;
    if (deps !== null) {
        let count = deps.length;
        for (let i = 0; i < count; i += 2) {
            dep = /** @type {Sender} */(deps[i]);
            if (dep._flag & FLAG_STALE) {
                dep._update(time);
            } else if (dep._flag & FLAG_PENDING) {
                checkRun(dep, time);
            }
            if (dep._ctime > lastRun) {
                node._update(time);
                return;
            }
        }
    }
    /** No dep changed -- clear flags without re-executing */
    node._time = time;
    node._flag &= ~(FLAG_STALE | FLAG_PENDING);
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

    iterator.next().then(onNext, onError);
}

/**
 * @template T
 * @param {Compute<T>} node
 * @param {T | *} value
 * @returns {void}
 */
function settle(node, value) {
    node._flag &= ~FLAG_LOADING;

    if (value !== node._value || (node._flag & FLAG_ERROR)) {
        node._value = value;
        let time = CLOCK._time + 1;
        node._ctime = time;
        if (unbound(node)) {
            node._fn = node._args = null;
        }
        notify(node, FLAG_STALE, time);
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
    /**
     * @type {number}
     */
    this._version = 0;
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
     * Unified update method for effects. Two top-level branches:
     * 1. Stable/bound — set FLAG_RUNNING, call fn, restore state
     * 2. Setup/dynamic — version bump, optional prescan, VSTACK restore
     * Pre-execution cleanup and scope save happen before branching.
     * Async nodes delegate to _updateAsync before state modification.
     * @param {number} time
     */
    EffectProto._update = function (time) {
        let flag = this._flag;

        /** Pre-execution cleanup for non-setup runs */
        if (!(flag & FLAG_SETUP) && ((flag & FLAG_SCOPE) || this._cleanup !== null)) {
            clearOwned(this);
        }

        /** Async nodes delegate before modifying CLOCK state */
        if (flag & (FLAG_ASYNC | FLAG_STREAM)) {
            return this._updateAsync(time);
        }

        /** @type {(function(): void) | null | undefined} */
        let value;
        let state = CLOCK._state;
        let scope = CLOCK._scope;
        CLOCK._state &= RESET;
        if (flag & FLAG_SCOPE) {
            CLOCK._scope = this;
            CLOCK._state |= STATE_OWNER | STATE_SCOPE;
        }

        if ((flag & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE) {
            /** Stable or bound: no version tracking, no dep management */
            this._flag |= FLAG_RUNNING;
            try {
                value = (flag & FLAG_BOUND)
                    ? this._fn(this._dep1.val(), this._args)
                    : this._fn(this, this._args);
            } finally {
                this._time = time;
                this._flag &= ~(FLAG_RUNNING | FLAG_STALE | FLAG_PENDING);
                CLOCK._state = state;
                CLOCK._scope = scope;
            }
        } else {
            /** Setup or dynamic: bump version for dep tracking */
            let prevVersion = this._version;
            let version = CLOCK._version += 2;
            this._version = version;
            let saveStart = VCOUNT;
            let depCount = 0;
            let dep1 = this._dep1;
            let depsLen = 0;
            let prevReused = REUSED;

            if (!(flag & FLAG_SETUP)) {
                /** Dynamic: prescan existing deps with version - 1 */
                this._flag |= FLAG_RUNNING;
                REUSED = 0;
                let stamp = version - 1;
                if (dep1 !== null) {
                    let v = dep1._version;
                    if (v > TRANSACTION) {
                        vstackSave(dep1, v);
                    }
                    dep1._version = stamp;
                    depCount = 1;
                }
                let deps = this._deps;
                if (deps !== null) {
                    depsLen = deps.length;
                    for (let i = 0; i < depsLen; i += 2) {
                        let dep = /** @type {Sender} */(deps[i]);
                        let v = dep._version;
                        if (v > TRANSACTION) {
                            vstackSave(dep, v);
                        }
                        dep._version = stamp;
                    }
                    depCount += depsLen / 2;
                }
            }

            try {
                value = this._fn(this, this._args);
            } finally {
                /** Reconcile deps (dynamic only) */
                if (!(flag & FLAG_SETUP) && (REUSED !== depCount || this._dep1 !== dep1 || (this._deps !== null ? this._deps.length : 0) !== depsLen)) {
                    pruneDeps(this, version, depCount);
                }
                REUSED = prevReused;
                /** Restore saved version tags from VSTACK (both setup and dynamic) */
                if (VCOUNT > saveStart) {
                    for (let i = VCOUNT - 2; i >= saveStart; i -= 2) {
                        VSTACK[i]._version = VSTACK[i + 1];
                    }
                    VCOUNT = saveStart;
                }
                this._version = prevVersion;
                this._time = time;
                this._flag &= ~(FLAG_RUNNING | FLAG_STALE | FLAG_PENDING | FLAG_INIT | FLAG_SETUP);
                CLOCK._state = state;
                CLOCK._scope = scope;
            }
        }

        if (typeof value === 'function') {
            addCleanup(this, value);
        }
    };

    /**
     * Async update path for effects. Same two-branch structure as _update
     * but with async post-processing (resolveEffectPromise/resolveEffectIterator).
     * @param {number} time
     */
    EffectProto._updateAsync = function (time) {
        let flag = this._flag;
        let value;
        let state = CLOCK._state;
        let scope = CLOCK._scope;
        CLOCK._state &= RESET;
        if (flag & FLAG_SCOPE) {
            CLOCK._scope = this;
            CLOCK._state |= STATE_OWNER | STATE_SCOPE;
        }

        if ((flag & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE) {
            this._flag |= FLAG_RUNNING;
            try {
                value = (flag & FLAG_BOUND)
                    ? this._fn(this._dep1.val(), this._args)
                    : this._fn(this, this._args);
            } finally {
                this._time = time;
                this._flag &= ~(FLAG_RUNNING | FLAG_STALE | FLAG_PENDING);
                CLOCK._state = state;
                CLOCK._scope = scope;
            }
        } else {
            let prevVersion = this._version;
            let version = CLOCK._version += 2;
            this._version = version;
            let saveStart = VCOUNT;
            let depCount = 0;
            let dep1 = this._dep1;
            let depsLen = 0;
            let prevReused = REUSED;

            if (!(flag & FLAG_SETUP)) {
                this._flag |= FLAG_RUNNING;
                REUSED = 0;
                let stamp = version - 1;
                if (dep1 !== null) {
                    let v = dep1._version;
                    if (v > TRANSACTION) {
                        vstackSave(dep1, v);
                    }
                    dep1._version = stamp;
                    depCount = 1;
                }
                let deps = this._deps;
                if (deps !== null) {
                    depsLen = deps.length;
                    for (let i = 0; i < depsLen; i += 2) {
                        let dep = /** @type {Sender} */(deps[i]);
                        let v = dep._version;
                        if (v > TRANSACTION) {
                            vstackSave(dep, v);
                        }
                        dep._version = stamp;
                    }
                    depCount += depsLen / 2;
                }
            }

            try {
                value = this._fn(this, this._args);
            } finally {
                if (!(flag & FLAG_SETUP) && (REUSED !== depCount || this._dep1 !== dep1 || (this._deps !== null ? this._deps.length : 0) !== depsLen)) {
                    pruneDeps(this, version, depCount);
                }
                REUSED = prevReused;
                if (VCOUNT > saveStart) {
                    for (let i = VCOUNT - 2; i >= saveStart; i -= 2) {
                        VSTACK[i]._version = VSTACK[i + 1];
                    }
                    VCOUNT = saveStart;
                }
                this._version = prevVersion;
                this._time = time;
                this._flag &= ~(FLAG_RUNNING | FLAG_STALE | FLAG_PENDING | FLAG_INIT | FLAG_SETUP);
                CLOCK._state = state;
                CLOCK._scope = scope;
            }
        }

        this._flag |= FLAG_LOADING;
        if (flag & FLAG_STREAM) {
            resolveEffectIterator(new WeakRef(this), value);
        } else {
            resolveEffectPromise(new WeakRef(this), value);
        }
    };

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
     * @param {number} time
     * @returns {void}
     */
    EffectProto._receive = function (time) {
        if (this._flag & FLAG_SCOPE) {
            let level = this._level;
            let count = LEVELS[level];
            SCOPES[level][count] = this;
            LEVELS[level] = count + 1;
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
            EFFECTS[CLOCK._effects++] = this;
        }
    };

    /**
     * The _read method for Effect nodes.
     * @template T
     * @param {!Sender<T>} sender
     * @returns {T}
     */
    EffectProto.read = read;

    /**
     * Declares equal/not-equal semantics on the node.
     * @param {boolean=} eq
     * @returns {void}
     */
    EffectProto.equal = _equal;

    /**
     * Marks the current node as stable.
     * @returns {void}
     */
    EffectProto.stable = _stable;

    /**
     * Registers a cleanup function.
     * @param {function(): void} fn
     * @returns {void}
     */
    EffectProto.cleanup = _cleanup;

    /**
     * Registers a recover handler.
     * @param {function(*): boolean} fn
     * @returns {void}
     */
    EffectProto.recover = _recover;

    /**
     * Ownership context methods on Effect.
     */
    EffectProto.compute = _ctxCompute;
    EffectProto.derive = _ctxDerive;
    EffectProto.transmit = _ctxTransmit;
    EffectProto.effect = _ctxEffect;
    EffectProto.watch = _ctxWatch;
    EffectProto.scope = _ctxScope;
    EffectProto.task = _ctxTask;
    EffectProto.spawn = _ctxSpawn;
    EffectProto.root = _ctxRoot;
    EffectProto.signal = _ctxSignal;
}



/**
 * @param {!Effect} node
 * @returns {void}
 */
function startEffect(node) {
    let clock = CLOCK;
    let state = clock._state;
    try {
        TRANSACTION = clock._version;
        node._update(clock._time);
        if (clock._signals > 0 || clock._disposes > 0) {
            start(clock);
        }
    } catch (err) {
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
        let depth = LEVELS.length;
        if (level >= depth) {
            LEVELS[depth] = 0;
            SCOPES[depth] = [];
        }
    }
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
                for (let i = 0; i < count; i++) {
                    DISPOSES[i]._dispose();
                    DISPOSES[i] = null;
                }
                clock._disposes = 0;
            }
            if (clock._signals > 0) {
                let count = clock._signals;
                for (let i = 0; i < count; i++) {
                    SIGNALS[i]._update(PAYLOADS[i], time);
                    SIGNALS[i] = PAYLOADS[i] = null;
                }
                clock._signals = 0;
            }
            if (clock._computes > 0) {
                for (let i = 0; i < clock._computes; i++) {
                    let node = COMPUTES[i];
                    if (node._flag & FLAG_STALE) {
                        TRANSACTION = clock._version;
                        node._update(time);
                    }
                    COMPUTES[i] = null;
                }
                clock._computes = 0;
            }
            if (clock._scopes > 0) {
                let minlevel = clock._minlevel;
                let maxlevel = clock._maxlevel;
                let levels = LEVELS;
                let scopes = SCOPES;
                for (let i = minlevel; i <= maxlevel; i++) {
                    let effects = scopes[i];
                    let count = levels[i];
                    for (let j = 0; j < count; j++) {
                        let node = effects[j];
                        if ((node._flag & FLAG_STALE) || ((node._flag & FLAG_PENDING) && needsUpdate(node, time))) {
                            TRANSACTION = clock._version;
                            try {
                                node._update(time);
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
                        effects[j] = null;
                    }
                    levels[i] = 0;
                }
                clock._scopes =
                    clock._minlevel =
                    clock._maxlevel = 0;
            }
            if (clock._effects > 0) {
                let i = 0;
                let count = clock._effects;
                while (i < count) {
                    try {
                        for (; i < count; i++) {
                            TRANSACTION = clock._version;
                            checkRun(EFFECTS[i], time);
                            EFFECTS[i] = null;
                        }
                    } catch (err) {
                        let node = EFFECTS[i];
                        EFFECTS[i++] = null;
                        clock._state = STATE_START;
                        let caught = tryRecover(node, err);
                        node._dispose();
                        if (!caught && !thrown) {
                            error = err;
                            thrown = true;
                        }
                    }
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
                LEVELS[min++] = 0;
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
 * Arrays are always kept packed -- no null gaps ever exist inside them.
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

/**
 * @template T
 * @this {Receiver}
 * @param {!Sender<T>} sender
 * @returns {T}
 */
function read(sender) {
    let flag = this._flag;
    let value = sender.val();

    if (
        (flag & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE
    ) {
        return value;
    }

    let version = this._version;
    let stamp = sender._version;

    /** Re-read dedup: already visited this execution — O(1) */
    if (stamp === version) {
        return value;
    }

    /** Reuse: was our dep last run, visited again this run — O(1) */
    if (stamp === version - 1) {
        sender._version = version;
        REUSED++;
        return value;
    }

    /**
     * Conflict: tagged by some other running node in this execution
     * tree. Save [sender, version] to global VSTACK for restoration.
     */
    if (stamp > TRANSACTION) {
        VSTACK[VCOUNT++] = sender;
        VSTACK[VCOUNT++] = stamp;
    }

    /** New dep (or cold sender): stamp and subscribe */
    sender._version = version;

    if (flag & FLAG_SETUP) {
        /**
         * SETUP path: subscribe directly, same as original Reader code.
         */
        /** @type {number} */
        let depslot = 0;
        if (this._dep1 === null) {
            this._dep1 = sender;
        } else if (this._deps === null) {
            depslot = 1;
        } else {
            depslot = (this._deps.length / 2) + 1;
        }
        let subslot = subscribe(sender, this, depslot);
        switch (depslot) {
            case 0: this._dep1slot = subslot; break;
            case 1: this._deps = [sender, subslot]; break;
            default: this._deps.push(sender, subslot);
        }
    } else {
        /**
         * DYNAMIC path: always push new dep to _deps with slot 0.
         * pruneDeps handles subscription after fn() returns.
         */
        if (this._deps === null) {
            this._deps = [sender, 0];
        } else {
            this._deps.push(sender, 0);
        }
    }

    return value;
}

// ─── pruneDeps ─────────────────────────────────────────────────────────────

/**
 * After a dynamic fn re-execution, reconciles dep subscriptions.
 * Does three things in a single pass over the first _depCount entries:
 *
 * 1. Keep or drop each dep based on whether _version === execVersion
 * 2. Restore _vstack for each dep inline (no separate restore loop)
 * 3. Compact the kept deps in-place
 *
 * New deps pushed beyond _depCount during fn() are already subscribed.
 * They just need to be shifted into the compacted region.
 *
 * @param {Receiver} node
 * @param {number} version
 * @param {number} depCount
 * @returns {void}
 */
function pruneDeps(node, version, depCount) {
    let deps = node._deps;
    let existingLen = depCount > 1 ? (depCount - 1) * 2 : 0;
    /** ni = index of next new dep to consume (unsubscribed, slot 0) */
    let ni = deps !== null ? existingLen : 0;
    let totalLen = deps !== null ? deps.length : 0;

    /** Check dep1 */
    let dep1 = node._dep1;
    if (dep1 !== null && depCount >= 1) {
        if (dep1._version !== version) {
            clearReceiver(dep1, node._dep1slot);
            if (ni < totalLen) {
                /** Fill dep1 with a new dep */
                node._dep1 = /** @type {Sender} */(deps[ni]);
                node._dep1slot = subscribe(/** @type {Sender} */(deps[ni]), node, 0);
                ni += 2;
            } else {
                node._dep1 = null;
                node._dep1slot = 0;
            }
        }
    }

    if (deps === null) {
        return;
    }

    /**
     * Three-pointer scan:
     *   i    — forward through existing region
     *   ni   — next new dep to consume (unsubscribed, in new region)
     *   tail — end of live region, shrinks when we pop reused deps from the back
     *
     * When we hit a dropped dep at position i:
     *   1. If new deps available (ni < totalLen): subscribe new dep at position i
     *   2. Else: scan backward from tail to find last reused dep, move it to i
     *      Any dropped deps found during backward scan are also cleared.
     *      When forward and backward pointers meet, we're done.
     */
    let tail = existingLen;
    let i = 0;
    while (i < tail) {
        let dep = /** @type {Sender} */(deps[i]);
        let slot = /** @type {number} */(deps[i + 1]);
        if (dep._version === version) {
            /** Reused — stays in place */
            i += 2;
            continue;
        }
        /** Dropped — unbind */
        clearReceiver(dep, slot);
        if (ni < totalLen) {
            /** Fill hole with next new dep */
            let newDep = /** @type {Sender} */(deps[ni]);
            let depslot = i / 2 + 1;
            let subslot = subscribe(newDep, node, depslot);
            deps[i] = newDep;
            deps[i + 1] = subslot;
            ni += 2;
            i += 2;
        } else {
            /**
             * No new deps left. Scan backward from tail to find
             * the last reused dep and swap it into this hole.
             */
            let found = 0;
            while (tail > i + 2) {
                tail -= 2;
                let tDep = /** @type {Sender} */(deps[tail]);
                let tSlot = /** @type {number} */(deps[tail + 1]);
                if (tDep._version === version) {
                    /** Move reused dep into the hole at i */
                    deps[i] = tDep;
                    deps[i + 1] = tSlot;
                    let depslot = i / 2 + 1;
                    if (tSlot === 0) {
                        tDep._sub1slot = depslot;
                    } else {
                        tDep._subs[(tSlot - 1) * 2 + 1] = depslot;
                    }
                    found = 1;
                    break;
                } else {
                    /** Also dropped — unbind */
                    clearReceiver(tDep, tSlot);
                }
            }
            if (found) {
                i += 2;
            } else {
                /** Pointers met — i is the new tail */
                tail = i;
            }
        }
    }

    /** Remaining new deps — subscribe at the end of the live region */
    while (ni < totalLen) {
        let dep = /** @type {Sender} */(deps[ni]);
        let depslot = tail / 2 + 1;
        let subslot = subscribe(dep, node, depslot);
        deps[tail] = dep;
        deps[tail + 1] = subslot;
        tail += 2;
        ni += 2;
    }

    /** Trim or null out */
    if (tail === 0) {
        node._deps = null;
    } else if (tail === 2 && node._dep1 === null) {
        /** Single dep in array, dep1 empty — promote to dep1 */
        let dep = /** @type {Sender} */(deps[0]);
        let slot = /** @type {number} */(deps[1]);
        node._dep1 = dep;
        node._dep1slot = slot;
        if (slot === 0) {
            dep._sub1slot = 0;
        } else {
            dep._subs[(slot - 1) * 2 + 1] = 0;
        }
        node._deps = null;
    } else {
        deps.length = tail;
    }
}

/**
 * @param {Sender} node
 * @param {number} flag
 * @param {number} time
 */
function notify(node, flag, time) {
    /** @type {Receiver} */
    let sub = node._sub1;
    if (sub !== null) {
        if (sub._flag & (FLAG_PENDING | FLAG_STALE)) {
            sub._flag |= flag;
        } else {
            sub._flag |= flag;
            sub._receive(time);
        }
    }
    /** @type {Array<Receiver | number> | null} */
    let subs = node._subs;
    if (subs !== null) {
        let count = subs.length;
        for (let i = 0; i < count; i += 2) {
            sub = /** @type {Receiver} */(subs[i]);
            if (sub._flag & (FLAG_PENDING | FLAG_STALE)) {
                sub._flag |= flag;
            } else {
                sub._flag |= flag;
                sub._receive(time);
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
 * Stable compute. Tracks deps on first run, then never
 * re-tracks. Like compute() with implicit OPT_STABLE.
 * @template T,W
 * @param {function(T,W): T} fn
 * @param {T=} seed
 * @param {W=} args
 * @returns {!Compute<T,null,null,W>}
 */
/**
 * Stable compute. Two signatures:
 *   derive(fn, seed?, args?)       — multi-dep, uses setup tracking
 *   derive(dep, fn, seed?, args?)  — bound single-dep, skips setup
 * @param {function|Sender} fnOrDep
 * @param {*=} seedOrFn
 * @param {*=} argsOrSeed
 * @param {*=} args
 * @returns {!Compute}
 */
function derive(fnOrDep, seedOrFn, argsOrSeed, args) {
    if (typeof fnOrDep === 'function') {
        let node = new Compute(FLAG_STABLE | FLAG_SETUP, fnOrDep, null, seedOrFn, argsOrSeed);
        startCompute(node);
        return node;
    }
    let node = new Compute(FLAG_STABLE | FLAG_BOUND, seedOrFn, fnOrDep, argsOrSeed, args);
    node._dep1slot = subscribe(fnOrDep, node, 0);
    startCompute(node);
    return node;
}

/**
 * Stable effect. Two signatures:
 *   watch(fn, args?)       — multi-dep, uses setup tracking
 *   watch(dep, fn, args?)  — bound single-dep, skips setup
 * @param {function|Sender} fnOrDep
 * @param {*=} fnOrArgs
 * @param {*=} args
 * @returns {!Effect}
 */
function watch(fnOrDep, fnOrArgs, args) {
    if (typeof fnOrDep === 'function') {
        let node = new Effect(FLAG_STABLE | FLAG_SETUP, fnOrDep, null, fnOrArgs);
        startEffect(node);
        return node;
    }
    let node = new Effect(FLAG_STABLE | FLAG_BOUND, fnOrArgs, fnOrDep, args);
    node._dep1slot = subscribe(fnOrDep, node, 0);
    node._owner = CLOCK._scope;
    startEffect(node);
    return node;
}

/**
 * Stable compute with FLAG_TRANSMIT. Two signatures:
 *   transmit(fn, seed?, args?)       — multi-dep, uses setup tracking
 *   transmit(dep, fn, seed?, args?)  — bound single-dep, skips setup
 * @param {function|Sender} fnOrDep
 * @param {*=} seedOrFn
 * @param {*=} argsOrSeed
 * @param {*=} args
 * @returns {!Compute}
 */
function transmit(fnOrDep, seedOrFn, argsOrSeed, args) {
    if (typeof fnOrDep === 'function') {
        let node = new Compute(FLAG_STABLE | FLAG_SETUP | FLAG_TRANSMIT, fnOrDep, null, seedOrFn, argsOrSeed);
        startCompute(node);
        return node;
    }
    let node = new Compute(FLAG_STABLE | FLAG_BOUND | FLAG_TRANSMIT, seedOrFn, fnOrDep, argsOrSeed, args);
    node._dep1slot = subscribe(fnOrDep, node, 0);
    startCompute(node);
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
    FLAG_BOUND, FLAG_DERIVED, FLAG_SCOPE, FLAG_TRANSMIT as FLAG_NOTIFY, FLAG_EQUAL, FLAG_WEAK,
    FLAG_INIT, FLAG_TRANSMIT,
    OP_VALUE, OP_CALLBACK,
    register,
    CTX_EQUAL, CTX_NOTEQUAL, CTX_PROMISE, CTX_ITERABLE, CTX_ASYNC, CTX_OWNER,
    FLAG_ASYNC, FLAG_STREAM,
    OPT_DEFER, OPT_STABLE, OPT_SETUP, OPT_NOTIFY, OPT_WEAK, OPT_DYNAMIC,
    TYPE_ROOT, TYPE_SIGNAL, TYPE_COMPUTE, TYPE_EFFECT,
    TYPEFLAG_MASK, TYPEFLAG_SEND, TYPEFLAG_RECEIVE, TYPEFLAG_OWNER,
    RESET, OPTIONS,
    scheduleSignal,
    subscribe,
    startEffect,
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
