import { Anod } from "./api.js";
import { Disposer, Owner, Sender, Receiver, ISignal, ICompute, IEffect } from "./types.js";

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

const FLAG_STALE = 1 << 0;
const FLAG_PENDING = 1 << 1;
const FLAG_SCHEDULED = 1 << 2;
const FLAG_DISPOSED = 1 << 3;

const FLAG_COMPUTE = 1 << 4;
const FLAG_INIT = 1 << 5;
const FLAG_SETUP = 1 << 6;
const FLAG_RUNNING = 1 << 7;
const FLAG_LOADING = 1 << 8;
const FLAG_ERROR = 1 << 9;
const FLAG_DEFER = 1 << 10;
const FLAG_STABLE = 1 << 11;
const FLAG_NOTIFY = 1 << 12;
const FLAG_RECOVER = 1 << 13;
const FLAG_BOUND = 1 << 14;
const FLAG_DERIVED = 1 << 15;
const FLAG_SCOPE = 1 << 16;
const FLAG_WEAK = 1 << 17;
/** Marks that _args has been wrapped to carry a user-facing Reader. */
const FLAG_READER = 1 << 22;


const FLAG_EQUAL = 1 << 18;
const FLAG_NOTEQUAL = 1 << 19;
const FLAG_ASYNC = 1 << 20;
const FLAG_STREAM = 1 << 21;

/**
 * RUNNING state bits. STATE and RUNNING are always set together —
 * a non-zero STATE implies RUNNING !== null.
 */
const STATE_LISTEN = 1;
const STATE_OWN = 2;

const OPT_DEFER = FLAG_DEFER;
const OPT_STABLE = FLAG_STABLE;
const OPT_SETUP = FLAG_SETUP;
const OPT_NOTIFY = FLAG_NOTIFY;
const OPT_WEAK = FLAG_WEAK;

const OPT_DYNAMIC = 0x800000;

const OPTIONS = OPT_DEFER | OPT_STABLE | OPT_SETUP | OPT_NOTIFY | OPT_WEAK | FLAG_ASYNC | FLAG_STREAM;


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
 * Pre-allocated stack for iterative checkRun.
 * CSTACK holds node references, CINDEX holds dep iteration positions.
 * @type {Array<Compute>}
 */
var CSTACK = new Array(1024);
/**
 * Position encoding: -1 = was checking dep1, >= 0 = index in _deps array.
 * @type {Array<number>}
 */
var CINDEX = new Array(1024);
/**
 * Global stack pointer for checkRun. Supports re-entrant calls via
 * base-pointer saving (each call saves CTOP on entry).
 * @type {number}
 */
var CTOP = 0;

/**
 * Pre-allocated stack for batching deps during setup execution.
 * During FLAG_SETUP _update, deps are written here as [sender, subslot]
 * pairs. After the fn returns, _deps is created via slice() with
 * exact capacity — avoiding V8's push-based over-allocation.
 * @type {Array<Sender | number>}
 */
var DSTACK = new Array(1024);
/** @type {number} Tail pointer into DSTACK */
var DCOUNT = 0;
/**
 * Base pointer for the current node's deps region in DSTACK.
 * Saved/restored for nesting (compute A's fn triggers compute B's setup).
 * @type {number}
 */
var DBASE = 0;

/**
 * The currently-running node. Acts as both the listening receiver
 * (for dep tracking) and the owning scope (for ownership). The STATE
 * bitmask distinguishes which role(s) it fills.
 * @type {Compute | Effect | Root | null}
 */
var RUNNING = null;
/**
 * Bitmask of STATE_LISTEN | STATE_OWN. Paired with RUNNING — a non-zero
 * value implies RUNNING !== null.
 * @type {number}
 */
var STATE = 0;
/**
 * Currently-tracking receiver's _version. Mirror of RUNNING._version
 * when RUNNING is a Receiver in a tracking context — but as a plain
 * number, avoids the bimorphic field-access cost that `RUNNING._version`
 * would incur at every `sig.val()` call site. Set by Compute/Effect
 * _update when entering the tracking path, restored on exit.
 * @type {number}
 */
var RVER = 0;

var TIME = 1;

var IDLE = true;

var VERSION = 1;

/** @const @type {Array<Disposer>} */
var DISPOSES = [];

var DISPOSES_COUNT = 0;

/** @const @type {Array<number>} */
var SIGNAL_OPS = new Array(16);

/**
 * @const
 * @type {Array<Signal>}
 */
var SIGNALS = new Array(16);
/**
 * @const
 * @type {Array}
 */
var PAYLOADS = new Array(16);

var SIGNALS_COUNT = 0;

/**
 * @const
 * @type {Array<Compute>}
 */
var COMPUTES = new Array(256);

var COMPUTES_COUNT = 0;

/** @const @type {Array<number>} */
var LEVELS = [0, 0, 0, 0];
/** @const @type {Array<Array<Effect>>} */
var SCOPES = [[], [], [], []];

var SCOPES_COUNT = 0;

/** @const @type {Array<Effect>} */
var EFFECTS = new Array(256);

var EFFECTS_COUNT = 0;


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
    let index = SIGNALS_COUNT++;
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
        if (IDLE) {
            this._dispose();
        } else {
            DISPOSES[DISPOSES_COUNT++] = this;
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


// ─── Reader (async persistence) ────────────────────────────────────────────
// Reader is a handle obtained via the top-level `reader()` function. It
// persists a reactive tracking context across an async boundary so that
// a `.then(...)` callback can call `reader.read(sig)` and have the dep
// register on the owning node. On the next `_update` of the owning node,
// the existing reader is disposed (marked FLAG_DISPOSED, _node nulled)
// and any fresh `reader()` call allocates a new one.

/**
 * @constructor
 */
function Reader() {
    /** @type {Receiver | null} */
    this._node = null;
    /** @type {number} */
    this._flag = 0;
}

/** @const */
var ReaderProto = Reader.prototype;

/**
 * Reads `sender` and directly subscribes the captured node as a
 * dependent if not already subscribed. Unlike the auto-track path in
 * `signal.val()`, this bypasses the version-tagging machinery (which
 * only works inside a node's sync `_update`), so it is safe to call
 * from an async `.then` callback. Dedup is O(deps).
 * Throws if the reader has been disposed.
 * @template T
 * @param {!Sender<T>} sender
 * @returns {T}
 */
ReaderProto.read = function (sender) {
    if (this._flag & FLAG_DISPOSED) {
        throw new Error('Reader disposed');
    }
    let node = this._node;
    let value = sender.val();
    /** Dedup */
    if (node._dep1 === sender) {
        return value;
    }
    let deps = node._deps;
    if (deps !== null) {
        for (let i = 0; i < deps.length; i += 2) {
            if (deps[i] === sender) {
                return value;
            }
        }
    }
    /** Subscribe fresh */
    if (node._dep1 === null) {
        node._dep1slot = subscribe(sender, node, -1);
        node._dep1 = sender;
    } else {
        let depslot = deps === null ? 0 : deps.length;
        let slot = subscribe(sender, node, depslot);
        if (deps === null) {
            node._deps = [sender, slot];
        } else {
            deps.push(sender, slot);
        }
    }
    return value;
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
 * @constructor
 * @implements {Owner}
 */
function Root() {
    /**
     * @type {number}
     */
    this._flag = 0;
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
    this._flag = FLAG_DISPOSED;
    clearOwned(this);
    this._cleanup =
        this._owned =
        this._recover = null;
};

/**
 * @param {Root} root
 * @param {function(): ((function(): void) | void)} fn
 * @returns {void}
 */
function startRoot(root, fn) {
    let prevRunning = RUNNING;
    let prevState = STATE;
    RUNNING = root;
    STATE = STATE_OWN;
    let idle = IDLE;
    IDLE = true;
    try {
        let cleanup = fn();
        if (typeof cleanup === 'function') {
            addCleanup(root, cleanup);
        }
    } finally {
        IDLE = idle;
        STATE = prevState;
        RUNNING = prevRunning;
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
        if ((STATE & STATE_LISTEN) !== 0 && RVER !== this._version) {
            RUNNING._read(this);
        }
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
            if (IDLE) {
                this._value = value;
                notify(this, FLAG_STALE);
                start();
            } else {
                this._flag |= FLAG_SCHEDULED;
                let index = SIGNALS_COUNT++;
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
            notify(this, FLAG_STALE);
        }
    };

    /**
     * @this {!Signal<T>}
     * @returns {void}
     */
    SignalProto._dispose = function () {
        this._flag = FLAG_DISPOSED;
        clearSubs(this);
        this._value = null;
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
    this._flag = FLAG_COMPUTE | FLAG_INIT | FLAG_STALE | opts;
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
        let flag = this._flag;
        if (flag & FLAG_RUNNING) {
            throw new Error('Circular dependency');
        }
        if (flag & (FLAG_STALE | FLAG_PENDING)) {
            if (IDLE) {
                IDLE = false;
                try {
                    TRANSACTION = VERSION;
                    if (flag & FLAG_STALE) {
                        this._update(TIME);
                    } else {
                        checkRun(this, TIME);
                    }
                    if (SIGNALS_COUNT > 0 || DISPOSES_COUNT > 0) {
                        start();
                    }
                } finally {
                    IDLE = true;
                }
            } else {
                if (flag & FLAG_STALE) {
                    this._update(TIME);
                } else {
                    checkRun(this, TIME);
                }
            }
        }
        if ((STATE & STATE_LISTEN) !== 0 && RVER !== this._version) {
            RUNNING._read(this);
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
        this._flag = FLAG_DISPOSED;
        clearSubs(this);
        clearDeps(this);
        this._fn =
            this._value =
            this._args = null;
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

        /** Save RUNNING/STATE for re-entry. Computes never OWN. */
        let prevRunning = RUNNING;
        let prevState = STATE;
        RUNNING = this;

        let value;
        if ((flag & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE) {
            /** Stable or bound: no tracking, no dep management */
            STATE = 0;
            try {
                value = (flag & FLAG_BOUND)
                    ? this._fn(this._dep1.val(), this._value, this._args)
                    : this._fn(this._value, this._args);
                this._flag &= ~FLAG_ERROR;
            } catch (err) {
                STATE = prevState;
                RUNNING = prevRunning;
                this._value = err;
                this._flag = flag & ~(FLAG_RUNNING | FLAG_STALE | FLAG_PENDING | FLAG_INIT | FLAG_SETUP) | FLAG_ERROR;
                this._time = this._ctime = time;
                return;
            }
        } else {
            STATE = STATE_LISTEN;
            /** Setup or dynamic: bump RVER for dep tracking. Compute's
             *  own _version is its sender-side stamp (stamped by downstream
             *  receivers) — not touched here. */
            let prevRVer = RVER;
            let version = VERSION += 2;
            RVER = version;
            let saveStart = VCOUNT;
            let depsLen = 0;
            let depCount = 0;
            let prevReused = REUSED;

            /** Save DSTACK base for setup — deps are batched in DSTACK
             *  and sliced to exact-capacity _deps after fn returns. */
            let prevDBase = DBASE;
            if (flag & FLAG_SETUP) {
                DBASE = DCOUNT;
            }

            if (!(flag & FLAG_SETUP)) {
                /** Dynamic: prescan existing deps with version - 1 */
                REUSED = 0;
                let dep1 = this._dep1;
                let stamp = version - 1;
                if (dep1 !== null) {
                    let depver = dep1._version;
                    if (depver > TRANSACTION) {
                        VSTACK[VCOUNT++] = dep1;
                        VSTACK[VCOUNT++] = depver;
                    }
                    dep1._version = stamp;
                    depCount = 1;
                }
                let deps = this._deps;
                if (deps !== null) {
                    depsLen = deps.length;
                    for (let i = 0; i < depsLen; i += 2) {
                        let dep = /** @type {Sender} */(deps[i]);
                        let depver = dep._version;
                        if (depver > TRANSACTION) {
                            VSTACK[VCOUNT++] = dep;
                            VSTACK[VCOUNT++] = depver;
                        }
                        dep._version = stamp;
                    }
                    depCount += depsLen >> 1;
                }
            }

            try {
                value = this._fn(this._value, this._args);
                this._flag &= ~FLAG_ERROR;
            } catch (err) {
                value = err;
                this._flag |= FLAG_ERROR;
            }

            /** Reconcile deps (dynamic only) */
            if (!(flag & FLAG_SETUP) && (REUSED !== depCount || (this._deps !== null ? this._deps.length : 0) !== depsLen)) {
                pruneDeps(this, version, depCount);
            }

            /** Create exact-capacity _deps from DSTACK (setup only) */
            if (DCOUNT > DBASE) {
                this._deps = DSTACK.slice(DBASE, DCOUNT);
                DCOUNT = DBASE;
            }
            DBASE = prevDBase;

            REUSED = prevReused;
            /** Restore saved version tags from VSTACK (both setup and dynamic) */
            if (VCOUNT > saveStart) {
                for (let i = VCOUNT - 2; i >= saveStart; i -= 2) {
                    VSTACK[i]._version = VSTACK[i + 1];
                }
                VCOUNT = saveStart;
            }
            RVER = prevRVer;
        }

        STATE = prevState;
        RUNNING = prevRunning;

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
        } else if (flag & (FLAG_NOTEQUAL | FLAG_NOTIFY)) {
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
        /** Unwrap a stale reader left by a prior run (see reader()) */
        if (flag & FLAG_READER) {
            let wrap = this._args;
            if (wrap !== null && wrap._reader !== undefined) {
                wrap._reader._flag = FLAG_DISPOSED;
                wrap._reader._node = null;
                this._args = wrap._args;
            }
            flag &= ~FLAG_READER;
            this._flag = flag;
        }
        let prevRunning = RUNNING;
        let prevState = STATE;
        RUNNING = this;

        let value;
        if ((flag & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE) {
            STATE = 0;
            try {
                value = (flag & FLAG_BOUND)
                    ? this._fn(this._dep1.val(), this._value, this._args)
                    : this._fn(this._value, this._args);
                this._flag &= ~FLAG_ERROR;
            } catch (err) {
                value = err;
                this._flag |= FLAG_ERROR;
            }
        } else {
            STATE = STATE_LISTEN;
            let prevRVer = RVER;
            let version = VERSION += 2;
            RVER = version;
            let saveStart = VCOUNT;
            let depCount = 0;
            let dep1 = this._dep1;
            let depsLen = 0;
            let prevReused = REUSED;

            let prevDBase = DBASE;
            if (flag & FLAG_SETUP) {
                DBASE = DCOUNT;
            }

            if (!(flag & FLAG_SETUP)) {
                REUSED = 0;
                let stamp = version - 1;
                if (dep1 !== null) {
                    let depver = dep1._version;
                    if (depver > TRANSACTION) {
                        VSTACK[VCOUNT++] = dep1;
                        VSTACK[VCOUNT++] = depver;
                    }
                    dep1._version = stamp;
                    depCount = 1;
                }
                let deps = this._deps;
                if (deps !== null) {
                    depsLen = deps.length;
                    for (let i = 0; i < depsLen; i += 2) {
                        let dep = /** @type {Sender} */(deps[i]);
                        let depver = dep._version;
                        if (depver > TRANSACTION) {
                            VSTACK[VCOUNT++] = dep;
                            VSTACK[VCOUNT++] = depver;
                        }
                        dep._version = stamp;
                    }
                    depCount += depsLen / 2;
                }
            }

            try {
                value = this._fn(this._value, this._args);
                this._flag &= ~FLAG_ERROR;
            } catch (err) {
                value = err;
                this._flag |= FLAG_ERROR;
            }

            if (!(flag & FLAG_SETUP) && (REUSED !== depCount || (this._deps !== null ? this._deps.length : 0) !== depsLen)) {
                pruneDeps(this, version, depCount);
            }
            if (DCOUNT > DBASE) {
                this._deps = DSTACK.slice(DBASE, DCOUNT);
                DCOUNT = DBASE;
            }
            DBASE = prevDBase;
            REUSED = prevReused;
            if (VCOUNT > saveStart) {
                for (let i = VCOUNT - 2; i >= saveStart; i -= 2) {
                    VSTACK[i]._version = VSTACK[i + 1];
                }
                VCOUNT = saveStart;
            }
            RVER = prevRVer;
        }

        STATE = prevState;
        RUNNING = prevRunning;

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
     * @returns {void}
     */
    ComputeProto._receive = function () {
        if (this._flag & FLAG_NOTIFY) {
            COMPUTES[COMPUTES_COUNT++] = this;
            notify(this, FLAG_STALE);
        } else {
            notify(this, FLAG_PENDING);
        }
    };

    /**
     * Registers a dep link. Called from val() when tracking is active.
     * Shared impl — see _read function above.
     */
    ComputeProto._read = _read;

}

/**
 * @param {Compute} node
 * @returns {void}
 */
function startCompute(node) {
    if (IDLE) {
        IDLE = false;
        try {
            TRANSACTION = VERSION;
            node._update(TIME);
            if (SIGNALS_COUNT > 0 || DISPOSES_COUNT > 0) {
                start();
            }
        } finally {
            IDLE = true;
        }
    } else {
        node._update(TIME);
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
        let df = dep._flag;
        if (df & FLAG_STALE) {
            TRANSACTION = VERSION;
            /** @type {Compute} */(dep)._update(time);
        } else if (df & FLAG_PENDING) {
            TRANSACTION = VERSION;
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
            let df = dep._flag;
            if (df & FLAG_STALE) {
                TRANSACTION = VERSION;
                /** @type {Compute} */(dep)._update(time);
            } else if (df & FLAG_PENDING) {
                TRANSACTION = VERSION;
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
 * Pull-based evaluation using an explicit stack instead of recursion.
 * Walks down PENDING dep chains, updates STALE leaves, then ascends
 * checking whether each dep's _ctime changed and updating accordingly.
 *
 * Stack frame encoding:
 *   CSTACK[i] = the parent node that was being scanned
 *   CINDEX[i] = -1 if we descended from dep1, >= 0 if from _deps[index]
 *
 * Re-entrancy safe: each call saves/restores CTOP via `base`.
 *
 * The ascend phase uses a tight while loop to cascade updates (when
 * deps changed) or fast-clear flags (when deps didn't change) without
 * re-entering the main scan loop. This avoids resumeFrom branching
 * overhead in the common single-dep-chain case.
 *
 * @param {Compute} node
 * @param {number} time
 * @returns {void}
 */
function checkRun(node, time) {
    let base = CTOP;
    let dep = node._dep1;

    /**
     * Fast descent: walk single-dep PENDING chains without the overhead
     * of the full scan loop (no resumeFrom branching, no updated flag).
     * Stops when dep1 is STALE, clean, null, or both STALE+PENDING.
     */
    while (dep !== null && ((dep._flag & (FLAG_STALE | FLAG_PENDING)) === FLAG_PENDING)) {
        CSTACK[CTOP] = node;
        CINDEX[CTOP] = -1;
        CTOP++;
        node = dep;
        dep = node._dep1;
    }

    /** -2 = fresh entry (scan from dep1), -1 = resume after dep1, >= 0 = resume after _deps[n] */
    let resumeFrom = -2;

    outer:
    for (;;) {
        let lastRun = node._time;
        let i;

        /**
         * Labeled block: `break scan` skips the flag-clearing code and
         * jumps directly to the ascend loop when a dep has changed.
         * This eliminates the `updated` boolean and its branches.
         */
        scan: {
            if (resumeFrom === -2) {
                /** Fresh entry: start scanning from dep1 */
                dep = node._dep1;
                if (dep !== null) {
                    let df = dep._flag;
                    if (df & FLAG_STALE) {
                        dep._update(time);
                    } else if (df & FLAG_PENDING) {
                        /** Descend into dep1 — push current node, resume later */
                        CSTACK[CTOP] = node;
                        CINDEX[CTOP] = -1;
                        CTOP++;
                        node = dep;
                        continue outer;
                    }
                    if (dep._ctime > lastRun) {
                        node._update(time);
                        break scan;
                    }
                }
                i = 0;
            } else if (resumeFrom === -1) {
                /** Returned from processing dep1 — check if it changed */
                if (node._dep1._ctime > lastRun) {
                    node._update(time);
                    break scan;
                }
                i = 0;
            } else {
                /** Returned from processing _deps[resumeFrom] — check ctime */
                if (node._deps[resumeFrom]._ctime > lastRun) {
                    node._update(time);
                    break scan;
                }
                i = resumeFrom + 2;
            }

            let deps = node._deps;
            if (deps !== null) {
                let count = deps.length;
                for (; i < count; i += 2) {
                    dep = /** @type {Sender} */(deps[i]);
                    let df = dep._flag;
                    if (df & FLAG_STALE) {
                        dep._update(time);
                    } else if (df & FLAG_PENDING) {
                        /** Descend into deps[i] — push current node */
                        CSTACK[CTOP] = node;
                        CINDEX[CTOP] = i;
                        CTOP++;
                        node = dep;
                        resumeFrom = -2;
                        continue outer;
                    }
                    if (dep._ctime > lastRun) {
                        node._update(time);
                        break scan;
                    }
                }
            }

            /** No dep changed — clear flags without re-executing */
            node._time = time;
            node._flag &= ~(FLAG_STALE | FLAG_PENDING);
        }

        /**
         * Unified ascend: tight loop that either cascades updates up the
         * stack (when child _ctime changed) or fast-clears parent flags
         * (when child didn't change and parent has no more deps to check).
         * Falls back to the main scan loop only when a parent has
         * remaining unchecked deps.
         */
        while (CTOP > base) {
            CTOP--;
            let parent = CSTACK[CTOP];
            let idx = CINDEX[CTOP];
            /**
             * `node` is always the child that the parent was scanning
             * when it pushed — no need to look it up from parent._dep1
             * or parent._deps[idx].
             */
            if (node._ctime > parent._time) {
                /** Child changed — update parent and keep cascading */
                parent._update(time);
                node = parent;
                continue;
            }
            /** Child unchanged — check if parent has more deps to scan */
            if (idx === -1) {
                if (parent._deps !== null) {
                    /** Has deps array — resume scanning in main loop */
                    node = parent;
                    resumeFrom = -1;
                    continue outer;
                }
            } else if (idx + 2 < parent._deps.length) {
                /** More entries in deps array — resume scanning */
                node = parent;
                resumeFrom = idx;
                continue outer;
            }
            /** No more deps — clear parent and keep ascending */
            parent._time = time;
            parent._flag &= ~(FLAG_STALE | FLAG_PENDING);
            node = parent;
        }
        return;
    }
}

/**
 * Pull-based evaluation. Recursively pulls deps, then only
 * runs this compute if a dep's value actually changed (_ctime).
 * @param {Compute | Effect} node
 * @param {number} time
 * @returns {void}
 */
// function checkRun(node, time) {
//     if (node._flag & FLAG_STALE) {
//         node._update(time);
//         return;
//     }

//     let lastRun = node._time;
//     let dep = node._dep1;
//     if (dep !== null) {
//         if (dep._flag & FLAG_STALE) {
//             dep._update(time);
//         } else if (dep._flag & FLAG_PENDING) {
//             checkRun(dep, time);
//         }
//         if (dep._ctime > lastRun) {
//             node._update(time);
//             return;
//         }
//     }
//     let deps = node._deps;
//     if (deps !== null) {
//         let count = deps.length;
//         for (let i = 0; i < count; i += 2) {
//             dep = /** @type {Sender} */(deps[i]);
//             if (dep._flag & FLAG_STALE) {
//                 dep._update(time);
//             } else if (dep._flag & FLAG_PENDING) {
//                 checkRun(dep, time);
//             }
//             if (dep._ctime > lastRun) {
//                 node._update(time);
//                 return;
//             }
//         }
//     }
//     /** No dep changed -- clear flags without re-executing */
//     node._time = time;
//     node._flag &= ~(FLAG_STALE | FLAG_PENDING);
// }

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
        let time = TIME + 1;
        node._ctime = time;
        if (unbound(node)) {
            /** Clean up any pending reader first */
            if (node._flag & FLAG_READER) {
                let wrap = node._args;
                if (wrap !== null && wrap._reader !== undefined) {
                    wrap._reader._flag = FLAG_DISPOSED;
                    wrap._reader._node = null;
                }
                node._flag &= ~FLAG_READER;
            }
            node._fn = node._args = null;
        }
        notify(node, FLAG_STALE);
        start();
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
     * @type {Owner | null}
     */
    this._owner = null;
    /**
     * @type {(function(*): boolean) | Array<(function(*): boolean)> | null}
     */
    this._recover = null;
    /**
     * @type {W | undefined}
     */
    this._args = args;
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
        let owned = this._owned;

        /** Pre-execution cleanup for non-setup runs */
        if (!(flag & FLAG_SETUP) && (owned !== null || this._cleanup !== null)) {
            clearOwned(this);
        }

        /** Async nodes delegate before modifying scope state */
        if (flag & (FLAG_ASYNC | FLAG_STREAM)) {
            return this._updateAsync(time);
        }

        /** @type {(function(): void) | null | undefined} */
        let value;
        let prevRunning = RUNNING;
        let prevState = STATE;
        /** Branchless: FLAG_SCOPE (1<<16) >> 15 == STATE_OWN (1<<1) when set. */
        let ownBit = (flag >> 15) & STATE_OWN;
        RUNNING = this;

        if ((flag & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE) {
            /** Stable or bound: no version tracking, no dep management */
            STATE = ownBit;
            this._flag |= FLAG_RUNNING;
            try {
                value = (flag & FLAG_BOUND)
                    ? this._fn(this._dep1.val(), this._args)
                    : this._fn(this._args);
            } finally {
                this._time = time;
                this._flag &= ~(FLAG_RUNNING | FLAG_STALE | FLAG_PENDING);
                STATE = prevState;
                RUNNING = prevRunning;
            }
        } else {
            STATE = STATE_LISTEN | ownBit;
            /** Setup or dynamic: bump RVER for dep tracking. Effects have
             *  no sender role, so no per-node _version field — RVER carries
             *  the current tracking stamp directly. */
            let prevRVer = RVER;
            let version = VERSION += 2;
            RVER = version;
            let saveStart = VCOUNT;
            let depCount = 0;
            let dep1 = this._dep1;
            let depsLen = 0;
            let prevReused = REUSED;

            /** Save DSTACK base for setup */
            let prevDBase = DBASE;
            if (flag & FLAG_SETUP) {
                DBASE = DCOUNT;
            }

            if (!(flag & FLAG_SETUP)) {
                /** Dynamic: prescan existing deps with version - 1 */
                this._flag |= FLAG_RUNNING;
                REUSED = 0;
                let stamp = version - 1;
                if (dep1 !== null) {
                    let depver = dep1._version;
                    if (depver > TRANSACTION) {
                        VSTACK[VCOUNT++] = dep1;
                        VSTACK[VCOUNT++] = depver;
                    }
                    dep1._version = stamp;
                    depCount = 1;
                }
                let deps = this._deps;
                if (deps !== null) {
                    depsLen = deps.length;
                    for (let i = 0; i < depsLen; i += 2) {
                        let dep = /** @type {Sender} */(deps[i]);
                        let depver = dep._version;
                        if (depver > TRANSACTION) {
                            VSTACK[VCOUNT++] = dep;
                            VSTACK[VCOUNT++] = depver;
                        }
                        dep._version = stamp;
                    }
                    depCount += depsLen >> 1;
                }
            }

            try {
                value = this._fn(this._args);
            } finally {
                /** Reconcile deps (dynamic only) */
                if (!(flag & FLAG_SETUP) && (REUSED !== depCount || (this._deps !== null ? this._deps.length : 0) !== depsLen)) {
                    pruneDeps(this, version, depCount);
                }

                /** Create exact-capacity _deps from DSTACK (setup only) */
                if (DCOUNT > DBASE) {
                    this._deps = DSTACK.slice(DBASE, DCOUNT);
                    DCOUNT = DBASE;
                }
                DBASE = prevDBase;

                REUSED = prevReused;
                /** Restore saved version tags from VSTACK (both setup and dynamic) */
                if (VCOUNT > saveStart) {
                    for (let i = VCOUNT - 2; i >= saveStart; i -= 2) {
                        VSTACK[i]._version = VSTACK[i + 1];
                    }
                    VCOUNT = saveStart;
                }
                RVER = prevRVer;
                this._time = time;
                this._flag &= ~(FLAG_RUNNING | FLAG_STALE | FLAG_PENDING | FLAG_INIT | FLAG_SETUP);
                STATE = prevState;
                RUNNING = prevRunning;
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
        /** Unwrap a stale reader left by a prior run (see reader()) */
        if (flag & FLAG_READER) {
            let wrap = this._args;
            if (wrap !== null && wrap._reader !== undefined) {
                wrap._reader._flag = FLAG_DISPOSED;
                wrap._reader._node = null;
                this._args = wrap._args;
            }
            flag &= ~FLAG_READER;
            this._flag = flag;
        }
        let value;
        let prevRunning = RUNNING;
        let prevState = STATE;
        /** Branchless: FLAG_SCOPE (1<<16) >> 15 == STATE_OWN (1<<1) when set. */
        let ownBit = (flag >> 15) & STATE_OWN;
        RUNNING = this;

        if ((flag & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE) {
            STATE = ownBit;
            this._flag |= FLAG_RUNNING;
            try {
                value = (flag & FLAG_BOUND)
                    ? this._fn(this._dep1.val(), this._args)
                    : this._fn(this._args);
            } finally {
                this._time = time;
                this._flag &= ~(FLAG_RUNNING | FLAG_STALE | FLAG_PENDING);
                STATE = prevState;
                RUNNING = prevRunning;
            }
        } else {
            STATE = STATE_LISTEN | ownBit;
            let prevRVer = RVER;
            let version = VERSION += 2;
            RVER = version;
            let saveStart = VCOUNT;
            let depCount = 0;
            let dep1 = this._dep1;
            let depsLen = 0;
            let prevReused = REUSED;

            let prevDBase = DBASE;
            if (flag & FLAG_SETUP) {
                DBASE = DCOUNT;
            }

            if (!(flag & FLAG_SETUP)) {
                this._flag |= FLAG_RUNNING;
                REUSED = 0;
                let stamp = version - 1;
                if (dep1 !== null) {
                    let depver = dep1._version;
                    if (depver > TRANSACTION) {
                        VSTACK[VCOUNT++] = dep1;
                        VSTACK[VCOUNT++] = depver;
                    }
                    dep1._version = stamp;
                    depCount = 1;
                }
                let deps = this._deps;
                if (deps !== null) {
                    depsLen = deps.length;
                    for (let i = 0; i < depsLen; i += 2) {
                        let dep = /** @type {Sender} */(deps[i]);
                        let depver = dep._version;
                        if (depver > TRANSACTION) {
                            VSTACK[VCOUNT++] = dep;
                            VSTACK[VCOUNT++] = depver;
                        }
                        dep._version = stamp;
                    }
                    depCount += depsLen >> 1;
                }
            }

            try {
                value = this._fn(this._args);
            } finally {
                if (!(flag & FLAG_SETUP) && (REUSED !== depCount || (this._deps !== null ? this._deps.length : 0) !== depsLen)) {
                    pruneDeps(this, version, depCount);
                }
                if (DCOUNT > DBASE) {
                    this._deps = DSTACK.slice(DBASE, DCOUNT);
                    DCOUNT = DBASE;
                }
                DBASE = prevDBase;
                REUSED = prevReused;
                if (VCOUNT > saveStart) {
                    for (let i = VCOUNT - 2; i >= saveStart; i -= 2) {
                        VSTACK[i]._version = VSTACK[i + 1];
                    }
                    VCOUNT = saveStart;
                }
                RVER = prevRVer;
                this._time = time;
                this._flag &= ~(FLAG_RUNNING | FLAG_STALE | FLAG_PENDING | FLAG_INIT | FLAG_SETUP);
                STATE = prevState;
                RUNNING = prevRunning;
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
        this._flag = FLAG_DISPOSED;
        clearDeps(this);
        clearOwned(this);
        this._fn =
            this._args =
            this._owned =
            this._cleanup =
            this._owner = null;
    };

    /**
     * @returns {void}
     */
    EffectProto._receive = function () {
        if (this._owned === null) {
            EFFECTS[EFFECTS_COUNT++] = this;
        } else {
            let level = this._level;
            let count = LEVELS[level];
            SCOPES[level][count] = this;
            LEVELS[level] = count + 1;
            SCOPES_COUNT++;
        }
    };

    /**
     * Registers a dep link. Called from val() when tracking is active.
     * Shared impl — see _read function above.
     */
    EffectProto._read = _read;

}



/**
 * @param {!Effect} node
 * @returns {void}
 */
function startEffect(node) {
    if (IDLE) {
        IDLE = false;
        try {
            TRANSACTION = VERSION;
            node._update(TIME);
            if (SIGNALS_COUNT > 0 || DISPOSES_COUNT > 0) {
                start();
            }
        } catch (err) {
            let recovered = tryRecover(node, err);
            node._dispose();
            if (!recovered) {
                throw err;
            }
        } finally {
            IDLE = true;
        }
    } else {
        try {
            node._update(TIME);
        } catch (err) {
            let recovered = tryRecover(node, err);
            node._dispose();
            if (!recovered) {
                throw err;
            }
        }
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
 * @returns {void}
 */
function start() {
    /** @type {number} */
    let time = 0;
    /** @type {number} */
    let cycle = 0;
    /** @type {*} */
    let error = null;
    /** @type {boolean} */
    let thrown = false;
    IDLE = false;
    try {
        do {
            time = ++TIME;
            if (DISPOSES_COUNT > 0) {
                let count = DISPOSES_COUNT;
                for (let i = 0; i < count; i++) {
                    DISPOSES[i]._dispose();
                    DISPOSES[i] = null;
                }
                DISPOSES_COUNT = 0;
            }
            if (SIGNALS_COUNT > 0) {
                let count = SIGNALS_COUNT;
                for (let i = 0; i < count; i++) {
                    SIGNALS[i]._update(PAYLOADS[i]);
                    SIGNALS[i] = PAYLOADS[i] = null;
                }
                SIGNALS_COUNT = 0;
            }
            if (COMPUTES_COUNT > 0) {
                for (let i = 0; i < COMPUTES_COUNT; i++) {
                    let node = COMPUTES[i];
                    if (node._flag & FLAG_STALE) {
                        TRANSACTION = VERSION;
                        node._update(time);
                    }
                    COMPUTES[i] = null;
                }
                COMPUTES_COUNT = 0;
            }
            if (SCOPES_COUNT > 0) {
                let levels = LEVELS.length;
                for (let i = 0; i < levels; i++) {
                    let count = LEVELS[i];
                    let effects = SCOPES[i];
                    for (let j = 0; j < count; j++) {
                        let node = effects[j];
                        if ((node._flag & FLAG_STALE) || ((node._flag & FLAG_PENDING) && needsUpdate(node, time))) {
                            try {
                                TRANSACTION = VERSION;
                                node._update(time);
                            } catch (err) {
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
                    LEVELS[i] = 0;
                }
                SCOPES_COUNT = 0;
            }
            if (EFFECTS_COUNT > 0) {
                let count = EFFECTS_COUNT;
                for (let i = 0; i < count; i++) {
                    let node = EFFECTS[i];
                    EFFECTS[i] = null;
                    if ((node._flag & FLAG_STALE) || ((node._flag & FLAG_PENDING) && needsUpdate(node, time))) {
                        TRANSACTION = VERSION;
                        try {
                            node._update(time);
                        } catch (err) {
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
                }
                EFFECTS_COUNT = 0;
            }
            if (cycle++ === 1e5) {
                error = new Error('Runaway cycle');
                thrown = true;
                break;
            }
        } while (
            !thrown &&
            (SIGNALS_COUNT > 0 ||
                DISPOSES_COUNT > 0)
        );
    } finally {
        IDLE = true;
        if (SCOPES_COUNT > 0) {
            let levels = LEVELS.length;
            for (let i = 0; i < levels; i++) {
                LEVELS[i] = 0;
            }
        }
        DISPOSES_COUNT =
            SIGNALS_COUNT =
            COMPUTES_COUNT =
            EFFECTS_COUNT =
            SCOPES_COUNT = 0;
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
    let subslot = -1;
    if (send._sub1 === null) {
        send._sub1 = receive;
        send._sub1slot = depslot;
        /* subslot = -1 */
    } else if (send._subs === null) {
        subslot = 0;
        send._subs = [receive, depslot];
    } else {
        subslot = send._subs.length;
        send._subs.push(receive, depslot);
    }
    return subslot;
}

/**
 * @param {Sender} send
 * @param {number} slot
 * @returns {void}
 */
function clearReceiver(send, slot) {
    if (slot === -1) {
        send._sub1 = null;
    } else {
        let subs = send._subs;
        let lastSlot = /** @type {number} */(subs.pop());
        let lastNode = /** @type {Receiver} */(subs.pop());
        if (slot !== subs.length) {
            subs[slot] = lastNode;
            subs[slot + 1] = lastSlot;
            if (lastSlot === -1) {
                lastNode._dep1slot = slot;
            } else {
                lastNode._deps[lastSlot + 1] = slot;
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
    if (slot === -1) {
        receive._dep1 = null;
    } else {
        let deps = receive._deps;
        let lastSlot = /** @type {number} */(deps.pop());
        let lastNode = /** @type {Sender} */(deps.pop());
        if (slot !== deps.length) {
            deps[slot] = lastNode;
            deps[slot + 1] = lastSlot;
            if (lastSlot === -1) {
                lastNode._sub1slot = slot;
            } else {
                lastNode._subs[lastSlot + 1] = slot;
            }
        }
    }
}

/**
 * Removes receive from all its deps' subscriber lists.
 * @param {Receiver} receive
 * @returns {void}
 */
function clearDeps(receive) {
    if (receive._dep1 !== null) {
        clearReceiver(receive._dep1, receive._dep1slot);
        receive._dep1 = null;
    }
    let deps = receive._deps;
    if (deps !== null) {
        let count = deps.length;
        for (let i = 0; i < count; i += 2) {
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
    if (send._sub1 !== null) {
        clearSender(send._sub1, send._sub1slot);
        send._sub1 = null;
    }
    let subs = send._subs;
    if (subs !== null) {
        let count = subs.length;
        for (let i = 0; i < count; i += 2) {
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
    let owned = owner._owned;
    if (owned !== null) {
        let count = owned.length;
        while (count-- > 0) {
            owned.pop()._dispose();
        }
    }
    let cleanup = owner._cleanup;
    if (cleanup !== null) {
        if (typeof cleanup === 'function') {
            cleanup();
            owner._cleanup = null;
        } else {
            let count = cleanup.length;
            while (count-- > 0) {
                cleanup.pop()();
            }
        }
    }
    owner._recover = null;
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
 * Registers a dependency link from sender -> this (the tracking node).
 * Defined as a shared prototype method on Compute and Effect so `this`
 * is monomorphic at the call site inside the function body, avoiding
 * the polymorphic property access cost of a standalone log() helper.
 *
 * Invariants at entry (guaranteed by the call-site guard in val()):
 *   - STATE & STATE_LISTEN !== 0  (this is tracking)
 *   - sender._version !== RVER  (not already tracked this run)
 * Stable non-setup nodes don't set STATE_LISTEN, so _read is never
 * invoked for them. RVER is the current tracking version — set by
 * _update on entry, restored on exit. Used as the stamp on senders.
 *
 * @this {Receiver}
 * @param {Sender} sender
 * @returns {void}
 */
function _read(sender) {
    let version = RVER;
    let stamp = sender._version;
    sender._version = version;

    /** Reuse: was our dep last run, visited again this run — O(1) */
    if (stamp === version - 1) {
        REUSED++;
        return;
    }

    /**
     * Conflict: tagged by some other running node in this execution
     * tree. Save [sender, version] to global VSTACK for restoration.
     */
    if (stamp > TRANSACTION) {
        VSTACK[VCOUNT++] = sender;
        VSTACK[VCOUNT++] = stamp;
    }

    if (this._flag & FLAG_SETUP) {
        connect(this, sender);
    } else if (this._deps === null) {
        this._deps = [sender, 0];
    } else {
        this._deps.push(sender, 0);
    }
}

/**
 * Setup-mode dependency connection. Writes deps to DSTACK instead
 * of creating/growing _deps arrays directly. After the fn returns,
 * _update slices DSTACK to create an exact-capacity _deps array.
 * @param {Receiver} receiver
 * @param {Sender} sender
 */
function connect(receiver, sender) {
    if (receiver._dep1 === null) {
        let subslot = subscribe(sender, receiver, -1);
        receiver._dep1 = sender;
        receiver._dep1slot = subslot;
    } else {
        let depslot = DCOUNT - DBASE;
        let subslot = subscribe(sender, receiver, depslot);
        DSTACK[DCOUNT++] = sender;
        DSTACK[DCOUNT++] = subslot;
    }
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
                node._dep1slot = subscribe(/** @type {Sender} */(deps[ni]), node, -1);
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
            let subslot = subscribe(newDep, node, i);
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
                    if (tSlot === -1) {
                        tDep._sub1slot = i;
                    } else {
                        tDep._subs[tSlot + 1] = i;
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
        let subslot = subscribe(dep, node, tail);
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
        if (slot === -1) {
            dep._sub1slot = -1;
        } else {
            dep._subs[slot + 1] = -1;
        }
        node._deps = null;
    } else {
        deps.length = tail;
    }
}

/**
 * @param {Sender} node
 * @param {number} flag
 */
function notify(node, flag) {
    /** @type {Receiver} */
    let sub = node._sub1;
    if (sub !== null) {
        let flags = sub._flag;
        sub._flag |= flag;
        if (!(flags & (FLAG_PENDING | FLAG_STALE))) {
            sub._receive();
        }
    }
    /** @type {Array<Receiver | number> | null} */
    let subs = node._subs;
    if (subs !== null) {
        let count = subs.length;
        for (let i = 0; i < count; i += 2) {
            sub = /** @type {Receiver} */(subs[i]);
            let flags = sub._flag;
            sub._flag |= flag;
            if (!(flags & (FLAG_PENDING | FLAG_STALE))) {
                sub._receive();
            }
        }
    }
}

/**
 * Cold-path adoption helper for computes. Only called when STATE_OWN
 * is active — kept out of the hot factory body so V8 can compile
 * `compute()` etc. assuming RUNNING is never read.
 * @param {!Compute | !Root} node
 * @returns {void}
 */
function adoptCompute(node) {
    addOwned(/** @type {Owner} */(RUNNING), /** @type {Receiver} */(node));
}

/**
 * Cold-path adoption helper for effects — also records `_owner` on
 * the node for recovery walk-up.
 * @param {!Effect} node
 * @returns {void}
 */
function adoptEffect(node) {
    let owner = /** @type {Owner} */(RUNNING);
    addOwned(owner, node);
    node._owner = owner;
}

/**
 * Cold-path adoption helper for scope effects — adopts and, when the
 * owner is a receiver, establishes a level for topological scheduling.
 * @param {!Effect} node
 * @returns {void}
 */
function adoptScope(node) {
    let owner = /** @type {Owner} */(RUNNING);
    addOwned(owner, node);
    node._owner = owner;
    if (owner.t & TYPEFLAG_RECEIVE) {
        setScope(node, /** @type {Effect} */(owner));
    }
}

/**
 * @param {function(): ((function(): void) | void)} fn
 * @returns {Root}
 */
function root(fn) {
    let node = new Root();
    if (STATE & STATE_OWN) {
        adoptCompute(node);
    }
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
    if (STATE & STATE_OWN) {
        adoptCompute(node);
    }
    if (!(flag & FLAG_DEFER)) {
        startCompute(node);
    }
    return node;
}

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
    let node;
    if (typeof fnOrDep === 'function') {
        node = new Compute(FLAG_STABLE | FLAG_SETUP, fnOrDep, null, seedOrFn, argsOrSeed);
    } else {
        node = new Compute(FLAG_STABLE | FLAG_BOUND, seedOrFn, fnOrDep, argsOrSeed, args);
        node._dep1slot = subscribe(fnOrDep, node, -1);
    }
    if (STATE & STATE_OWN) {
        adoptCompute(node);
    }
    startCompute(node);
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
    let node;
    if (typeof fnOrDep === 'function') {
        node = new Compute(FLAG_STABLE | FLAG_SETUP | FLAG_NOTIFY, fnOrDep, null, seedOrFn, argsOrSeed);
    } else {
        node = new Compute(FLAG_STABLE | FLAG_BOUND | FLAG_NOTIFY, seedOrFn, fnOrDep, argsOrSeed, args);
        node._dep1slot = subscribe(fnOrDep, node, -1);
    }
    if (STATE & STATE_OWN) {
        adoptCompute(node);
    }
    startCompute(node);
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
    if (STATE & STATE_OWN) {
        adoptCompute(node);
    }
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
    if (STATE & STATE_OWN) {
        adoptEffect(node);
    }
    startEffect(node);
    return node;
}

/**
 * Scoped effect — owns nested reactive nodes and disposes them
 * together. Distinguished from `effect()` by FLAG_SCOPE.
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
    node._owned = [];
    if (STATE & STATE_OWN) {
        adoptScope(node);
    }
    startEffect(node);
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
    if (STATE & STATE_OWN) {
        adoptEffect(node);
    }
    startEffect(node);
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
    let node;
    if (typeof fnOrDep === 'function') {
        node = new Effect(FLAG_STABLE | FLAG_SETUP, fnOrDep, null, fnOrArgs);
    } else {
        node = new Effect(FLAG_STABLE | FLAG_BOUND, fnOrArgs, fnOrDep, args);
        node._dep1slot = subscribe(fnOrDep, node, -1);
    }
    if (STATE & STATE_OWN) {
        adoptEffect(node);
    }
    startEffect(node);
    return node;
}

/**
 * Inside a compute/effect fn, declares that the current node's output
 * is (or is not) semantically equal to its previous value. Silent
 * no-op if called outside a tracking context.
 * @param {boolean=} eq
 * @returns {void}
 */
function equal(eq) {
    if ((STATE & STATE_LISTEN) === 0) {
        return;
    }
    if (eq === false) {
        RUNNING._flag = (RUNNING._flag | FLAG_NOTEQUAL) & ~FLAG_EQUAL;
    } else {
        RUNNING._flag = (RUNNING._flag | FLAG_EQUAL) & ~FLAG_NOTEQUAL;
    }
}

/**
 * Inside a compute/effect fn, marks the current node as stable so
 * subsequent runs skip dep tracking. Silent no-op outside a context.
 * @returns {void}
 */
function stable() {
    if ((STATE & STATE_LISTEN) === 0) {
        return;
    }
    RUNNING._flag |= FLAG_STABLE;
}

/**
 * Registers a cleanup fn on the current node. Valid inside any
 * compute/effect/root/scope fn body. Silent no-op if no context.
 * @param {function(): void} fn
 * @returns {void}
 */
function cleanup(fn) {
    if ((STATE & (STATE_LISTEN | STATE_OWN)) === 0) {
        return;
    }
    addCleanup(/** @type {Owner} */(RUNNING), fn);
}

/**
 * Registers a recover handler on the current node. Silent no-op if
 * no context.
 * @param {function(*): boolean} fn
 * @returns {void}
 */
function recover(fn) {
    if ((STATE & (STATE_LISTEN | STATE_OWN)) === 0) {
        return;
    }
    addRecover(/** @type {Owner} */(RUNNING), fn);
}

/**
 * Allocates a Reader that persists the current tracking context
 * across an async boundary. Inside a task/spawn fn, call reader()
 * to get a handle; later, from a .then/.next callback, use
 * `rdr.read(sig)` to register a dep on the owning node.
 *
 * The reader is invalidated when the owning node next updates or
 * is disposed — further .read() calls throw. Idempotent within a
 * single run: the same Reader is returned for repeated reader() calls.
 *
 * @returns {Reader}
 */
function reader() {
    let node = /** @type {Receiver} */(RUNNING);
    if ((STATE & STATE_LISTEN) === 0 || !(node._flag & (FLAG_ASYNC | FLAG_STREAM))) {
        throw new Error('reader() requires an async receiver context');
    }
    let nodeFlag = node._flag;
    if (nodeFlag & FLAG_READER) {
        /** Already upgraded this run — return the existing reader */
        return /** @type {Reader} */(node._args._reader);
    }
    let rdr = new Reader();
    rdr._node = node;
    rdr._flag = 0;
    /** Upgrade _args: wrap original user args alongside the reader */
    node._args = { _reader: rdr, _args: node._args };
    node._flag = nodeFlag | FLAG_READER;
    return rdr;
}

/**
 * @param {function(): void} fn
 * @returns {void}
 */
function batch(fn) {
    if (IDLE) {
        IDLE = false;
        try {
            fn();
            start();
        } finally {
            IDLE = true;
        }
    } else {
        fn();
    }
}

export {
    FLAG_DEFER, FLAG_STABLE, FLAG_SETUP, FLAG_STALE, FLAG_PENDING,
    FLAG_RUNNING, FLAG_DISPOSED, FLAG_LOADING, FLAG_ERROR, FLAG_RECOVER,
    FLAG_BOUND, FLAG_DERIVED, FLAG_SCOPE, FLAG_READER,
    FLAG_NOTIFY as FLAG_NOTIFY, FLAG_EQUAL, FLAG_WEAK,
    FLAG_INIT, FLAG_NOTIFY as FLAG_TRANSMIT,
    OP_VALUE, OP_CALLBACK,
    register,
    CTX_EQUAL, CTX_NOTEQUAL, CTX_PROMISE, CTX_ITERABLE, CTX_ASYNC,
    FLAG_ASYNC, FLAG_STREAM,
    OPT_DEFER, OPT_STABLE, OPT_SETUP, OPT_NOTIFY, OPT_WEAK, OPT_DYNAMIC,
    TYPE_ROOT, TYPE_SIGNAL, TYPE_COMPUTE, TYPE_EFFECT,
    TYPEFLAG_MASK, TYPEFLAG_SEND, TYPEFLAG_RECEIVE, TYPEFLAG_OWNER,
    STATE_LISTEN, STATE_OWN,
    OPTIONS,
    IDLE,
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
    batch,
    reader,
    equal,
    stable,
    cleanup,
    recover
}
